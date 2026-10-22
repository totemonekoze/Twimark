// 自己テスト。URL の判定、本文・記事情報の取り出し、検索と色、Worker の API（D1 の代わりに node:sqlite）、クライアントの store
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createStore, describeError, isAppRedirect, ops, subOf, DEFAULT_CATEGORIES, StoreError } from '../src/shared/store.js';
import worker from '../src/worker/index.js';
import { parseUrl, extractTweet, extractArticle, decodeEntities } from '../src/shared/meta.js';
import { toneOf, textMatches, searchTextOf, deviceLabel, CYCLE } from '../src/shared/view.js';
import { colors, tones, type } from '../src/shared/theme.js';
import { tokensCss } from './build.mjs';

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
  // migrations/ をすべて、番号の順に当てる
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL(f, dir), 'utf8'));
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
  assert.deepEqual(s.body, { setup: true, login: null, role: null, kind: null });
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
// ---- カテゴリをサブカテゴリにする・戻す・移す ----
const placeOf = (data, id) => { const b = data.bookmarks.find((x) => x.id === id); return [b.category, b.subcategory]; };
test('nestCategory: ブックマークがついて移り、子は同じ段に並び、同じ名前は合わせる', async () => {
  const { send, cookie } = await signedUp();
  const op = async (o) => (await send('/api/ops', { method: 'POST', body: o, cookie })).body;
  await op(ops.addSubcategory('AI活用', 'プロンプト'));
  await op(ops.addSubcategory('AI活用', '共通'));
  await op(ops.addSubcategory('ツール', '共通'));
  await op(ops.add(bookmark('1', 'AI活用')));
  await op(ops.add(bookmark('2', 'AI活用', 'プロンプト')));
  await op(ops.add(bookmark('3', 'AI活用', '共通')));
  await op(ops.add(bookmark('4', 'ツール')));
  const after = await op(ops.nestCategory('AI活用', 'ツール'));
  assert.ok(!after.categories.includes('AI活用'));
  assert.deepEqual(after.subcategories['ツール'], ['共通', 'AI活用', 'プロンプト']);
  assert.deepEqual(placeOf(after, 'x:1'), ['ツール', 'AI活用']);
  assert.deepEqual(placeOf(after, 'x:2'), ['ツール', 'プロンプト']);
  assert.deepEqual(placeOf(after, 'x:3'), ['ツール', '共通']);
  assert.deepEqual(placeOf(after, 'x:4'), ['ツール', null]);
  assert.deepEqual(after.categories, ['UIデザイン', 'フロントエンド', 'Cloudflare', 'ツール', 'その他']);
  for (const [a, b] of [['ツール', 'ツール'], ['ない', 'ツール'], ['ツール', 'ない']]) assert.equal((await op(ops.nestCategory(a, b))).error.code, 'invalid_category', `${a}→${b}`);
});
test('nestCategory: 上限を超えるなら何も変えない', async () => {
  const { send, cookie } = await signedUp();
  const op = async (o) => (await send('/api/ops', { method: 'POST', body: o, cookie })).body;
  for (let i = 0; i < 29; i++) await op(ops.addSubcategory('ツール', `s${i}`));
  await op(ops.addSubcategory('その他', 'x'));
  const before = await op(ops.sortCategories(DEFAULT_CATEGORIES));
  assert.equal((await op(ops.nestCategory('その他', 'ツール'))).error.code, 'too_many');
  assert.deepEqual((await send('/api/data', { cookie })).body, before);
  // ちょうど30なら入る
  await op(ops.removeSubcategory('その他', 'x'));
  assert.equal((await op(ops.nestCategory('その他', 'ツール'))).subcategories['ツール'].length, 30);
});
test('promoteSubcategory: カテゴリに戻り、ブックマークは直下へ。同じ名前のカテゴリには合わせる', async () => {
  const { send, cookie } = await signedUp();
  const op = async (o) => (await send('/api/ops', { method: 'POST', body: o, cookie })).body;
  await op(ops.addSubcategory('ツール', 'A'));
  await op(ops.addSubcategory('ツール', 'B'));
  await op(ops.addSubcategory('ツール', 'その他'));
  await op(ops.add(bookmark('1', 'ツール', 'A')));
  await op(ops.add(bookmark('2', 'ツール', 'その他')));
  const a = await op(ops.promoteSubcategory('ツール', 'A'));
  assert.equal(a.categories.at(-1), 'A');
  assert.deepEqual(a.subcategories['ツール'], ['B', 'その他']);
  assert.deepEqual(placeOf(a, 'x:1'), ['A', null]);
  const merged = await op(ops.promoteSubcategory('ツール', 'その他'));
  assert.equal(merged.categories.filter((c) => c === 'その他').length, 1);
  assert.deepEqual(placeOf(merged, 'x:2'), ['その他', null]);
  assert.equal((await op(ops.promoteSubcategory('ツール', 'ない'))).error.code, 'invalid_subcategory');
  for (let i = merged.categories.length; i < 30; i++) await op(ops.addCategory(`c${i}`));
  assert.equal((await op(ops.promoteSubcategory('ツール', 'B'))).error.code, 'too_many');
});
test('moveSubcategory: 別のカテゴリへ移り、同じ名前は合わせる。ほかの利用者の行には触れない', async () => {
  const c = await signedUp();
  const op = async (o, cookie = c.cookie) => (await c.send('/api/ops', { method: 'POST', body: o, cookie })).body;
  await op(ops.addSubcategory('ツール', 'A'));
  await op(ops.addSubcategory('その他', 'A'));
  await op(ops.addSubcategory('ツール', 'B'));
  await op(ops.add(bookmark('1', 'ツール', 'A')));
  await op(ops.add(bookmark('2', 'ツール', 'B')));
  const m = await invited(c);
  await op(ops.addSubcategory('ツール', 'B'), m.cookie);
  await op(ops.add(bookmark('9', 'ツール', 'B')), m.cookie);
  const moved = await op(ops.moveSubcategory('ツール', 'B', 'AI活用'));
  assert.deepEqual(moved.subcategories['AI活用'], ['B']);
  assert.deepEqual(placeOf(moved, 'x:2'), ['AI活用', 'B']);
  const merged = await op(ops.moveSubcategory('ツール', 'A', 'その他'));
  assert.deepEqual(merged.subcategories['その他'], ['A']);
  assert.deepEqual(merged.subcategories['ツール'], []);
  assert.deepEqual(placeOf(merged, 'x:1'), ['その他', 'A']);
  assert.equal((await op(ops.moveSubcategory('ツール', 'A', 'ツール'))).error.code, 'invalid_category');
  // 招待された人の「ツール › B」はそのまま
  const theirs = (await c.send('/api/data', { cookie: m.cookie })).body;
  assert.deepEqual(theirs.subcategories['ツール'], ['B']);
  assert.deepEqual(placeOf(theirs, 'x:9'), ['ツール', 'B']);
});
test('nestCategory: 消えたサブカテゴリを指すものは (入れ先, 名前) へ。自分と同じ名前の子は1つにまとまる。ほかの利用者とカテゴリの並びの詰め直し', async () => {
  const c = await signedUp();
  const op = async (o, cookie = c.cookie) => (await c.send('/api/ops', { method: 'POST', body: o, cookie })).body;
  // カテゴリを消して足し直すと、ブックマークは消えたサブカテゴリ「古い」を指したまま残る
  await op(ops.addSubcategory('AI活用', '古い'));
  await op(ops.add(bookmark('1', 'AI活用', '古い')));
  await op(ops.removeCategory('AI活用'));
  await op(ops.addCategory('AI活用'));
  await op(ops.addSubcategory('AI活用', 'AI活用'));
  await op(ops.add(bookmark('2', 'AI活用', 'AI活用')));
  const m = await invited(c);
  await op(ops.addSubcategory('AI活用', 'x'), m.cookie);
  await op(ops.add(bookmark('9', 'AI活用', 'x')), m.cookie);
  const after = await op(ops.nestCategory('AI活用', 'ツール'));
  assert.deepEqual(after.subcategories['ツール'], ['AI活用']);
  assert.deepEqual(placeOf(after, 'x:1'), ['ツール', 'AI活用']);
  assert.deepEqual(placeOf(after, 'x:2'), ['ツール', 'AI活用']);
  assert.equal((await op(ops.addCategory('新規'))).categories.at(-1), '新規');
  const theirs = (await c.send('/api/data', { cookie: m.cookie })).body;
  assert.deepEqual(theirs.categories, DEFAULT_CATEGORIES);
  assert.deepEqual(theirs.subcategories['AI活用'], ['x']);
  assert.deepEqual(placeOf(theirs, 'x:9'), ['AI活用', 'x']);
});
test('promoteSubcategory: 親と同じ名前なら親の直下へ。残りの並びを詰め直し、ほかの利用者に触れない。moveSubcategory の上限', async () => {
  const c = await signedUp();
  const op = async (o, cookie = c.cookie) => (await c.send('/api/ops', { method: 'POST', body: o, cookie })).body;
  for (const s of ['ツール', 'A', 'B']) await op(ops.addSubcategory('ツール', s));
  await op(ops.add(bookmark('1', 'ツール', 'ツール')));
  const m = await invited(c);
  await op(ops.addSubcategory('ツール', 'A'), m.cookie);
  await op(ops.add(bookmark('9', 'ツール', 'A')), m.cookie);
  const self = await op(ops.promoteSubcategory('ツール', 'ツール'));
  assert.deepEqual(self.categories, DEFAULT_CATEGORIES);
  assert.deepEqual(placeOf(self, 'x:1'), ['ツール', null]);
  await op(ops.promoteSubcategory('ツール', 'A'));
  // 詰め直していなければ、D（位置 1）が B（位置 2 のまま）より前に出る
  assert.deepEqual((await op(ops.addSubcategory('ツール', 'D'))).subcategories['ツール'], ['B', 'D']);
  const theirs = (await c.send('/api/data', { cookie: m.cookie })).body;
  assert.deepEqual(theirs.categories, DEFAULT_CATEGORIES);
  assert.deepEqual(placeOf(theirs, 'x:9'), ['ツール', 'A']);
  // 移し先が30個なら断って何も変えない。同じ名前があるなら合わせるので入る
  for (let i = 0; i < 29; i++) await op(ops.addSubcategory('その他', `s${i}`));
  await op(ops.addSubcategory('その他', 'B'));
  const full = (await c.send('/api/data', { cookie: c.cookie })).body;
  assert.equal((await op(ops.moveSubcategory('ツール', 'D', 'その他'))).error.code, 'too_many');
  assert.deepEqual((await c.send('/api/data', { cookie: c.cookie })).body, full);
  assert.equal((await op(ops.moveSubcategory('ツール', 'B', 'その他'))).subcategories['その他'].length, 30);
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
// ---- 招待と、ログインの履歴 ----
const tokenOf = (url) => new URL(url).searchParams.get('invite');
async function invited(c, login = 'member1') {
  const { url } = (await c.send('/api/invites', { method: 'POST', body: {}, cookie: c.cookie })).body;
  const r = await c.send('/api/register', { method: 'POST', body: { invite: tokenOf(url), login, password: PASSWORD } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { cookie: r.cookie, token: tokenOf(url) };
}
test('登録した最初の利用者は管理者。招待を作れるのは管理者の web のセッションだけ', async () => {
  const c = await signedUp();
  assert.equal((await c.send('/api/session', { cookie: c.cookie })).body.role, 'owner');
  const { token } = (await c.send('/api/tokens', { method: 'POST', body: { device: 'x' }, cookie: c.cookie })).body;
  assert.equal((await c.send('/api/invites', { method: 'POST', body: {}, bearer: token })).body.error.code, 'web_only');
  const m = await invited(c);
  assert.equal((await c.send('/api/session', { cookie: m.cookie })).body.role, 'member');
  assert.equal((await c.send('/api/invites', { method: 'POST', body: {}, cookie: m.cookie })).body.error.code, 'owner_only');
  assert.equal((await c.send('/api/invites', { cookie: m.cookie })).body.error.code, 'owner_only');
});
test('招待は1回きり。使えるかの確認、取り消し、3日の期限', async () => {
  const c = await signedUp();
  const made = (await c.send('/api/invites', { method: 'POST', body: {}, cookie: c.cookie })).body;
  assert.match(made.url, /^https:\/\/twimark\.test\/\?invite=[A-Za-z0-9_-]{40,}$/);
  assert.ok(Date.parse(made.expiresAt) - Date.now() > 2.9 * 86_400_000);
  const t = tokenOf(made.url);
  assert.deepEqual((await c.send(`/api/invite?token=${t}`)).body, { valid: true });
  // 招待の値そのものは D1 にない
  assert.equal(c.env.DB.sql.prepare('SELECT count(*) AS n FROM invites WHERE token_hash = ?').get(t).n, 0);
  assert.equal((await c.send('/api/register', { method: 'POST', body: { invite: t, login: 'first', password: PASSWORD } })).status, 200);
  assert.deepEqual((await c.send(`/api/invite?token=${t}`)).body, { valid: false });
  assert.equal((await c.send('/api/register', { method: 'POST', body: { invite: t, login: 'second', password: PASSWORD } })).body.error.code, 'invite_invalid');
  const list = (await c.send('/api/invites', { cookie: c.cookie })).body;
  assert.deepEqual(list.used.map((u) => u.login), ['first']);
  assert.equal(list.open.length, 0);
  // 取り消した招待と、期限を過ぎた招待は使えない
  const r = (await c.send('/api/invites', { method: 'POST', body: {}, cookie: c.cookie })).body;
  await c.send(`/api/invites/${r.id}`, { method: 'DELETE', cookie: c.cookie });
  assert.equal((await c.send('/api/register', { method: 'POST', body: { invite: tokenOf(r.url), login: 'third', password: PASSWORD } })).body.error.code, 'invite_invalid');
  const old = (await c.send('/api/invites', { method: 'POST', body: {}, cookie: c.cookie })).body;
  c.env.DB.sql.prepare("UPDATE invites SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(old.id);
  assert.equal((await c.send('/api/register', { method: 'POST', body: { invite: tokenOf(old.url), login: 'fourth', password: PASSWORD } })).body.error.code, 'invite_invalid');
  // 招待なしの登録と、別のオリジンからの登録は断る
  assert.equal((await c.send('/api/register', { method: 'POST', body: { login: 'fifth', password: PASSWORD } })).body.error.code, 'invite_invalid');
  const fresh = (await c.send('/api/invites', { method: 'POST', body: {}, cookie: c.cookie })).body;
  assert.equal((await c.send('/api/register', { method: 'POST', body: { invite: tokenOf(fresh.url), login: 'sixth', password: PASSWORD }, origin: 'https://evil.test' })).status, 403);
});
test('ID が重複したら login_taken で断り、招待は使えるまま残る', async () => {
  const c = await signedUp();
  const { url } = (await c.send('/api/invites', { method: 'POST', body: {}, cookie: c.cookie })).body;
  assert.equal((await c.send('/api/register', { method: 'POST', body: { invite: tokenOf(url), login: 'owner', password: PASSWORD } })).body.error.code, 'login_taken');
  assert.deepEqual((await c.send(`/api/invite?token=${tokenOf(url)}`)).body, { valid: true });
  assert.equal((await c.send('/api/register', { method: 'POST', body: { invite: tokenOf(url), login: 'newone', password: PASSWORD } })).status, 200);
});
test('招待された人のデータは管理者のものと分かれる', async () => {
  const c = await signedUp();
  await c.send('/api/ops', { method: 'POST', body: ops.add(bookmark('1')), cookie: c.cookie });
  const m = await invited(c);
  const mine = (await c.send('/api/data', { cookie: m.cookie })).body;
  assert.deepEqual(mine.categories, DEFAULT_CATEGORIES);
  assert.equal(mine.bookmarks.length, 0);
  await c.send('/api/ops', { method: 'POST', body: ops.addCategory('自分だけ'), cookie: m.cookie });
  assert.ok(!(await c.send('/api/data', { cookie: c.cookie })).body.categories.includes('自分だけ'));
  // 管理者のブックマークは、招待された人からは消せない（自分の行しか触らない）
  await c.send('/api/ops', { method: 'POST', body: ops.remove('x:1'), cookie: m.cookie });
  assert.equal((await c.send('/api/data', { cookie: c.cookie })).body.bookmarks.length, 1);
});
test('ログインの履歴: 成功と失敗は自分の分だけに入り、ない ID の試みは誰にも入らない', async () => {
  const c = await signedUp();
  const m = await invited(c);
  const extra = { 'cf-connecting-ip': '203.0.113.7', 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1' };
  const login = (body) => worker.fetch(new Request(`${ORIGIN}/api/login/password`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, ...extra }, body: JSON.stringify(body) }), c.env);
  // 登録と招待の作成のぶんは数えないよう、ここまでの行を消してから試す
  c.env.DB.sql.prepare('DELETE FROM login_events').run();
  await login({ login: 'owner', password: PASSWORD });
  await login({ login: 'owner', password: 'wrong password!' });
  await login({ login: 'owner', password: PASSWORD, device: 'iPhone アプリ' });
  await login({ login: 'nobody', password: PASSWORD });
  const events = (await c.send('/api/login-events', { cookie: c.cookie })).body.events;
  assert.deepEqual(events.map((e) => [e.result, e.method, e.client, e.reason]), [['success', 'password', 'app', null], ['failure', 'password', 'web', 'wrong_password'], ['success', 'password', 'web', null]]);
  assert.equal(events[0].ip, '203.0.113.7');
  assert.match(events[0].userAgent, /iPhone/);
  assert.deepEqual((await c.send('/api/login-events', { cookie: m.cookie })).body.events, []);
  assert.equal(c.env.DB.sql.prepare('SELECT count(*) AS n FROM login_events').get().n, 3);
  // 端末のトークンからは見られない
  const { token } = (await c.send('/api/tokens', { method: 'POST', body: { device: 'x' }, cookie: c.cookie })).body;
  assert.equal((await c.send('/api/login-events', { bearer: token })).body.error.code, 'web_only');
});
test('ログインの履歴: ロック中の試みとパスキーの失敗も残り、30日より前の行は消える', async () => {
  const c = await signedUp();
  c.env.DB.sql.prepare("INSERT INTO login_events (user_id, at, result, method, client) VALUES (1, '2000-01-01T00:00:00.000Z', 'success', 'password', 'web')").run();
  for (let i = 0; i < 5; i++) await c.send('/api/login/password', { method: 'POST', body: { login: 'owner', password: 'wrong password!' } });
  await c.send('/api/login/password', { method: 'POST', body: { login: 'owner', password: PASSWORD } });
  c.env.DB.sql.prepare("INSERT INTO passkeys (id, user_id, public_key, counter, transports, name, created_at) VALUES ('cred1', 1, 'AA', 0, '[]', 'テスト', 'now')").run();
  const start = (await c.send('/api/login/start', { method: 'POST', body: { login: 'owner' } })).body;
  await c.send('/api/login/passkey', { method: 'POST', body: { challengeId: start.challengeId, response: { id: 'cred1', rawId: 'cred1', type: 'public-key', response: {} } } });
  const reasons = c.env.DB.sql.prepare('SELECT method, reason FROM login_events ORDER BY id').all().map((r) => `${r.method}:${r.reason}`);
  assert.deepEqual(reasons, [...Array(5).fill('password:wrong_password'), 'password:locked', 'passkey:passkey_failed']);
});
test('端末の表示名: ブラウザと OS を短くする', () => {
  assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'), 'Chrome / Windows');
  assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), 'Safari / iPhone');
  assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'), 'Edge / Windows');
  assert.equal(deviceLabel('Expo/2.32.1 CFNetwork/1568 Darwin/24.0.0'), 'Expo Go / iPhone');
  assert.equal(deviceLabel(''), '不明');
});
test('subOf は今もあるサブカテゴリだけを返す', () => {
  const data = { categories: ['A'], subcategories: { A: ['s'] } };
  assert.equal(subOf(data, { category: 'A', subcategory: 's' }), 's');
  assert.equal(subOf(data, { category: 'A', subcategory: 'gone' }), null);
  assert.equal(subOf(data, { category: 'B', subcategory: 's' }), null);
});

// ---- アプリのトークン（0003） ----
test('アプリのトークン: 受け渡しと device 付きのログインは app、設定で発行したものは拡張', async () => {
  const { send, cookie, env } = await signedUp();
  const ext = (await send('/api/tokens', { method: 'POST', body: { device: '拡張' }, cookie })).body.token;
  const handed = (await send('/api/tokens', { method: 'POST', body: { device: 'iPhone アプリ', app: true }, cookie })).body.token;
  const logged = (await send('/api/login/password', { method: 'POST', body: { login: 'owner', password: PASSWORD, device: 'iPhone' }, origin: null })).body.token;
  const list = (await send('/api/tokens', { cookie })).body.tokens;
  assert.deepEqual(list.map((t) => [t.name, t.app]), [['拡張', false], ['iPhone アプリ', true], ['iPhone', true]]);
  // 0003 の前からある行は app = 0（拡張と同じ扱い）
  assert.equal(env.DB.sql.prepare("SELECT count(*) AS n FROM sessions WHERE app = 0 AND kind = 'device'").get().n, 1);
  for (const token of [handed, logged]) assert.equal((await send('/api/data', { bearer: token })).status, 200);
  assert.equal((await send('/api/passkeys', { bearer: ext })).body.error.code, 'web_only');
});
test('アプリのトークン: 設定の操作ができる。パスキーの登録だけは web のセッションだけ', async () => {
  const { send, cookie } = await signedUp();
  const app = (await send('/api/tokens', { method: 'POST', body: { device: 'iPhone アプリ', app: true }, cookie })).body.token;
  const ext = (await send('/api/tokens', { method: 'POST', body: { device: '拡張' }, cookie })).body.token;
  for (const path of ['/api/passkeys', '/api/tokens', '/api/login-events', '/api/invites']) {
    assert.equal((await send(path, { bearer: app })).status, 200, path);
    assert.equal((await send(path, { bearer: ext })).body.error.code, 'web_only', path);
  }
  assert.equal((await send('/api/invites', { method: 'POST', body: {}, bearer: app, origin: null })).status, 200);
  const issued = (await send('/api/tokens', { method: 'POST', body: { device: '仕事のPC' }, bearer: app, origin: null })).body.token;
  assert.equal((await send('/api/data', { bearer: issued })).status, 200);
  assert.equal((await send('/api/passkeys/options', { method: 'POST', body: {}, bearer: app, origin: null })).body.error.code, 'web_only');
  // パスワードを変えると、そのアプリのトークンのほかはすべて消える
  assert.equal((await send('/api/password', { method: 'POST', body: { current: PASSWORD, next: 'another long password' }, bearer: app, origin: null })).status, 200);
  assert.equal((await send('/api/data', { bearer: app })).status, 200);
  assert.equal((await send('/api/data', { bearer: ext })).status, 401);
  assert.equal((await send('/api/data', { cookie })).status, 401);
});

// ---- 追加の下見（/api/meta） ----
test('/api/meta: ログインが要り、対象外の URL は断り、決まったホストにだけ取りにいく', async () => {
  const { send, cookie } = await signedUp();
  const real = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    if (String(url).startsWith('https://api.fxtwitter.com/')) return new Response(JSON.stringify({ tweet: { text: '本文', created_timestamp: 1732590000, author: { name: 'X Dev', screen_name: 'XDevelopers' } } }));
    return new Response('nope', { status: 500 });
  };
  try {
    assert.equal((await send('/api/meta', { method: 'POST', body: { url: 'https://x.com/jack/status/20' } })).status, 401);
    assert.equal((await send('/api/meta', { method: 'POST', body: { url: 'https://evil.example/a' }, cookie })).body.error.code, 'unsupported_url');
    const x = (await send('/api/meta', { method: 'POST', body: { url: 'https://x.com/XDevelopers/status/20' }, cookie })).body.item;
    assert.equal(x.text, '本文');
    assert.equal(x.url, 'https://x.com/XDevelopers/status/20');
    assert.equal((await send('/api/meta', { method: 'POST', body: { url: 'https://qiita.com/Qiita/items/c686397e4a0f4f11683d' }, cookie })).body.item, null);
    assert.deepEqual(asked, ['https://api.fxtwitter.com/XDevelopers/status/20', 'https://qiita.com/Qiita/items/c686397e4a0f4f11683d']);
  } finally {
    globalThis.fetch = real;
  }
});

// ---- 画面の値（src/shared/theme.js） ----
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
test('画面の色: ライトとダークの両方を持ち、文字の組は 4.5:1 以上', () => {
  for (const [name, v] of Object.entries(colors)) assert.equal(v.length, 2, name);
  for (const [name, [light, dark]] of Object.entries(tones)) {
    for (const [fg, bg] of [light, dark]) assert.ok(contrast(fg, bg) >= 4.5, `${name} ${fg}/${bg}`);
  }
  const pairs = [['label', 'surface'], ['label', 'bg'], ['secondary', 'surface'], ['secondary', 'bg'], ['secondary', 'surface2'], ['accent', 'surface'], ['accent', 'bg'],
    ['onAccent', 'accent'], ['accentInk', 'accentSoft'], ['label', 'sheetSurface'], ['secondary', 'sheetSurface'], ['secondary', 'sheet'], ['accent', 'sheet'], ['accent', 'sheetSurface'], ['danger', 'surface'], ['danger', 'bg'], ['onDanger', 'danger']];
  for (const i of [0, 1]) for (const [fg, bg] of pairs) assert.ok(contrast(colors[fg][i], colors[bg][i]) >= 4.5, `${fg}/${bg} ${i ? 'dark' : 'light'}`);
});
test('tokens.css に、style.css が使う変数がすべてある', () => {
  const css = tokensCss();
  const used = new Set([...readFileSync(new URL('../src/site/style.css', import.meta.url), 'utf8').matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
  // --i、--n、--tone、--tone-bg は style.css と app.js が要素ごとに決める
  for (const v of used) if (!['--i', '--n', '--tone', '--tone-bg'].includes(v)) assert.match(css, new RegExp(`${v}:`), v);
});

// ---- レビューで足した試験（定義 2026-10-22-001） ----
test('拡張のトークン: アプリのトークンを作れず、設定の書き込みもできない。下見は使える', async () => {
  const { send, cookie } = await signedUp();
  const ext = (await send('/api/tokens', { method: 'POST', body: { device: '拡張' }, cookie })).body.token;
  const as = (path, method, body) => send(path, { method, body, bearer: ext, origin: 'chrome-extension://abc' });
  for (const [path, method, body] of [['/api/tokens', 'POST', { device: 'iPhone アプリ', app: true }], ['/api/password', 'POST', { current: PASSWORD, next: 'another long password' }],
    ['/api/tokens/abc', 'DELETE'], ['/api/passkeys/abc', 'DELETE'], ['/api/invites', 'POST', {}], ['/api/passkeys/options', 'POST', {}]]) {
    assert.equal((await as(path, method, body)).body.error.code, 'web_only', `${method} ${path}`);
  }
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response('nope', { status: 500 });
  try {
    assert.equal((await as('/api/meta', 'POST', { url: 'https://x.com/jack/status/20' })).status, 200);
    // Cookie の下見も、別のサイトからは断る
    assert.equal((await send('/api/meta', { method: 'POST', body: { url: 'https://x.com/jack/status/20' }, cookie, origin: 'https://evil.example' })).body.error.code, 'forbidden');
  } finally {
    globalThis.fetch = real;
  }
});
test('/api/meta: 取得は打ち切りの signal 付きで、本文は 2MB までだけ読む', async () => {
  const { send, cookie } = await signedUp();
  const real = globalThis.fetch;
  const pad = 'x'.repeat(3 * 1024 * 1024);
  let html = '';
  let init = null;
  globalThis.fetch = async (url, options) => { init = options; return new Response(html, { headers: { 'content-type': 'text/html' } }); };
  const meta = async () => (await send('/api/meta', { method: 'POST', body: { url: 'https://note.com/someone/n/n1234567890ab' }, cookie })).body.item;
  try {
    html = `<meta property="og:title" content="前にある見出し">${pad}`;
    assert.equal((await meta())?.title, '前にある見出し');
    assert.ok(init?.signal instanceof AbortSignal);
    html = `${pad}<meta property="og:title" content="2MB より後ろ">`;
    assert.equal(await meta(), null);
  } finally {
    globalThis.fetch = real;
  }
});
test('一覧の画面の JS が探す data- 属性は index.html にある（JS が付けるものを除く）', () => {
  const site = new URL('../src/site/', import.meta.url);
  const html = readFileSync(new URL('index.html', site), 'utf8');
  const sources = readdirSync(site).filter((n) => n.endsWith('.js')).map((n) => readFileSync(new URL(n, site), 'utf8'));
  const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const set = new Set(sources.flatMap((js) => [...js.matchAll(/\.dataset\.(\w+)\s*=/g)].map((m) => `data-${kebab(m[1])}`)));
  for (const js of sources) {
    for (const [, attr] of js.matchAll(/\[(data-[a-z0-9-]+)[=\]]/g)) if (!set.has(attr)) assert.match(html, new RegExp(`\\b${attr}\\b`), attr);
  }
});
test('アプリの画面が使う色・文字・形の名前は theme にある', () => {
  const mobile = new URL('../src/mobile/', import.meta.url);
  const styles = [...readFileSync(new URL('theme.js', mobile), 'utf8').matchAll(/^ {4}(\w+): \{/gm)].map((m) => m[1]);
  assert.ok(styles.includes('screen') && styles.includes('row'));
  const files = ['App.js', 'parts.js', ...readdirSync(new URL('screens/', mobile)).map((n) => `screens/${n}`)];
  for (const f of files) {
    const js = readFileSync(new URL(f, mobile), 'utf8');
    for (const [, k] of js.matchAll(/\bc\.(\w+)/g)) assert.ok(k in colors, `${f} c.${k}`);
    for (const [, k] of js.matchAll(/\bt\.(\w+)/g)) assert.ok(k in type, `${f} t.${k}`);
    for (const [, k] of js.matchAll(/\bs\.(\w+)/g)) assert.ok(styles.includes(k), `${f} s.${k}`);
  }
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
