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
export const searchTextOf = (b) => [b.title, b.text, b.author?.name, b.author?.handle, b.category, SITES[b.site]].join('\n');
