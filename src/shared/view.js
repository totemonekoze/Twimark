// 一覧の画面（src/site）とアプリ（src/mobile）が同じに見せるための、検索とカテゴリの色の決まり
import { SITES } from './store.js';

// 並び順で割り当てるカテゴリの色。数が増えたら先頭から繰り返す。一覧にないカテゴリ（未分類）は灰色
export const CYCLE = ['teal', 'purple', 'orange', 'blue', 'magenta', 'olive', 'amber', 'brown', 'red', 'green'];
export const toneOf = (categories, category) => {
  const i = categories.indexOf(category);
  return i < 0 ? 'gray' : CYCLE[i % CYCLE.length];
};

// 検索。全角・半角をそろえ（NFKC）小文字にしてから、空白で区切った語をすべて含むかで判定する
const fold = (s) => s.normalize('NFKC').toLowerCase();
export function textMatches(text, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const target = fold(text);
  return words.every((w) => target.includes(w));
}
export const searchTextOf = (b) => [b.title, b.text, b.author?.name, b.author?.handle, b.category, b.subcategory, SITES[b.site]].join('\n');

// ログインの履歴に出す端末の名前。User-Agent からブラウザと OS を短く取り出す（細かい版は出さない）
export function deviceLabel(ua) {
  if (typeof ua !== 'string' || !ua) return '不明';
  if (/^Expo\//.test(ua) || /\bExpo\b/.test(ua)) return 'Expo Go / iPhone';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  const browser = /Edg(A|iOS)?\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [browser, os].filter(Boolean).join(' / ') || ua.slice(0, 40);
}
