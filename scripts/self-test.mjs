// 自己テスト。URL の判定、本文・記事情報の取り出し、検索と色、Worker の API（D1 の代わりに node:sqlite）、クライアントの store
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createStore, describeError, isAppRedirect, ops, subOf, DEFAULT_CATEGORIES, StoreError } from '../src/shared/store.js';
import worker from '../src/worker/index.js';
import { parseUrl, extractTweet, extractArticle, decodeEntities } from '../src/shared/meta.js';
import { toneOf, textMatches, searchTextOf, CYCLE } from '../src/shared/view.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ---- URL の判定 ----
test('X のポストの URL', () => {
  for (const url of ['https://x.com/jack/status/20', 'https://twitter.com/jack/status/20?s=20', 'https://mobile.twitter.com/jack/status/20/photo/1', 'https://www.x.com/jack/status/20#m']) {
    assert.deepEqual(parseUrl(url), { site: 'x', id: 'x:20', key: '20', handle: 'jack', url: 'https://x.com/jack/status/20' }, url);
  }
  assert.deepEqual(parseUrl('https://x.com/i/web/status/20'), { site: 'x', id: 'x:20', key: '20', handle: null, url: null });
  assert.equal(parseUrl('https://x.com/i/status/20').id, 'x:20');
});
test('note と Qiita の記事の URL', () => {
  assert.deepEqual(parseUrl('https://note.com/info/n/nea1b96233fbf?magazine_key=m1'), { site: 'note', id: 'note:nea1b96233fbf', key: 'nea1b96233fbf', handle: 'info', url: 'https://note.com/info/n/nea1b96233fbf' });
  assert.deepEqual(parseUrl('https://qiita.com/Qiita/items/c686397e4a0f4f11683d#heading'), { site: 'qiita', id: 'qiita:c686397e4a0f4f11683d', key: 'c686397e4a0f4f11683d', handle: 'Qiita', url: 'https://qiita.com/Qiita/items/c686397e4a0f4f11683d' });
});
test('対象外の URL は受け付けない', () => {
  for (const url of ['https://x.com/home', 'https://x.com/jack', 'http://x.com/jack/status/20', 'https://evil.com/x.com/jack/status/20', 'https://x.com.evil.com/jack/status/20',
    'https://qiita.com/tags/javascript', 'https://qiita.com/Qiita/items/xyz', 'https://note.com/info', 'https://note.jp/n/na2355e3abefb', '', null]) {
    assert.equal(parseUrl(url), null, String(url));
  }
});

