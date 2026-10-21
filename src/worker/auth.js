// 登録、ログイン（パスワード・パスキー）、セッションと端末のトークン。
// セッションと端末のトークンは32バイトの乱数で、D1 には SHA-256 だけを置く。パスワードは PBKDF2-SHA256
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import { StoreError } from '../shared/store.js';
import { recordLogin } from './history.js';

const enc = new TextEncoder();
const MINUTE = 60_000;
const DAY = 86_400_000;
const LIFETIME = { web: 30 * DAY, device: 365 * DAY };
export const COOKIE = '__Host-twimark';
// PBKDF2 の反復回数の既定。wrangler.jsonc の vars.PBKDF2_ITERATIONS で変えられる。
// 手元の workerd は60万回も受け付けた（2026-10-21）が、Free プランの CPU は1リクエスト10ms で、10万回で約40ms かかる。
// 上限に当たると保存の前に止まるので、登録できなければ回数を下げる。使った回数は利用者ごとに password_iterations に残る
export const PBKDF2_ITERATIONS = 100_000;
export const iterationsOf = (env) => {
  const n = Number(env?.PBKDF2_ITERATIONS);
  return Number.isInteger(n) && n >= 10_000 && n <= 1_000_000 ? n : PBKDF2_ITERATIONS;
};
const LOCK = { failures: 5, window: 15 * MINUTE };
// PC のブラウザから iPhone のパスキーを使う（QR コードとBluetoothでつなぐ）と時間がかかるので、待ち時間を長めにとる
const PASSKEY_TIMEOUT = 5 * MINUTE;
const CHALLENGE_TTL = 10 * MINUTE;
// 広く使える ES256 と RS256 だけを出す（ライブラリの既定は ML-DSA と Ed25519 を先に並べる）
const ALGORITHMS = [-7, -257];

const now = () => new Date().toISOString();
const later = (ms) => new Date(Date.now() + ms).toISOString();

export function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
export async function sha256(text) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 長さが同じなら、どこで違っても同じ時間で比べる
function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64url(salt), iterations }, key, 256);
  return b64url(new Uint8Array(bits));
}
export async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
  const salt = randomToken(16);
  return { hash: await derive(password, salt, iterations), salt, iterations };
}

export function checkLogin(raw) {
  const login = typeof raw === 'string' ? raw.trim() : '';
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(login)) throw new StoreError('invalid_login', 'ID は3〜32文字の英数字と _ - で入れてください。');
  return login;
}
export function checkPassword(raw) {
  if (typeof raw !== 'string' || raw.length < 10 || raw.length > 200) throw new StoreError('invalid_password', 'パスワードは10文字以上（200文字まで）で入れてください。');
  return raw;
}

// ---- セッション ----

