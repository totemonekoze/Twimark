// ブックマークの保存先。Twimark の Worker の API（/api/data と /api/ops）を通して D1 を読み書きする。
// 一覧の画面（src/site）は同じオリジンの Cookie、拡張（src/extension）とアプリ（src/mobile）は端末のトークン（Bearer）で認証する。
// 名前の決まり（LIMITS、checkName）は Worker（src/worker）も使う

export const DEFAULT_CATEGORIES = ['AI活用', 'UIデザイン', 'フロントエンド', 'Cloudflare', 'ツール', 'その他'];
export const LIMITS = { category: 20, categories: 30, subcategories: 30, text: 5000 };
export const SITES = { x: 'X', note: 'note', qiita: 'Qiita' };
export const PUBLIC_URL = 'https://twimark.ho-service.workers.dev';

// アプリへのログインの受け渡し（?app=）の戻り先として受け付けるもの。
// exp://u.expo.dev/…（Expo Go はサインインしたアカウントのプロジェクトしか開かない）、twimark://、手元の開発サーバー（localhost と家庭内のアドレス）だけ。
// ほかの exp:// は、他人の PC から読み込んだアプリに端末のトークンが渡ってしまうので断る
const PRIVATE_HOST = /^(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;
export function isAppRedirect(raw) {
  if (typeof raw !== 'string' || raw.length > 500 || /[\s#\\]/.test(raw)) return false;
  if (/^twimark:\/\/[^@]*$/.test(raw)) return true;
  const m = raw.match(/^exp:\/\/([^/:?@]+)(?::\d{1,5})?(?:[/?]|$)/);
  return Boolean(m) && (m[1] === 'u.expo.dev' || PRIVATE_HOST.test(m[1]));
}

export class StoreError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ブラウザの例外（パスキーなど）の name ごとの説明
const BROWSER_ERRORS = {
  NotAllowedError: 'パスキーの操作が取りやめられたか、時間切れになりました。もう一度やり直してください。',
  InvalidStateError: 'このパスキーはもう登録されています。',
  SecurityError: 'このページの URL ではパスキーを使えません。',
  NotSupportedError: 'この端末かブラウザは、求めたパスキーの方式に対応していません。',
  AbortError: '操作が中断されました。',
  TimeoutError: '時間切れになりました。',
  NetworkError: '通信できませんでした。',
};

// 画面に出すエラーの文。メッセージとエラーコード（Twimark の code か、ブラウザの例外の name）を必ず並べる
export function describeError(err, fallback = 'うまくいきませんでした。') {
  if (err instanceof StoreError) return `${err.message || fallback}（エラーコード: ${err.code}）`;
  const name = typeof err?.name === 'string' && err.name !== 'Error' ? err.name : 'unknown';
  const raw = typeof err?.message === 'string' ? err.message : '';
  const known = BROWSER_ERRORS[name];
  const message = known ? `${known}${raw ? ` 詳細: ${raw}` : ''}` : raw || fallback;
  return `${message}（エラーコード: ${name}）`;
}

export function checkName(raw, what = 'カテゴリ') {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name || name.length > LIMITS.category) throw new StoreError('invalid_name', `${what}名を${LIMITS.category}文字以内で入れてください。`);
  return name;
}

export const emptyData = () => ({ categories: [], subcategories: {}, bookmarks: [] });

// 形の合わないものは落とす（古い画面や壊れた応答でも描けるように）
export function normalize(raw) {
  const names = (list) => (Array.isArray(list) ? list.filter((c) => typeof c === 'string' && c) : []);
  const categories = names(raw?.categories);
  const subcategories = {};
  for (const c of categories) subcategories[c] = names(raw?.subcategories?.[c]);
  const bookmarks = Array.isArray(raw?.bookmarks) ? raw.bookmarks.filter((b) => b && typeof b.id === 'string' && typeof b.url === 'string') : [];
  return { categories, subcategories, bookmarks };
}

// ブックマークのサブカテゴリのうち、今もあるものだけ（なければ null）
export const subOf = (data, b) => (b.subcategory && data.subcategories?.[b.category]?.includes(b.subcategory) ? b.subcategory : null);

// 一覧を変える操作。Worker の POST /api/ops に { op, args } で送る（検査は Worker が行う）
export const ops = {
  add: (bookmark) => ({ op: 'add', args: [bookmark] }),
  remove: (id) => ({ op: 'remove', args: [id] }),
  setCategory: (id, category, subcategory = null) => ({ op: 'setCategory', args: [id, category, subcategory] }),
  addCategory: (name) => ({ op: 'addCategory', args: [name] }),
  removeCategory: (name) => ({ op: 'removeCategory', args: [name] }),
  sortCategories: (names) => ({ op: 'sortCategories', args: [names] }),
  addSubcategory: (category, name) => ({ op: 'addSubcategory', args: [category, name] }),
  removeSubcategory: (category, name) => ({ op: 'removeSubcategory', args: [category, name] }),
  sortSubcategories: (category, names) => ({ op: 'sortSubcategories', args: [category, names] }),
  // カテゴリを別のカテゴリの下へ入れる・サブカテゴリをカテゴリに戻す・サブカテゴリを別のカテゴリへ移す
  nestCategory: (name, parent) => ({ op: 'nestCategory', args: [name, parent] }),
  promoteSubcategory: (category, name) => ({ op: 'promoteSubcategory', args: [category, name] }),
  moveSubcategory: (from, name, to) => ({ op: 'moveSubcategory', args: [from, name, to] }),
};

async function failure(res) {
  let body = null;
  try { body = await res.json(); } catch { /* 本文が JSON でないときは状態だけで判断する */ }
  if (body?.error?.code) return new StoreError(body.error.code, body.error.message ?? '');
  if (res.status === 401) return new StoreError('unauthorized', 'ログインしてください。');
  return new StoreError('http', `Twimark がエラーを返しました（${res.status}）。`);
}

// base は Twimark の URL（一覧の画面は同じオリジンなので空）。token があれば Bearer で送り、なければ Cookie を使う
export function createStore({ base = '', token = '' } = {}, fetchImpl = fetch) {
  async function call(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        credentials: token ? 'omit' : 'same-origin',
        headers: {
          accept: 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new StoreError('network', 'Twimark に接続できませんでした。');
    }
    if (!res.ok) throw await failure(res);
    return res.json();
  }

  return {
    call,
    load: async () => ({ data: normalize(await call('/api/data')) }),
    // op は ops のどれかが返す { op, args }。成功したら操作のあとのデータを返す
    update: async (op) => normalize(await call('/api/ops', { method: 'POST', body: op })),
  };
}
