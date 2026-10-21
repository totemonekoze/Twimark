// 招待リンクと、招待からの登録。招待を作れるのは管理者（owner）だけ。
// 招待は1回きりで3日で切れる。リンクに入れる値は作ったときに一度だけ返し、D1 には SHA-256 だけを置く
import { StoreError } from '../shared/store.js';
import { checkLogin, checkPassword, hashPassword, randomToken, sha256 } from './auth.js';

const DAY = 86_400_000;
export const INVITE_LIFETIME = 3 * DAY;
const now = () => new Date().toISOString();

export async function createInvite(db, auth, origin) {
  const token = randomToken();
  const id = randomToken(12);
  const expiresAt = new Date(Date.now() + INVITE_LIFETIME).toISOString();
  await db.prepare('INSERT INTO invites (id, token_hash, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, await sha256(token), auth.userId, now(), expiresAt)
    .run();
  return { id, url: `${origin}/?invite=${token}`, expiresAt };
}

// 使える招待（値は返さない）と、使われた招待（使った人の ID）
export async function listInvites(db, auth) {
  const [open, used] = await db.batch([
    db.prepare('SELECT id, created_at, expires_at FROM invites WHERE created_by = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC').bind(auth.userId, now()),
    db.prepare('SELECT i.id, i.used_at, u.login FROM invites i LEFT JOIN users u ON u.id = i.used_by WHERE i.created_by = ? AND i.used_at IS NOT NULL AND i.used_by IS NOT NULL ORDER BY i.used_at DESC').bind(auth.userId),
  ]);
  return {
    open: open.results.map((r) => ({ id: r.id, createdAt: r.created_at, expiresAt: r.expires_at })),
    used: used.results.map((r) => ({ id: r.id, usedAt: r.used_at, login: r.login ?? '（削除された利用者）' })),
  };
}

// 使われる前のものだけを取り消す
export async function revokeInvite(db, auth, id) {
  await db.prepare('UPDATE invites SET revoked_at = ? WHERE id = ? AND created_by = ? AND used_at IS NULL AND revoked_at IS NULL').bind(now(), String(id), auth.userId).run();
}

const usable = 'used_at IS NULL AND revoked_at IS NULL AND expires_at > ?';
export async function inviteIsValid(db, token) {
  if (typeof token !== 'string' || !token || token.length > 100) return false;
  return Boolean(await db.prepare(`SELECT 1 FROM invites WHERE token_hash = ? AND ${usable}`).bind(await sha256(token), now()).first());
}

const invalidInvite = () => new StoreError('invite_invalid', 'この招待リンクは使えません（期限切れ・使用済み・取り消し済みのどれかです）。管理者に新しいリンクを頼んでください。');

// 招待から member の利用者を作り、その id を返す。
// 先に招待を押さえ（1つの UPDATE で、使える招待なら used_at を入れる）、押さえられたときだけ利用者を作る。
// ID が重複して作れなかったら、押さえを戻して招待を使えるままにする
export async function registerWithInvite(db, body, iterations) {
  const login = checkLogin(body?.login);
  const password = checkPassword(body?.password);
  const token = typeof body?.invite === 'string' ? body.invite : '';
  if (!token || token.length > 100) throw invalidInvite();
  const hash = await sha256(token);
  if (await db.prepare('SELECT 1 FROM users WHERE login = ?').bind(login).first()) throw new StoreError('login_taken', 'その ID はもう使われています。別の ID にしてください。');
  const p = await hashPassword(password, iterations);
  const claimedAt = now();
  const claim = await db.prepare(`UPDATE invites SET used_at = ? WHERE token_hash = ? AND ${usable}`).bind(claimedAt, hash, claimedAt).run();
  if (!claim.meta?.changes) throw invalidInvite();
  try {
    await db.prepare("INSERT INTO users (login, password_hash, password_salt, password_iterations, created_at, role) VALUES (?, ?, ?, ?, ?, 'member')")
      .bind(login, p.hash, p.salt, p.iterations, claimedAt)
      .run();
  } catch (err) {
    await db.prepare('UPDATE invites SET used_at = NULL WHERE token_hash = ? AND used_at = ? AND used_by IS NULL').bind(hash, claimedAt).run();
    if (/UNIQUE/i.test(String(err?.message))) throw new StoreError('login_taken', 'その ID はもう使われています。別の ID にしてください。');
    throw err;
  }
  const uid = (await db.prepare('SELECT id FROM users WHERE login = ?').bind(login).first()).id;
  await db.prepare('UPDATE invites SET used_by = ? WHERE token_hash = ?').bind(uid, hash).run();
  return uid;
}