// ---- 取り出し ----
test('fxtwitter の応答から取り出す', () => {
  const item = extractTweet({ tweet: {
    text: 'short', raw_text: { text: '本文 https://t.co/x' }, created_timestamp: 1732590000, author: { name: 'X Dev', screen_name: 'XDevelopers' },
    media: { photos: [{ url: 'https://pbs.twimg.com/media/a.jpg' }, { url: 'https://evil.example/a.jpg' }], videos: [{ thumbnail_url: 'https://pbs.twimg.com/v.jpg' }] },
  } });
  assert.deepEqual(item, {
    author: { name: 'X Dev', handle: 'XDevelopers' }, postedAt: '2024-11-26T03:00:00.000Z', title: '', text: '本文 https://t.co/x',
    photos: [{ url: 'https://pbs.twimg.com/media/a.jpg' }], videos: [{ thumbnail: 'https://pbs.twimg.com/v.jpg' }],
  });
  assert.equal(extractTweet({ code: 404 }), null);
});
test('note の形の HTML から取り出す（@graph、文字参照）', () => {
  const html = `<head><meta data-n-head="ssr" data-hid="og:title" property="og:title" content="タイトル｜note公式">
    <meta data-n-head="ssr" property="og:description" content="説明 &amp; &quot;引用&quot; &#x1F600; &#12354;">
    <meta property="og:image" content="https://assets.st-note.com/a.png?fit=bounds&amp;w=1">
    <script data-n-head="ssr" type="application/ld+json">{"@context":"http://schema.org","@graph":[{"@type":"BlogPosting","headline":"見出し","datePublished":"2014-04-18T11:00:41.000+09:00","author":{"@type":"Person","name":"note公式"}}]}</script></head>`;
  assert.deepEqual(extractArticle(html, { handle: 'info' }), {
    author: { name: 'note公式', handle: 'info' }, postedAt: '2014-04-18T02:00:41.000Z', title: '見出し', text: '説明 & "引用" 😀 あ',
    photos: [{ url: 'https://assets.st-note.com/a.png?fit=bounds&w=1' }], videos: [],
  });
});
test('Qiita の形の HTML から取り出す（属性の順、JSON-LD が複数）', () => {
  const html = `<meta content="Q - Qiita" property="og:title"><meta name="description" content="メタの説明"><meta property='og:image' content='http://insecure/a.png'>
    <script type="application/ld+json">{"@type":"BreadcrumbList"}</script><script type="application/ld+json">{broken</script>
    <script type="application/ld+json">{"@type":"Article","headline":"Q","datePublished":"2011-11-04T23:58:21.000+09:00","author":[{"name":"Qiita"}]}</script>`;
  const item = extractArticle(html, { handle: 'Qiita' });
  assert.equal(item.title, 'Q');
  assert.equal(item.text, 'メタの説明');
  assert.equal(item.author.name, 'Qiita');
  assert.deepEqual(item.photos, []);
  assert.equal(extractArticle('<html></html>', { handle: 'a' }), null);
  assert.equal(extractArticle('<meta property="og:title" content="OGだけ">', { handle: 'a' }).title, 'OGだけ');
});
test('文字参照の復元', () => {
  assert.equal(decodeEntities('&lt;a&gt; &#39;x&#39; &unknown; &#0;'), "<a> 'x' &unknown; &#0;");
});

// ---- 検索と色（画面とアプリで共有） ----
test('X アプリから共有された URL（?s=&t= 付き）', () => {
  assert.equal(parseUrl('https://x.com/jack/status/20?s=46&t=abcDEF').url, 'https://x.com/jack/status/20');
});
test('検索は NFKC・小文字でそろえ、空白区切りの語をすべて含む', () => {
  const b = { title: '', text: 'ＣＬＡＵＤＥ の小技', author: { name: '名前', handle: 'jack' }, category: 'AI活用', site: 'x' };
  assert.ok(textMatches(searchTextOf(b), 'claude 小技'));
  assert.ok(textMatches(searchTextOf(b), '  jack  X '));
  assert.ok(!textMatches(searchTextOf(b), 'claude 大技'));
  assert.ok(textMatches(searchTextOf(b), ''));
});
test('カテゴリの色は並び順で繰り返し、一覧にないものは灰色', () => {
  const cats = Array.from({ length: CYCLE.length + 1 }, (_, i) => `c${i}`);
  assert.equal(toneOf(cats, 'c0'), CYCLE[0]);
  assert.equal(toneOf(cats, `c${CYCLE.length}`), CYCLE[0]);
  assert.equal(toneOf(cats, 'none'), 'gray');
});

