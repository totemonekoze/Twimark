// 色。利用者が選んだアクセントを画面に入れる、カテゴリの色を要素に塗る、色を選ぶシート（アクセントとカテゴリで同じもの）。
// 色の計算は shared/theme.js（アプリと同じ）。CSP で <style> は足せないので、:root の CSS 変数を JS で入れる
import { accentSet, contrast, toneSet, tonePair, tones, DEFAULT_ACCENT, ACCENT_PRESETS } from './shared/theme.js';
import { describeError } from './shared/store.js';
import { $, closeSheet, el, openSheet, sheet } from './ui.js';

const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const KEYS = { accent: 'accent', onAccent: 'on-accent', accentText: 'accent-text', accentSoft: 'accent-soft', accentInk: 'accent-ink' };
const CACHE = 'twimark.accent';
const CACHE_ON = 'twimark.accent-on';
const dark = matchMedia('(prefers-color-scheme: dark)');

// tokens.css の --accent などは var(--user-accent-l, 既定) の形。ここで --user-…-l と -d を入れる
function setAccentVars(style, hex, on) {
  accentSet(hex || DEFAULT_ACCENT, on).forEach((set, i) => {
    for (const [k, name] of Object.entries(KEYS)) style.setProperty(`--user-${name}-${i ? 'd' : 'l'}`, set[k]);
  });
}
// 次に開いたときにちらつかないよう、最後の値を localStorage に置く（読めなくても既定の色で動く）
// on はアクセントの地の上の文字の色（null は白か黒の読みやすいほう）
export function applyAccent(hex, on = null, remember = true) {
  setAccentVars(document.documentElement.style, hex, on);
  if (!remember) return;
  const keep = (key, v) => { if (v) localStorage.setItem(key, v); else localStorage.removeItem(key); };
  try { keep(CACHE, hex); keep(CACHE_ON, on); } catch { /* 残せなくても動く */ }
}
export function applyCachedAccent() {
  try {
    const [hex, on] = [localStorage.getItem(CACHE), localStorage.getItem(CACHE_ON)];
    if (isHex(hex) || isHex(on)) applyAccent(isHex(hex) ? hex : null, isHex(on) ? on : null, false);
  } catch { /* 既定の色のまま */ }
}

// 要素にカテゴリの色を塗る。key は決まった色の名前か #RRGGBB。自由な色はライトとダークの組を変数で渡し、CSS が選ぶ
const TONE_VARS = ['--tone-l', '--tone-bg-l', '--tone-d', '--tone-bg-d', '--dot'];
export function paintTone(node, key) {
  if (isHex(key)) {
    const [[lf, lb], [df, db]] = toneSet(key);
    node.dataset.tone = 'custom';
    [lf, lb, df, db, key].forEach((v, i) => node.style.setProperty(TONE_VARS[i], v));
    return;
  }
  node.dataset.tone = key;
  TONE_VARS.forEach((k) => node.style.removeProperty(k));
}

