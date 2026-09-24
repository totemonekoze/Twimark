// ブックマークの保存先。非公開のGitHubリポジトリのルートにある bookmarks.json を、GitHub REST APIで読み書きする。
// 一覧の画面（src/site）と拡張（src/extension）の両方が使う。書き込みは「最新を読む→操作を当てる→sha付きでPUT」で、先に書かれていたら読み直す。

export const DATA_PATH = 'bookmarks.json';
export const DEFAULT_CATEGORIES = ['AI活用', 'UIデザイン', 'フロントエンド', 'Cloudflare', 'ツール', 'その他'];
export const LIMITS = { category: 20, categories: 30, text: 5000 };
export const SITES = { x: 'X', note: 'note', qiita: 'Qiita' };
const API = 'https://api.github.com';
const ATTEMPTS = 4;

export class StoreError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// UTF-8 の文字列と base64 の相互変換（Contents API の content は base64）
export function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export const decodeBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

export const emptyData = () => ({ version: 1, categories: [...DEFAULT_CATEGORIES], bookmarks: [] });

// 手で直されたファイルでも画面が壊れないよう、形の合わないものは落とす
export function normalize(raw) {
  const categories = Array.isArray(raw?.categories) ? raw.categories.filter((c) => typeof c === 'string' && c) : null;
  const bookmarks = Array.isArray(raw?.bookmarks) ? raw.bookmarks.filter((b) => b && typeof b.id === 'string' && typeof b.url === 'string') : [];
  return { version: 1, categories: categories ?? [...DEFAULT_CATEGORIES], bookmarks };
}

async function failure(res) {
  if (res.status === 401) return new StoreError('unauthorized', 'トークンが無効か、期限が切れています。');
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') return new StoreError('rate_limited', 'GitHub APIの回数制限に達しました。時間をおいてやり直してください。');
  if (res.status === 403) return new StoreError('forbidden', 'トークンにこのリポジトリの読み書きの権限がありません。');
  if (res.status === 404) return new StoreError('not_found', 'リポジトリが見つかりません。所有者と名前、トークンの対象リポジトリを確かめてください。');
  return new StoreError('http', `GitHubがエラーを返しました（${res.status}）。`);
}

export function createStore({ owner, repo, token }, fetchImpl = fetch) {
  const base = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  async function call(path, init = {}) {
    try {
      return await fetchImpl(`${base}${path}`, {
        ...init,
        cache: 'no-store',
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2022-11-28',
          ...(init.body ? { 'content-type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new StoreError('network', 'GitHubに接続できませんでした。');
    }
  }

  // { data, sha }。ファイルがまだなければ sha は null
  async function load() {
    const res = await call(`/contents/${DATA_PATH}`);
    if (res.status === 404) {
      const repoRes = await call('');
      if (repoRes.ok) return { data: emptyData(), sha: null };
      throw await failure(repoRes);
    }
    if (!res.ok) throw await failure(res);
    const file = await res.json();
    let content = file.content ?? '';
    // 1MBを超えると Contents API は本文を返さないので、Blob で読む
    if (!content && file.size > 0) {
      const blob = await call(`/git/blobs/${file.sha}`);
      if (!blob.ok) throw await failure(blob);
      content = (await blob.json()).content;
    }
    try {
      return { data: normalize(JSON.parse(decodeBase64(content))), sha: file.sha };
    } catch {
      throw new StoreError('broken', `${DATA_PATH} を読めませんでした（JSONとして壊れています）。`);
    }
  }

  // mutate は最新のデータを受け取り、次のデータを返す（StoreError を投げて取りやめてよい）。成功したら書き込んだデータを返す
  async function update(mutate, message) {
    for (let i = 0; i < ATTEMPTS; i++) {
      const { data, sha } = await load();
      const next = mutate(structuredClone(data));
      const res = await call(`/contents/${DATA_PATH}`, {
        method: 'PUT',
        body: JSON.stringify({ message, content: encodeBase64(`${JSON.stringify(next, null, 2)}\n`), ...(sha ? { sha } : {}) }),
      });
      if (res.ok) return next;
      // 409・422: 読んだあとにほかから書かれた。読み直して当て直す
      if (res.status !== 409 && res.status !== 422) throw await failure(res);
    }
    throw new StoreError('conflict', 'ほかの画面と同時に書き込んだため保存できませんでした。やり直してください。');
  }

  return { load, update };
}

// 一覧を変える操作。どれも data を受け取って次の data を返す関数を作る（store.update に渡す）
const has = (data, id) => data.bookmarks.some((b) => b.id === id);
export const ops = {
  add: (bookmark) => (data) => {
    if (has(data, bookmark.id)) throw new StoreError('duplicate', 'このページはもう保存されています。');
    if (!data.categories.includes(bookmark.category)) throw new StoreError('invalid_category', 'カテゴリを一覧から選んでください。');
    data.bookmarks.unshift(bookmark);
    return data;
  },
  remove: (id) => (data) => {
    data.bookmarks = data.bookmarks.filter((b) => b.id !== id);
    return data;
  },
  setCategory: (id, category) => (data) => {
    const bookmark = data.bookmarks.find((b) => b.id === id);
    if (!bookmark) throw new StoreError('not_found', 'そのブックマークはもうありません。再読み込みしてください。');
    if (!data.categories.includes(category)) throw new StoreError('invalid_category', 'カテゴリを一覧から選んでください。');
    bookmark.category = category;
    return data;
  },
  addCategory: (raw) => (data) => {
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (!name || name.length > LIMITS.category) throw new StoreError('invalid_name', `カテゴリ名を${LIMITS.category}文字以内で入れてください。`);
    if (data.categories.includes(name)) throw new StoreError('duplicate', 'そのカテゴリはもうあります。');
    if (data.categories.length >= LIMITS.categories) throw new StoreError('too_many', `カテゴリは${LIMITS.categories}個までです。`);
    data.categories.push(name);
    return data;
  },
  // 削除したカテゴリのブックマークは消さない（画面では「未分類」に出る）
  removeCategory: (name) => (data) => {
    data.categories = data.categories.filter((c) => c !== name);
    return data;
  },
  // 今のカテゴリと同じ名前の集合の並びだけを受け付ける
  sortCategories: (names) => (data) => {
    const list = data.categories;
    if (!Array.isArray(names) || names.length !== list.length || new Set(names).size !== names.length || !names.every((n) => list.includes(n))) {
      throw new StoreError('invalid_order', 'カテゴリの一覧が変わっています。再読み込みしてやり直してください。');
    }
    data.categories = [...names];
    return data;
  },
};
