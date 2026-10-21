// Twimark の API。/api/* だけを受け、ほかは静的アセット（build/site）が返す（wrangler.jsonc の run_worker_first）。
// 応答はすべて JSON で cache-control: no-store（iOS がキャッシュから返さないように）。
// Cookie で認証した書き込みは、Origin が自分と同じでなければ拒む（CSRF の対策）。Bearer（拡張とアプリ）は Origin を見ない
import { StoreError } from '../shared/store.js';
import { fetchMeta, parseUrl } from '../shared/meta.js';
import { applyOp, readData, seedCategories } from './library.js';
import {
  authenticate, changePassword, clearCookie, createSession, deviceName, loginStart, loginWithPasskey, loginWithPassword,
  iterationsOf, passkeyRegister, passkeyRegisterOptions, sessionCookie, setup,
} from './auth.js';
import { createInvite, inviteIsValid, listInvites, registerWithInvite, revokeInvite } from './members.js';
import { loginEvents } from './history.js';

const STATUS = {
  unauthorized: 401, forbidden: 403, web_only: 403, owner_only: 403, not_found: 404, duplicate: 409, setup_closed: 409,
  login_taken: 409, invite_invalid: 410, unsupported_url: 400,
  too_large: 413, locked: 429, wrong_password: 401, passkey_failed: 401, challenge_expired: 400, server: 500,
};
const MAX_BODY = 64 * 1024;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers },
  });
}
const fail = (err) => json({ error: { code: err.code, message: err.message } }, STATUS[err.code] ?? 400);

async function readBody(request) {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) throw new StoreError('too_large', '送る内容が大きすぎます。');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new StoreError('too_large', '送る内容が大きすぎます。');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new StoreError('invalid_json', '送る内容が JSON ではありません。');
  }
}

// ログインが済んだら、web は Cookie を付け、device を名乗るもの（アプリの予備のログイン）にはアプリのトークンを返す
async function signedIn(db, uid, body) {
  const device = deviceName(body);
  if (device) return json({ ok: true, token: (await createSession(db, uid, 'device', device, true)).token });
  const { token } = await createSession(db, uid, 'web', 'ブラウザ');
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(token) });
}

// 追加の下見の取得（/api/meta）。行き先は meta.js が決めた URL（fxtwitter、note.com、qiita.com）だけ。
// 8秒で打ち切り、本文は 2MB までだけ読む
const META_TIMEOUT = 8000;
const META_MAX = 2 * 1024 * 1024;
async function cappedFetch(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(META_TIMEOUT), headers: { 'user-agent': 'Mozilla/5.0 (compatible; Twimark)' } });
  const chunks = [];
  let size = 0;
  const reader = res.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size > META_MAX) { await reader.cancel(); break; }
  }
  return new Response(new Blob(chunks).slice(0, META_MAX), { status: res.status });
}