// app はアプリのトークン（device だけ）。設定の操作もできる
export async function createSession(db, uid, kind, name, app = false) {
  const token = randomToken();
  const id = randomToken(12);
  const t = now();
  await db.prepare('INSERT INTO sessions (id, token_hash, user_id, kind, name, created_at, expires_at, last_used_at, app) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, await sha256(token), uid, kind, String(name).slice(0, 40), t, later(LIFETIME[kind]), t, app && kind === 'device' ? 1 : 0)
    .run();
  return { id, token };
}

export const sessionCookie = (token) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${LIFETIME.web / 1000}`;
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

function readCookie(request) {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return '';
}

// { sessionId, userId, login, role, kind, app, via } か null。Bearer は端末のトークンだけ、Cookie は web のセッションだけを受ける
export async function authenticate(request, db) {
  const header = request.headers.get('authorization') ?? '';
  const via = header.startsWith('Bearer ') ? 'bearer' : 'cookie';
  const token = via === 'bearer' ? header.slice(7).trim() : readCookie(request);
  if (!token) return null;
  const row = await db.prepare('SELECT s.id, s.user_id, s.kind, s.app, s.expires_at, s.last_used_at, u.login, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?')
    .bind(await sha256(token))
    .first();
  if (!row || row.expires_at <= now() || row.kind !== (via === 'bearer' ? 'device' : 'web')) return null;
  // 使うたびに期限を延ばす（書き込みは1時間に1回まで）
  if (Date.now() - Date.parse(row.last_used_at) > 60 * MINUTE) {
    await db.prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE id = ?').bind(now(), later(LIFETIME[row.kind]), row.id).run();
  }
  return { sessionId: row.id, userId: row.user_id, login: row.login, role: row.role, kind: row.kind, app: row.app === 1, via };
}

// ---- 登録とパスワードのログイン ----

// users が0件のときだけ、管理者（owner）として作る。1つの文で確かめて入れるので、同時に2人は作れない
export async function setup(db, body, iterations) {
  const login = checkLogin(body?.login);
  const password = checkPassword(body?.password);
  const p = await hashPassword(password, iterations);
  const res = await db.prepare("INSERT INTO users (login, password_hash, password_salt, password_iterations, created_at, role) SELECT ?, ?, ?, ?, ?, 'owner' WHERE NOT EXISTS (SELECT 1 FROM users)")
    .bind(login, p.hash, p.salt, p.iterations, now())
    .run();
  if (!res.meta?.changes) throw new StoreError('setup_closed', '登録はもう締め切られています。');
  return (await db.prepare('SELECT id FROM users WHERE login = ?').bind(login).first()).id;
}

// ログインの要求に device（アプリの名前）が付いていればアプリ、なければ Web
export const deviceName = (body) => (typeof body?.device === 'string' && body.device.trim() ? body.device.trim() : null);
export const clientOf = (body) => (deviceName(body) ? 'app' : 'web');

async function isLocked(db, login) {
  const r = await db.prepare('SELECT count(*) AS n FROM login_failures WHERE login = ? AND failed_at > ?').bind(login, new Date(Date.now() - LOCK.window).toISOString()).first();
  return r.n >= LOCK.failures;
}
const lockedError = () => new StoreError('locked', 'ログインの失敗が続いたため、15分ほどログインできません。');
const wrongError = () => new StoreError('wrong_password', 'ID かパスワードが違います。');

// 成功も失敗も、その ID の利用者がいれば履歴に残す（ない ID の試みは残さない）
export async function loginWithPassword(request, db, body, iterations) {
  const login = typeof body?.login === 'string' ? body.login.trim().slice(0, 32) : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const user = await db.prepare('SELECT id, password_hash, password_salt, password_iterations FROM users WHERE login = ?').bind(login).first();
  const record = (result, reason) => (user ? recordLogin(db, request, user.id, { result, method: 'password', client: clientOf(body), reason }) : null);
  if (await isLocked(db, login)) {
    await record('failure', 'locked');
    throw lockedError();
  }
  // ID がないときも同じだけ計算して、時間で ID の有無を知られないようにする
  const hash = await derive(password, user?.password_salt ?? 'AAAAAAAAAAAAAAAAAAAAAA', user?.password_iterations ?? iterations);
  if (!user || !sameText(hash, user.password_hash)) {
    // ロックに使わなくなった古い行は、そのたびに消す（ない ID で失敗を続けられても増え続けないように）
    await db.batch([
      db.prepare('DELETE FROM login_failures WHERE failed_at < ?').bind(new Date(Date.now() - LOCK.window).toISOString()),
      db.prepare('INSERT INTO login_failures (login, failed_at) VALUES (?, ?)').bind(login, now()),
    ]);
    await record('failure', 'wrong_password');
    throw wrongError();
  }
  await db.prepare('DELETE FROM login_failures WHERE login = ? OR failed_at < ?').bind(login, new Date(Date.now() - LOCK.window).toISOString()).run();
  await record('success');
  return user.id;
}

export async function changePassword(db, auth, body, iterations) {
  const user = await db.prepare('SELECT password_hash, password_salt, password_iterations FROM users WHERE id = ?').bind(auth.userId).first();
  const current = typeof body?.current === 'string' ? body.current : '';
  if (!sameText(await derive(current, user.password_salt, user.password_iterations), user.password_hash)) throw new StoreError('wrong_password', '今のパスワードが違います。');
  const p = await hashPassword(checkPassword(body?.next), iterations);
  // 変えたら、今のセッションのほかはすべて消す
  await db.batch([
    db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ? WHERE id = ?').bind(p.hash, p.salt, p.iterations, auth.userId),
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(auth.userId, auth.sessionId),
  ]);
}

// ---- パスキー ----

// rpID はリクエストのホスト名、origin はリクエストのオリジン（workers.dev は Public Suffix List にあるので、ホスト名そのものが rpID になる）
const rpOf = (request) => {
  const url = new URL(request.url);
  return { rpID: url.hostname, origin: url.origin };
};

async function saveChallenge(db, uid, purpose, challenge) {
  const id = randomToken(12);
  await db.batch([
    db.prepare('DELETE FROM challenges WHERE expires_at < ?').bind(now()),
    db.prepare('INSERT INTO challenges (id, user_id, purpose, challenge, expires_at) VALUES (?, ?, ?, ?, ?)').bind(id, uid, purpose, challenge, later(CHALLENGE_TTL)),
  ]);
  return id;
}
// 使ったチャレンジは、成否にかかわらず消す
async function takeChallenge(db, id, purpose) {
  const row = await db.prepare('SELECT user_id, challenge, expires_at FROM challenges WHERE id = ? AND purpose = ?').bind(String(id ?? ''), purpose).first();
  if (row) await db.prepare('DELETE FROM challenges WHERE id = ?').bind(String(id)).run();
  if (!row || row.expires_at < now()) throw new StoreError('challenge_expired', '時間が経ちすぎました。もう一度やり直してください。');
  return row;
}

// ライブラリの理由（英語）も添えて返す。どこで弾かれたかを利用者の画面から分かるように
const passkeyError = (err) => new StoreError('passkey_failed', `パスキーを確かめられませんでした（${String(err?.message ?? err).slice(0, 200)}）。`);

const passkeysOf = async (db, uid) => (await db.prepare('SELECT id, transports FROM passkeys WHERE user_id = ?').bind(uid).all()).results.map((r) => ({ id: r.id, transports: JSON.parse(r.transports) }));

export async function passkeyRegisterOptions(request, db, auth) {
  const { rpID } = rpOf(request);
  const options = await generateRegistrationOptions({
    rpName: 'Twimark',
    rpID,
    userName: auth.login,
    userDisplayName: auth.login,
    userID: enc.encode(String(auth.userId)),
    timeout: PASSKEY_TIMEOUT,
    attestationType: 'none',
    supportedAlgorithmIDs: ALGORITHMS,
    excludeCredentials: await passkeysOf(db, auth.userId),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });
  return { challengeId: await saveChallenge(db, auth.userId, 'register', options.challenge), options };
}

export async function passkeyRegister(request, db, auth, body) {
  const row = await takeChallenge(db, body?.challengeId, 'register');
  if (row.user_id !== auth.userId) throw new StoreError('challenge_expired', 'もう一度やり直してください。');
  const { rpID, origin } = rpOf(request);
  let result;
  try {
    result = await verifyRegistrationResponse({ response: body?.response, expectedChallenge: row.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false, supportedAlgorithmIDs: ALGORITHMS });
  } catch (err) {
    throw passkeyError(err);
  }
  if (!result.verified) throw new StoreError('passkey_failed', 'パスキーを確かめられませんでした。');
  const { credential } = result.registrationInfo;
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 40) : 'パスキー';
  await db.prepare('INSERT INTO passkeys (id, user_id, public_key, counter, transports, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(credential.id, auth.userId, b64url(credential.publicKey), credential.counter, JSON.stringify(credential.transports ?? []), name, now())
    .run();
}

// その ID にパスキーがあれば、認証のオプションを返す。ID がないときは、パスキーのない ID と同じ形で返す
export async function loginStart(request, db, body) {
  const login = typeof body?.login === 'string' ? body.login.trim().slice(0, 32) : '';
  const user = await db.prepare('SELECT id FROM users WHERE login = ?').bind(login).first();
  const allow = user ? await passkeysOf(db, user.id) : [];
  if (allow.length === 0) return { passkey: false };
  const options = await generateAuthenticationOptions({ rpID: rpOf(request).rpID, allowCredentials: allow, userVerification: 'preferred', timeout: PASSKEY_TIMEOUT });
  return { passkey: true, challengeId: await saveChallenge(db, user.id, 'login', options.challenge), options };
}

// チャレンジが分かれば利用者が分かるので、そこからあとの成功と失敗を履歴に残す
export async function loginWithPasskey(request, db, body) {
  const row = await takeChallenge(db, body?.challengeId, 'login');
  const record = (result, reason) => recordLogin(db, request, row.user_id, { result, method: 'passkey', client: clientOf(body), reason });
  const id = typeof body?.response?.id === 'string' ? body.response.id : '';
  const key = await db.prepare('SELECT id, public_key, counter, transports FROM passkeys WHERE id = ? AND user_id = ?').bind(id, row.user_id).first();
  if (!key) {
    await record('failure', 'passkey_unknown');
    throw new StoreError('passkey_failed', 'このパスキーは登録されていません。');
  }
  const { rpID, origin } = rpOf(request);
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: row.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: { id: key.id, publicKey: fromB64url(key.public_key), counter: key.counter, transports: JSON.parse(key.transports) },
      requireUserVerification: false,
    });
  } catch (err) {
    await record('failure', 'passkey_failed');
    throw passkeyError(err);
  }
  if (!result.verified) {
    await record('failure', 'passkey_failed');
    throw new StoreError('passkey_failed', 'パスキーを確かめられませんでした。');
  }
  await db.prepare('UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?').bind(result.authenticationInfo.newCounter, now(), key.id).run();
  await record('success');
  return row.user_id;
}
