// ログインの履歴（30日）。成功と失敗、方法（パスワードかパスキー）、Web かアプリか、IP、国、User-Agent を残す。
// 存在しない ID への試みは、誰の履歴にも入れない（呼ぶ側が利用者の分かるときだけ呼ぶ）
const KEEP = 30 * 86_400_000;
const since = () => new Date(Date.now() - KEEP).toISOString();

// event は { result: 'success' | 'failure', method: 'password' | 'passkey', client: 'web' | 'app', reason? }
export async function recordLogin(db, request, uid, event) {
  const ua = (request.headers.get('user-agent') ?? '').slice(0, 300);
  await db.batch([
    db.prepare('DELETE FROM login_events WHERE user_id = ? AND at < ?').bind(uid, since()),
    db.prepare('INSERT INTO login_events (user_id, at, result, method, client, reason, ip, country, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(uid, new Date().toISOString(), event.result, event.method, event.client, event.reason ?? null, request.headers.get('cf-connecting-ip') ?? '', String(request.cf?.country ?? ''), ua),
  ]);
}

export async function loginEvents(db, uid) {
  const rows = await db.prepare('SELECT at, result, method, client, reason, ip, country, user_agent FROM login_events WHERE user_id = ? AND at >= ? ORDER BY at DESC, id DESC LIMIT 500')
    .bind(uid, since())
    .all();
  return rows.results.map((r) => ({ at: r.at, result: r.result, method: r.method, client: r.client, reason: r.reason, ip: r.ip, country: r.country, userAgent: r.user_agent }));
}
