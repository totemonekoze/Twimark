// 純粋な処理の自己テスト。URL の判定、本文・記事情報の取り出し、GitHub への読み書き（偽の API）、一覧の操作
import assert from 'node:assert/strict';
import { createStore, ops, encodeBase64, decodeBase64, emptyData, DEFAULT_CATEGORIES, StoreError } from '../src/shared/store.js';
import { parseUrl, extractTweet, extractArticle, decodeEntities } from '../src/extension/meta.js';

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

// ---- GitHub への読み書き（偽の API） ----
function fakeGitHub({ repoExists = true, fail = null, conflicts = 0, omitContent = false } = {}) {
  const base = 'https://api.github.com/repos/o/r';
  const state = { file: null, puts: [], conflicts };
  let n = 0;
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl = async (url, init = {}) => {
    assert.ok(url.startsWith(base), url);
    assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.authorization, 'Bearer t');
    if (fail) return new Response('{}', { status: fail.status, headers: fail.headers ?? {} });
    const path = url.slice(base.length);
    const method = init.method ?? 'GET';
    if (path === '') return repoExists ? json({ full_name: 'o/r' }) : json({}, 404);
    if (path === '/contents/bookmarks.json' && method === 'GET') {
      if (!state.file) return json({ message: 'Not Found' }, 404);
      return json({ sha: state.file.sha, size: state.file.text.length, content: omitContent ? '' : encodeBase64(state.file.text) });
    }
    if (path === `/git/blobs/${state.file?.sha}`) return json({ content: encodeBase64(state.file.text) });
    if (path === '/contents/bookmarks.json' && method === 'PUT') {
      const body = JSON.parse(init.body);
      state.puts.push(body);
      if (state.conflicts > 0) { state.conflicts--; return json({ message: 'conflict' }, 409); }
      if (state.file?.sha !== body.sha) return json({ message: 'sha' }, state.file ? 409 : 422);
      state.file = { sha: `sha${++n}`, text: decodeBase64(body.content) };
      return json({ content: { sha: state.file.sha } }, state.puts.length === 1 ? 201 : 200);
    }
    throw new Error(`unexpected ${method} ${path}`);
  };
  return { state, store: createStore({ owner: 'o', repo: 'r', token: 't' }, fetchImpl) };
}
const bookmark = (id, category = 'ツール') => ({ id, site: 'x', url: `https://x.com/a/status/${id}`, author: { name: '名前 😀', handle: 'a' }, postedAt: null, title: '', text: '日本語と絵文字 🎉', photos: [], videos: [], category, savedAt: '2026-09-24T00:00:00.000Z' });