// ---- Worker の API（D1 の代わりに node:sqlite） ----
function fakeD1() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  sql.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  const statement = (q, params = []) => ({
    bind: (...p) => statement(q, p),
    first: async () => sql.prepare(q).get(...params) ?? null,
    all: async () => ({ results: sql.prepare(q).all(...params) }),
    run: async () => ({ meta: { changes: Number(sql.prepare(q).run(...params).changes) } }),
    exec: () => (/^\s*select/i.test(q) ? { results: sql.prepare(q).all(...params) } : (sql.prepare(q).run(...params), { results: [] })),
  });
  return {
    sql,
    prepare: (q) => statement(q),
    // D1 の batch と同じく、まとめて1つのトランザクションにする
    batch: async (list) => {
      sql.exec('BEGIN');
      try {
        const out = list.map((s) => s.exec());
        sql.exec('COMMIT');
        return out;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
const ORIGIN = 'https://twimark.test';
function client() {
  const env = { DB: fakeD1(), ASSETS: { fetch: async () => new Response('asset') } };
  const send = async (path, { method = 'GET', body, cookie, bearer, origin = method === 'GET' ? null : ORIGIN } = {}) => {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = `__Host-twimark=${cookie}`;
    if (bearer) headers.authorization = `Bearer ${bearer}`;
    if (origin) headers.origin = origin;
    const res = await worker.fetch(new Request(`${ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
    const cookieHeader = res.headers.get('set-cookie') ?? '';
    return { status: res.status, body: await res.json(), cookie: cookieHeader.match(/__Host-twimark=([^;]+)/)?.[1] ?? null, setCookie: cookieHeader, headers: res.headers };
  };
  return { env, send };
}
const PASSWORD = 'correct horse battery';
async function signedUp() {
  const c = client();
  const r = await c.send('/api/setup', { method: 'POST', body: { login: 'owner', password: PASSWORD } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { ...c, cookie: r.cookie };
}
const bookmark = (id, category = 'ツール', subcategory = null) => ({ id: `x:${id}`, site: 'x', url: `https://x.com/a/status/${id}`, author: { name: '名前 😀', handle: 'a' }, postedAt: null, title: '', text: '日本語と絵文字 🎉', photos: [{ url: 'https://pbs.twimg.com/a.jpg' }, { url: 'http://bad' }], videos: [], category, subcategory });

test('登録の前: 登録できると返し、データは 401。応答は no-store', async () => {
  const { send } = client();
  const s = await send('/api/session');
  assert.deepEqual(s.body, { setup: true, login: null, kind: null });
  assert.equal(s.headers.get('cache-control'), 'no-store');
  assert.equal((await send('/api/data')).status, 401);
});
test('登録は1回だけ。Cookie は HttpOnly・Secure・SameSite=Strict で、既定のカテゴリができる', async () => {
  const c = client();
  const bad = await c.send('/api/setup', { method: 'POST', body: { login: 'owner', password: 'short' } });
  assert.equal(bad.body.error.code, 'invalid_password');
  const r = await c.send('/api/setup', { method: 'POST', body: { login: 'owner', password: PASSWORD } });
  assert.match(r.setCookie, /HttpOnly; Secure; SameSite=Strict/);
  const again = await c.send('/api/setup', { method: 'POST', body: { login: 'other', password: PASSWORD } });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'setup_closed');
  assert.equal(c.env.DB.sql.prepare('SELECT count(*) AS n FROM users').get().n, 1);
  const d = await c.send('/api/data', { cookie: r.cookie });
  assert.deepEqual(d.body.categories, DEFAULT_CATEGORIES);
  assert.equal((await c.send('/api/session', { cookie: r.cookie })).body.login, 'owner');
});
test('Cookie の書き込みは Origin が同じときだけ。別のオリジンは認証の前に断る', async () => {
  const { send, cookie } = await signedUp();
  const op = ops.addCategory('新しい');
  assert.equal((await send('/api/ops', { method: 'POST', body: op, cookie, origin: null })).status, 403);
  assert.equal((await send('/api/ops', { method: 'POST', body: op, cookie, origin: 'https://evil.test' })).status, 403);
  assert.equal((await send('/api/login/password', { method: 'POST', body: { login: 'owner', password: PASSWORD }, origin: 'https://evil.test' })).status, 403);
  assert.equal((await send('/api/ops', { method: 'POST', body: op, cookie })).status, 200);
});
test('パスワードのログイン: 違えば 401、5回で15分止める（正しいパスワードでも）', async () => {
  const { send } = await signedUp();
  const login = (password) => send('/api/login/password', { method: 'POST', body: { login: 'owner', password } });
  const ok = await login(PASSWORD);
  assert.equal(ok.status, 200);
  assert.ok(ok.cookie);
  for (let i = 0; i < 5; i++) assert.equal((await login('wrong password!')).body.error.code, 'wrong_password');
  const locked = await login(PASSWORD);
  assert.equal(locked.status, 429);
  assert.equal(locked.body.error.code, 'locked');
  // ない ID も同じ文言
  assert.equal((await send('/api/login/password', { method: 'POST', body: { login: 'nobody', password: PASSWORD } })).body.error.code, 'wrong_password');
});
test('端末のトークン: 一覧の画面から発行し、Bearer で読み書きできる。管理は一覧の画面だけ', async () => {
  const { send, cookie } = await signedUp();
  const { token } = (await send('/api/tokens', { method: 'POST', body: { device: '拡張' }, cookie })).body;
  assert.equal((await send('/api/data', { bearer: token })).status, 200);
  // Bearer は Origin を見ない（拡張のページは chrome-extension:// から送る）
  assert.equal((await send('/api/ops', { method: 'POST', body: ops.addCategory('拡張から'), bearer: token, origin: 'chrome-extension://abc' })).status, 200);
  assert.equal((await send('/api/tokens', { bearer: token })).body.error.code, 'web_only');
  // 端末のトークンを Cookie に入れても通らない
  assert.equal((await send('/api/data', { cookie: token })).status, 401);
  const list = (await send('/api/tokens', { cookie })).body.tokens;
  assert.deepEqual(list.map((t) => t.name), ['拡張']);
  await send(`/api/tokens/${list[0].id}`, { method: 'DELETE', cookie });
  assert.equal((await send('/api/data', { bearer: token })).status, 401);
});
test('アプリの予備のログイン: device を付けると端末のトークンを返し、Cookie は付けない', async () => {
  const { send } = await signedUp();
  const r = await send('/api/login/password', { method: 'POST', body: { login: 'owner', password: PASSWORD, device: 'iPhone' }, origin: null });
  assert.ok(r.body.token);
  assert.equal(r.cookie, null);
  assert.equal((await send('/api/data', { bearer: r.body.token })).status, 200);
});
test('ログアウトとパスワードの変更（ほかのセッションは消える）', async () => {
  const { send, cookie } = await signedUp();
  const other = (await send('/api/login/password', { method: 'POST', body: { login: 'owner', password: PASSWORD } })).cookie;
  const { token } = (await send('/api/tokens', { method: 'POST', body: { device: 'iPhone' }, cookie })).body;
  assert.equal((await send('/api/password', { method: 'POST', body: { current: 'wrong', next: 'another long password' }, cookie })).body.error.code, 'wrong_password');
  assert.equal((await send('/api/password', { method: 'POST', body: { current: PASSWORD, next: 'another long password' }, cookie })).status, 200);
  assert.equal((await send('/api/data', { cookie: other })).status, 401);
  assert.equal((await send('/api/data', { bearer: token })).status, 401);
  assert.equal((await send('/api/data', { cookie })).status, 200);
  const out = await send('/api/logout', { method: 'POST', cookie });
  assert.match(out.setCookie, /Max-Age=0/);
  assert.equal((await send('/api/data', { cookie })).status, 401);
});
test('操作: 追加・重複・カテゴリとサブカテゴリの検査', async () => {
  const { send, cookie } = await signedUp();
  const op = async (o) => (await send('/api/ops', { method: 'POST', body: o, cookie })).body;
  assert.equal((await op(ops.addCategory('  ')))?.error.code, 'invalid_name');
  assert.equal((await op(ops.addCategory('あ'.repeat(21))))?.error.code, 'invalid_name');
  assert.equal((await op(ops.addCategory('ツール')))?.error.code, 'duplicate');
  assert.deepEqual((await op(ops.addSubcategory('ツール', ' Claude '))).subcategories['ツール'], ['Claude']);
  assert.equal((await op(ops.addSubcategory('ない', 'x')))?.error.code, 'invalid_category');
  assert.equal((await op(ops.addSubcategory('ツール', 'Claude')))?.error.code, 'duplicate');
  // 別のカテゴリなら同じ名前でよい
  assert.deepEqual((await op(ops.addSubcategory('その他', 'Claude'))).subcategories['その他'], ['Claude']);
  const added = await op(ops.add(bookmark('1', 'ツール', 'Claude')));
  assert.equal(added.bookmarks[0].subcategory, 'Claude');
  assert.equal(added.bookmarks[0].text, '日本語と絵文字 🎉');
  assert.deepEqual(added.bookmarks[0].photos, [{ url: 'https://pbs.twimg.com/a.jpg' }]);
  assert.equal((await op(ops.add(bookmark('1'))))?.error.code, 'duplicate');
  assert.equal((await op(ops.add(bookmark('2', 'ない'))))?.error.code, 'invalid_category');
  assert.equal((await op(ops.add(bookmark('2', 'ツール', 'ない'))))?.error.code, 'invalid_subcategory');
  assert.equal((await op(ops.add({ ...bookmark('3'), url: 'javascript:alert(1)' })))?.error.code, 'invalid_bookmark');
  assert.equal((await op({ op: 'constructor', args: [] }))?.error.code, 'invalid_op');
  const moved = await op(ops.setCategory('x:1', 'その他', 'Claude'));
  assert.deepEqual([moved.bookmarks[0].category, moved.bookmarks[0].subcategory], ['その他', 'Claude']);
  assert.equal((await op(ops.setCategory('x:9', 'その他')))?.error.code, 'not_found');
});
test('サブカテゴリを消すとカテゴリの直下へ、カテゴリを消すとブックマークは残りサブカテゴリは消える', async () => {
  const { send, cookie } = await signedUp();
  const op = async (o) => (await send('/api/ops', { method: 'POST', body: o, cookie })).body;
  await op(ops.addSubcategory('ツール', 'A'));
  await op(ops.addSubcategory('ツール', 'B'));
  await op(ops.add(bookmark('1', 'ツール', 'A')));
  assert.deepEqual((await op(ops.sortSubcategories('ツール', ['B', 'A']))).subcategories['ツール'], ['B', 'A']);
  assert.equal((await op(ops.sortSubcategories('ツール', ['A'])))?.error.code, 'invalid_order');
  const noA = await op(ops.removeSubcategory('ツール', 'A'));
  assert.equal(noA.bookmarks[0].subcategory, null);
  const noTool = await op(ops.removeCategory('ツール'));
  assert.ok(!noTool.categories.includes('ツール'));
  assert.equal(noTool.subcategories['ツール'], undefined);
  assert.equal(noTool.bookmarks.length, 1);
  assert.equal((await op(ops.sortCategories(['その他'])))?.error.code, 'invalid_order');
  const order = [...noTool.categories].reverse();
  assert.deepEqual((await op(ops.sortCategories(order))).categories, order);
});
test('パスキーの登録: rpID はホスト名。壊れた応答とチャレンジの使い回しは拒む。パスキーのない ID とない ID は同じ形', async () => {
  const { send, cookie } = await signedUp();
  const o = (await send('/api/passkeys/options', { method: 'POST', body: {}, cookie })).body;
  assert.equal(o.options.rp.id, 'twimark.test');
  assert.ok(o.options.challenge.length >= 16);
  const bad = await send('/api/passkeys', { method: 'POST', body: { challengeId: o.challengeId, response: { id: 'x', rawId: 'x', type: 'public-key', response: {} } }, cookie });
  assert.equal(bad.body.error.code, 'passkey_failed');
  const reused = await send('/api/passkeys', { method: 'POST', body: { challengeId: o.challengeId, response: {} }, cookie });
  assert.equal(reused.body.error.code, 'challenge_expired');
  assert.deepEqual((await send('/api/login/start', { method: 'POST', body: { login: 'owner' } })).body, { passkey: false });
  assert.deepEqual((await send('/api/login/start', { method: 'POST', body: { login: 'nobody' } })).body, { passkey: false });
});
test('パスキーがある ID はログインで認証のオプションを返し、壊れた応答は拒む', async () => {
  const c = await signedUp();
  c.env.DB.sql.prepare("INSERT INTO passkeys (id, user_id, public_key, counter, transports, name, created_at) VALUES ('cred1', 1, 'AA', 0, '[\"internal\"]', 'テスト', 'now')").run();
  const start = (await c.send('/api/login/start', { method: 'POST', body: { login: 'owner' } })).body;
  assert.equal(start.passkey, true);
  assert.deepEqual(start.options.allowCredentials.map((a) => a.id), ['cred1']);
  const r = await c.send('/api/login/passkey', { method: 'POST', body: { challengeId: start.challengeId, response: { id: 'cred1', rawId: 'cred1', type: 'public-key', response: {} } } });
  assert.equal(r.status, 401);
  assert.equal(r.cookie, null);
});
test('Worker の外のパスは静的アセットへ。ない API は、ログインの前は 401、あとは 404', async () => {
  const { env, send, cookie } = await signedUp();
  assert.equal(await (await worker.fetch(new Request(`${ORIGIN}/index.html`), env)).text(), 'asset');
  assert.equal((await send('/api/nothing')).status, 401);
  assert.equal((await send('/api/nothing', { cookie })).status, 404);
});
test('クライアントの store: Bearer を付けて送り、エラーの code を StoreError にする', async () => {
  const { send, cookie } = await signedUp();
  const { token } = (await send('/api/tokens', { method: 'POST', body: { device: 'test' }, cookie })).body;
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, init.headers.authorization, init.credentials]);
    const r = await send(url.replace(ORIGIN, ''), { method: init.method, body: init.body ? JSON.parse(init.body) : undefined, bearer: init.headers.authorization?.slice(7) });
    return new Response(JSON.stringify(r.body), { status: r.status });
  };
  const store = createStore({ base: ORIGIN, token }, fetchImpl);
  assert.deepEqual((await store.load()).data.categories, DEFAULT_CATEGORIES);
  await assert.rejects(store.update(ops.addCategory('ツール')), (e) => e instanceof StoreError && e.code === 'duplicate');
  assert.deepEqual(calls[0], [`${ORIGIN}/api/data`, `Bearer ${token}`, 'omit']);
  const offline = createStore({ token }, async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(offline.load(), (e) => e.code === 'network');
});
test('エラーの文には必ずエラーコードが付く（Twimark の code、ブラウザの例外の name）', () => {
  assert.equal(describeError(new StoreError('duplicate', 'もうあります。')), 'もうあります。（エラーコード: duplicate）');
  const notAllowed = new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError');
  assert.match(describeError(notAllowed), /時間切れ.*詳細: The operation either timed out.*（エラーコード: NotAllowedError）$/);
  assert.equal(describeError(new Error('boom')), 'boom（エラーコード: unknown）');
  assert.equal(describeError(undefined, '失敗しました。'), '失敗しました。（エラーコード: unknown）');
});
test('アプリへの受け渡しの戻り先は u.expo.dev・twimark://・手元の開発サーバーだけ', () => {
  for (const ok of ['exp://u.expo.dev/abc-123/--/login?channel-name=main', 'twimark://login', 'exp://192.168.1.5:8081/--/login', 'exp://10.0.0.2:8081/--/login', 'exp://172.20.1.1:8081', 'exp://localhost:8081/--/login']) assert.ok(isAppRedirect(ok), ok);
  for (const bad of ['exp://evil.example:8081/--/login', 'exp://203.0.113.5:8081/--/login', 'exp://u.expo.dev.evil.example/--/login', 'exp://u.expo.dev@evil.example/x', 'exp://172.32.0.1:8081', 'https://evil.example/', 'exp://u.expo.dev/x#token=1', 'javascript:alert(1)', null]) assert.ok(!isAppRedirect(bad), String(bad));
});
test('ログインの失敗を記録するたびに、15分より前の行を消す', async () => {
  const { send, env } = await signedUp();
  env.DB.sql.prepare("INSERT INTO login_failures (login, failed_at) VALUES ('old', '2000-01-01T00:00:00.000Z')").run();
  await send('/api/login/password', { method: 'POST', body: { login: 'nobody', password: 'wrong password!' } });
  assert.deepEqual(env.DB.sql.prepare('SELECT login FROM login_failures').all().map((r) => r.login), ['nobody']);
});
test('subOf は今もあるサブカテゴリだけを返す', () => {
  const data = { categories: ['A'], subcategories: { A: ['s'] } };
  assert.equal(subOf(data, { category: 'A', subcategory: 's' }), 's');
  assert.equal(subOf(data, { category: 'A', subcategory: 'gone' }), null);
  assert.equal(subOf(data, { category: 'B', subcategory: 's' }), null);
});


let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${e.message}`);
  }
}
console.log(failed ? `${failed}件失敗しました。` : `${tests.length}件すべて成功しました。`);
process.exitCode = failed ? 1 : 0;