// ---- 色を選ぶシート ----
// mode: 'accent'（見本はチップ・ボタン・リンク）、'accent-text'（アクセントの地の上の文字。自動・白・黒・自由な色）か 'category'（決まった色・自動・自由な色）。
// onSave(値) は Promise を返す（値は #RRGGBB、決まった色の名前、null＝既定・自動）。失敗したら文を出して開いたまま
const dialog = sheet($('dialog[data-color-sheet]'));
const input = $('[data-color-input]');
const hexField = $('[data-color-hex]');
const rgbFields = [...document.querySelectorAll('[data-rgb]')];
const preview = $('[data-color-preview]');
const error = $('[data-color-error]');
const warn = $('[data-color-warn]');
let picked = DEFAULT_ACCENT;
let mode = 'accent';
// accent のときは今の文字の色、accent-text のときは今のアクセント（見本と読みやすさの計算に使う）
let other = null;
let onSave = async () => {};

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hexOfRgb = (rgb) => `#${rgb.map((v) => Math.min(255, Math.max(0, Math.round(Number(v) || 0))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

// どこを変えても、ほかの欄と見本をそろえる（from は今打っている欄。打っている途中の欄は書き換えない）
function pick(hex, from = null) {
  picked = hex.toUpperCase();
  if (from !== input) input.value = picked.toLowerCase();
  if (from !== hexField) hexField.value = picked;
  const rgb = rgbOf(picked);
  rgbFields.forEach((f, i) => { if (from !== f) f.value = String(rgb[i]); });
  // 見本は :root の値を受け継がないよう、今の明るさの値をそのまま入れる
  if (mode === 'category') { paintTone(preview, picked); return; }
  const [ground, on] = mode === 'accent' ? [picked, other] : [other ?? DEFAULT_ACCENT, picked];
  const set = accentSet(ground, on)[dark.matches ? 1 : 0];
  for (const [k, name] of Object.entries(KEYS)) preview.style.setProperty(`--${name}`, set[k]);
  // 読みにくい組でも保存はできる。注意だけ出す
  const ratio = contrast(set.onAccent, ground);
  warn.hidden = ratio >= 4.5;
  warn.textContent = `読みにくいかもしれません（コントラスト ${ratio.toFixed(1)}:1）`;
}
input.addEventListener('input', () => pick(input.value, input));
hexField.addEventListener('input', () => {
  const v = hexField.value.trim();
  const hex = v.startsWith('#') ? v : `#${v}`;
  if (isHex(hex)) pick(hex, hexField);
});
rgbFields.forEach((f) => f.addEventListener('input', () => pick(hexOfRgb(rgbFields.map((x) => x.value)), f)));

async function finish(value) {
  error.textContent = '';
  try {
    await onSave(value);
    closeSheet(dialog);
  } catch (err) {
    error.textContent = describeError(err, '保存できませんでした。');
  }
}
$('[data-color-save]').addEventListener('click', () => finish(picked));
$('[data-color-reset]').addEventListener('click', () => finish(null));

function swatch(color, label, on, run) {
  const b = el('button', { type: 'button', className: 'swatch', title: label });
  b.setAttribute('aria-label', label);
  b.setAttribute('aria-pressed', String(on));
  b.style.setProperty('--swatch', color);
  b.addEventListener('click', run);
  return b;
}

// auto はカテゴリの「自動」のときの今の色（決まった色の名前）。自由な色を選び始める色にする。
// with は accent なら今の文字の色、accent-text なら今のアクセント
export function openColorSheet({ kind, title, value, auto = 'gray', with: pair = null, onSave: save }) {
  mode = kind;
  other = pair;
  onSave = save;
  error.textContent = '';
  $('[data-color-title]').textContent = title;
  const isCategory = kind === 'category';
  const isText = kind === 'accent-text';
  preview.dataset.kind = kind;
  preview.removeAttribute('style');
  warn.hidden = true;
  $('[data-color-tones]').hidden = !isCategory && !isText;
  // 文字の色の白・黒には見出しを付けない（アプリと同じ）
  $('[data-color-tones-title]').hidden = isText;
  $('[data-color-reset]').textContent = isCategory ? '自動（並び順の色）' : isText ? '自動（白か黒の読みやすいほう）' : '既定に戻す';
  // 文字の色は、白と黒を押すとすぐに決まる
  if (isText) $('[data-color-tone-list]').replaceChildren(...[['#FFFFFF', '白'], ['#000000', '黒']].map(([hex, label]) => swatch(hex, label, value === hex, () => finish(hex))));
  // カテゴリは決まった11色を押すとすぐに決まる。点の色は今の画面の明るさに合わせる
  if (isCategory) {
    const i = dark.matches ? 1 : 0;
    $('[data-color-tone-list]').replaceChildren(...Object.keys(tones).map((name) => swatch(tonePair(name)[i][0], name, value === name, () => finish(name))));
  }
  $('[data-color-presets]').replaceChildren(...ACCENT_PRESETS.map((hex) => swatch(hex, hex, value === hex, () => pick(hex))));
  const start = isCategory ? tonePair(value ?? auto)[dark.matches ? 1 : 0][0] : isText ? accentSet(pair ?? DEFAULT_ACCENT)[0].onAccent : DEFAULT_ACCENT;
  pick(isHex(value) ? value : start);
  openSheet(dialog);
}