async function route(request, env) {
  const db = env.DB;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);

  const origin = request.headers.get('origin');
  const sameOrigin = origin === url.origin;
  const writing = method !== 'GET' && method !== 'HEAD';
  // 別のオリジンのページからの書き込みは、認証の前に断る（拡張とアプリは Bearer なので下で通す）
  const bearer = (request.headers.get('authorization') ?? '').startsWith('Bearer ');
  if (writing && !bearer && origin && !sameOrigin) throw new StoreError('forbidden', '別のサイトからは操作できません。');

  // ---- ログインの前 ----
  if (path === '/api/session' && method === 'GET') {
    const auth = await authenticate(request, db);
    const users = await db.prepare('SELECT count(*) AS n FROM users').first();
    return json({ setup: users.n === 0, login: auth?.login ?? null, role: auth?.role ?? null, kind: auth?.kind ?? null });
  }
  // 招待リンク。使えるかどうかだけを返す（誰が作ったかなどは返さない）
  if (path === '/api/invite' && method === 'GET') return json({ valid: await inviteIsValid(db, url.searchParams.get('token')) });
  if (path === '/api/register' && method === 'POST') {
    const body = await readBody(request);
    const uid = await registerWithInvite(db, body, iterationsOf(env));
    await seedCategories(db, uid);
    return signedIn(db, uid, body);
  }
  if (path === '/api/setup' && method === 'POST') {
    const body = await readBody(request);
    const uid = await setup(db, body, iterationsOf(env));
    await seedCategories(db, uid);
    return signedIn(db, uid, body);
  }
  if (path === '/api/login/start' && method === 'POST') return json(await loginStart(request, db, await readBody(request)));
  if (path === '/api/login/password' && method === 'POST') {
    const body = await readBody(request);
    return signedIn(db, await loginWithPassword(request, db, body, iterationsOf(env)), body);
  }
  if (path === '/api/login/passkey' && method === 'POST') {
    const body = await readBody(request);
    return signedIn(db, await loginWithPasskey(request, db, body), body);
  }

  // ---- ここからはログインが要る ----
  const auth = await authenticate(request, db);
  if (!auth) throw new StoreError('unauthorized', 'ログインしてください。');
  if (writing && auth.via === 'cookie' && !sameOrigin) throw new StoreError('forbidden', '別のサイトからは操作できません。');
  // パスキーの登録は WebAuthn がそのオリジンのブラウザでしか動かないので、web のセッションだけ
  const webOnly = () => {
    if (auth.kind !== 'web') throw new StoreError('web_only', 'この操作は一覧の画面から行ってください。');
  };
  // 設定の操作は web のセッションとアプリのトークンだけ（拡張のトークンは不可）
  const settingsOnly = () => {
    if (auth.kind !== 'web' && !auth.app) throw new StoreError('web_only', 'この操作は一覧の画面かアプリから行ってください。');
  };
  const ownerOnly = () => {
    settingsOnly();
    if (auth.role !== 'owner') throw new StoreError('owner_only', 'この操作は管理者だけができます。');
  };
  let m;

  // 招待（管理者だけ）
  if (path === '/api/invites' && method === 'GET') {
    ownerOnly();
    return json(await listInvites(db, auth));
  }
  if (path === '/api/invites' && method === 'POST') {
    ownerOnly();
    return json(await createInvite(db, auth, url.origin));
  }
  if ((m = path.match(/^\/api\/invites\/([A-Za-z0-9_-]{1,40})$/)) && method === 'DELETE') {
    ownerOnly();
    await revokeInvite(db, auth, m[1]);
    return json({ ok: true });
  }

  // 自分のログインの履歴（30日）
  if (path === '/api/login-events' && method === 'GET') {
    settingsOnly();
    return json({ events: await loginEvents(db, auth.userId) });
  }

  if (path === '/api/logout' && method === 'POST') {
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(auth.sessionId).run();
    return json({ ok: true }, 200, auth.via === 'cookie' ? { 'set-cookie': clearCookie() } : {});
  }
  if (path === '/api/data' && method === 'GET') return json(await readData(db, auth.userId));
  // 追加の下見。取得できなければ item は null（本文の貼り付けで保存する）
  if (path === '/api/meta' && method === 'POST') {
    const parsed = parseUrl((await readBody(request)).url);
    if (!parsed) throw new StoreError('unsupported_url', '追加できるのは X のポストと note・Qiita の記事の URL です。');
    return json({ item: await fetchMeta(parsed, cappedFetch) });
  }
  if (path === '/api/ops' && method === 'POST') return json(await applyOp(db, auth.userId, await readBody(request)));

  if (path === '/api/password' && method === 'POST') {
    settingsOnly();
    await changePassword(db, auth, await readBody(request), iterationsOf(env));
    return json({ ok: true });
  }

  if (path === '/api/passkeys' && method === 'GET') {
    settingsOnly();
    const rows = await db.prepare('SELECT id, name, created_at, last_used_at FROM passkeys WHERE user_id = ? ORDER BY created_at').bind(auth.userId).all();
    return json({ passkeys: rows.results.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, lastUsedAt: r.last_used_at })) });
  }
  if (path === '/api/passkeys/options' && method === 'POST') {
    webOnly();
    return json(await passkeyRegisterOptions(request, db, auth));
  }
  if (path === '/api/passkeys' && method === 'POST') {
    webOnly();
    await passkeyRegister(request, db, auth, await readBody(request));
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/passkeys\/([A-Za-z0-9_-]{1,512})$/)) && method === 'DELETE') {
    settingsOnly();
    await db.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?').bind(m[1], auth.userId).run();
    return json({ ok: true });
  }

  // 端末のトークン（拡張とアプリ）。{ app: true } はアプリへの受け渡しで作るアプリのトークン
  if (path === '/api/tokens' && method === 'GET') {
    settingsOnly();
    const rows = await db.prepare("SELECT id, name, created_at, last_used_at, app FROM sessions WHERE user_id = ? AND kind = 'device' ORDER BY created_at").bind(auth.userId).all();
    return json({ tokens: rows.results.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, lastUsedAt: r.last_used_at, app: r.app === 1 })) });
  }
  if (path === '/api/tokens' && method === 'POST') {
    settingsOnly();
    const body = await readBody(request);
    return json({ token: (await createSession(db, auth.userId, 'device', deviceName(body) ?? '端末', body.app === true)).token });
  }
  if ((m = path.match(/^\/api\/tokens\/([A-Za-z0-9_-]{1,40})$/)) && method === 'DELETE') {
    settingsOnly();
    await db.prepare("DELETE FROM sessions WHERE id = ? AND user_id = ? AND kind = 'device'").bind(m[1], auth.userId).run();
    return json({ ok: true });
  }

  throw new StoreError('not_found', 'その API はありません。');
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (err) {
      if (err instanceof StoreError) return fail(err);
      console.error(err);
      return fail(new StoreError('server', 'Twimark の中でエラーが起きました。'));
    }
  },
};