test('ファイルがないときは既定のデータ。リポジトリがなければ 404 の文言', async () => {
  const { store } = fakeGitHub();
  assert.deepEqual(await store.load(), { data: emptyData(), sha: null });
  const missing = fakeGitHub({ repoExists: false });
  await assert.rejects(missing.store.load(), (e) => e instanceof StoreError && e.code === 'not_found');
});
test('最初の書き込みでファイルを作り、2回目は sha を付ける。日本語と絵文字が壊れない', async () => {
  const { state, store } = fakeGitHub();
  await store.update(ops.add(bookmark('1')), 'Add x:1');
  assert.equal(state.puts[0].sha, undefined);
  assert.equal(state.puts[0].message, 'Add x:1');
  await store.update(ops.add(bookmark('2')), 'Add x:2');
  assert.equal(state.puts[1].sha, 'sha1');
  const { data, sha } = await store.load();
  assert.equal(sha, 'sha2');
  assert.deepEqual(data.bookmarks.map((b) => b.id), ['2', '1']);
  assert.equal(data.bookmarks[0].text, '日本語と絵文字 🎉');
  assert.equal(data.bookmarks[0].author.name, '名前 😀');
  assert.deepEqual(data.categories, DEFAULT_CATEGORIES);
});
test('409 のあとは読み直して当て直す。続けば conflict', async () => {
  const ok = fakeGitHub({ conflicts: 2 });
  const next = await ok.store.update(ops.add(bookmark('1')), 'Add');
  assert.equal(next.bookmarks.length, 1);
  assert.equal(ok.state.puts.length, 3);
  const ng = fakeGitHub({ conflicts: 9 });
  await assert.rejects(ng.store.update(ops.add(bookmark('1')), 'Add'), (e) => e.code === 'conflict');
  assert.equal(ng.state.puts.length, 4);
});
test('Contents が本文を返さないときは Blob で読む', async () => {
  const { store } = fakeGitHub({ omitContent: true });
  await store.update(ops.add(bookmark('1')), 'Add');
  assert.equal((await store.load()).data.bookmarks[0].id, '1');
});
test('401・403・回数制限・通信失敗の文言', async () => {
  const code = async (fail) => { try { await fakeGitHub({ fail }).store.load(); } catch (e) { return e.code; } };
  assert.equal(await code({ status: 401 }), 'unauthorized');
  assert.equal(await code({ status: 403 }), 'forbidden');
  assert.equal(await code({ status: 403, headers: { 'x-ratelimit-remaining': '0' } }), 'rate_limited');
  assert.equal(await code({ status: 500 }), 'http');
  const offline = createStore({ owner: 'o', repo: 'r', token: 't' }, async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(offline.load(), (e) => e.code === 'network');
});
test('壊れた JSON は broken', async () => {
  const { state, store } = fakeGitHub();
  state.file = { sha: 's', text: '{oops' };
  await assert.rejects(store.load(), (e) => e.code === 'broken');
});

// ---- 一覧の操作 ----
const fresh = () => ({ ...emptyData(), bookmarks: [bookmark('1')] });
const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
test('追加: 重複と一覧にないカテゴリを拒む', () => {
  assert.equal(code(() => ops.add(bookmark('1'))(fresh())), 'duplicate');
  assert.equal(code(() => ops.add(bookmark('2', 'ない'))(fresh())), 'invalid_category');
});
test('カテゴリの追加: 前後の空白、重複、20文字、30個', () => {
  assert.deepEqual(ops.addCategory('  新しい  ')(fresh()).categories.at(-1), '新しい');
  assert.equal(code(() => ops.addCategory('ツール')(fresh())), 'duplicate');
  assert.equal(code(() => ops.addCategory('あ'.repeat(21))(fresh())), 'invalid_name');
  assert.equal(code(() => ops.addCategory(' ')(fresh())), 'invalid_name');
  const full = { ...fresh(), categories: Array.from({ length: 30 }, (_, i) => `c${i}`) };
  assert.equal(code(() => ops.addCategory('もう一つ')(full)), 'too_many');
});
test('カテゴリの削除はブックマークを残す。並べ替えは同じ集合だけ', () => {
  const after = ops.removeCategory('ツール')(fresh());
  assert.ok(!after.categories.includes('ツール'));
  assert.equal(after.bookmarks[0].category, 'ツール');
  const reversed = [...DEFAULT_CATEGORIES].reverse();
  assert.deepEqual(ops.sortCategories(reversed)(fresh()).categories, reversed);
  assert.equal(code(() => ops.sortCategories(reversed.slice(1))(fresh())), 'invalid_order');
  assert.equal(code(() => ops.sortCategories([...reversed.slice(1), reversed[1]])(fresh())), 'invalid_order');
});
test('1件のカテゴリの変更と削除', () => {
  assert.equal(ops.setCategory('1', 'その他')(fresh()).bookmarks[0].category, 'その他');
  assert.equal(code(() => ops.setCategory('1', 'ない')(fresh())), 'invalid_category');
  assert.equal(code(() => ops.setCategory('9', 'その他')(fresh())), 'not_found');
  assert.equal(ops.remove('1')(fresh()).bookmarks.length, 0);
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
