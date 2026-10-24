// 一覧の画面（src/site）とアプリ（src/mobile）が同じに見せるための、検索とカテゴリの色の決まり
import { SITES } from './store.js';

// 並び順で割り当てるカテゴリの色。数が増えたら先頭から繰り返す。一覧にないカテゴリ（未分類）は灰色
export const CYCLE = ['teal', 'purple', 'orange', 'blue', 'magenta', 'olive', 'amber', 'brown', 'red', 'green'];
export const toneOf = (categories, category) => {
  const i = categories.indexOf(category);
  return i < 0 ? 'gray' : CYCLE[i % CYCLE.length];
};
// 利用者が決めた色（決まった色の名前か #RRGGBB）があればそれ、なければ並び順の色
export const categoryTone = (data, category) => data.categoryColors?.[category] ?? toneOf(data.categories, category);

// 検索。全角・半角をそろえ（NFKC）小文字にしてから、空白で区切った語をすべて含むかで判定する
const fold = (s) => s.normalize('NFKC').toLowerCase();
export function textMatches(text, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const target = fold(text);
  return words.every((w) => target.includes(w));
}
export const searchTextOf = (b) => [b.title, b.text, b.author?.name, b.author?.handle, b.category, b.subcategory, SITES[b.site]].join('\n');

// カードの長押し・強く押す操作の決まり（Web とアプリで同じ）。
// hold ミリ秒押し続け、その間に slop px 以上動かなければ持ち上げる。force（0〜1）を超えたらメニュー。置き場の札に dwell ミリ秒重ねるとサブカテゴリを開く
export const PRESS = { hold: 400, slop: 10, force: 0.6, dwell: 600 };

// 指の位置 (x, y) が入っている四角の番号。四角は { x, y, w, h }。slop だけ広げて判定し、
// 広げた範囲が重なるところ（並びのすき間）では中心が近いほうを選ぶ。どれにも入らなければ -1
export function hitIndex(rects, x, y, slop = 0) {
  let best = -1;
  let far = Infinity;
  rects.forEach((r, i) => {
    if (x < r.x - slop || x > r.x + r.w + slop || y < r.y - slop || y > r.y + r.h + slop) return;
    const d = (x - (r.x + r.w / 2)) ** 2 + (y - (r.y + r.h / 2)) ** 2;
    if (d < far) { far = d; best = i; }
  });
  return best;
}

// ログインの履歴に出す端末の名前。User-Agent からブラウザと OS を短く取り出す（細かい版は出さない）
export function deviceLabel(ua) {
  if (typeof ua !== 'string' || !ua) return '不明';
  if (/^Expo\//.test(ua) || /\bExpo\b/.test(ua)) return 'Expo Go / iPhone';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  const browser = /Edg(A|iOS)?\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [browser, os].filter(Boolean).join(' / ') || ua.slice(0, 40);
}
