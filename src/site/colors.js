// 色。利用者が選んだアクセントを画面に入れる、カテゴリの色を要素に塗る、色を選ぶシート（アクセントとカテゴリで同じもの）。
// 色の計算は shared/theme.js（アプリと同じ）。CSP で <style> は足せないので、:root の CSS 変数を JS で入れる
import { accentSet, toneSet, tonePair, tones, DEFAULT_ACCENT, ACCENT_PRESETS } from './shared/theme.js';
import { describeError } from './shared/store.js';
import { $, closeSheet, el, openSheet, sheet } from './ui.js';

const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const KEYS = { accent: 'accent', onAccent: 'on-accent', accentText: 'accent-text', accentSoft: 'accent-soft', accentInk: 'accent-ink' };
const CACHE = 'twimark.accent';
const dark = matchMedia('(prefers-color-scheme: dark)');

// tokens.css の --accent などは var(--user-accent-l, 既定) の形。ここで --user-…-l と -d を入れる
function setAccentVars(style, hex) {
  accentSet(hex || DEFAULT_ACCENT).forEach((set, i) => {
    for (const [k, name] of Object.entries(KEYS)) style.setProperty(`--user-${name}-${i ? 'd' : 'l'}`, set[k]);
  });
}
// 次に開いたときにちらつかないよう、最後の値を localStorage に置く（読めなくても既定の色で動く）
export function applyAccent(hex, remember = true) {
  setAccentVars(document.documentElement.style, hex);
  if (!remember) return;
  try { if (hex) localStorage.setItem(CACHE, hex); else localStorage.removeItem(CACHE); } catch { /* 残せなくても動く */ }
}
export function applyCachedAccent() {
  try { const hex = localStorage.getItem(CACHE); if (isHex(hex)) applyAccent(hex, false); } catch { /* 既定の色のまま */ }
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
// mode: 'accent'（見本はチップ・ボタン・リンク）か 'category'（決まった色・自動・自由な色）。
// onSave(値) は Promise を返す（値は #RRGGBB、決まった色の名前、null＝既定・自動）。失敗したら文を出して開いたまま
const dialog = sheet($('dialog[data-color-sheet]'));
const input = $('[data-color-input]');
const hexField = $('[data-color-hex]');
const rgbFields = [...document.querySelectorAll('[data-rgb]')];
const preview = $('[data-color-preview]');
const error = $('[data-color-error]');
let picked = DEFAULT_ACCENT;
let mode = 'accent';
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
  if (mode === 'accent') {
    const set = accentSet(picked)[dark.matches ? 1 : 0];
    for (const [k, name] of Object.entries(KEYS)) preview.style.setProperty(`--${name}`, set[k]);
  }
  else paintTone(preview, picked);
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

// auto はカテゴリの「自動」のときの今の色（決まった色の名前）。自由な色を選び始める色にする
export function openColorSheet({ kind, title, value, auto = 'gray', onSave: save }) {
  mode = kind;
  onSave = save;
  error.textContent = '';
  $('[data-color-title]').textContent = title;
  const isCategory = kind === 'category';
  preview.dataset.kind = kind;
  preview.removeAttribute('style');
  $('[data-color-tones]').hidden = !isCategory;
  $('[data-color-reset]').textContent = isCategory ? '自動（並び順の色）' : '既定に戻す';
  // カテゴリは決まった11色を押すとすぐに決まる。点の色は今の画面の明るさに合わせる
  if (isCategory) {
    const i = dark.matches ? 1 : 0;
    $('[data-color-tone-list]').replaceChildren(...Object.keys(tones).map((name) => swatch(tonePair(name)[i][0], name, value === name, () => finish(name))));
  }
  $('[data-color-presets]').replaceChildren(...ACCENT_PRESETS.map((hex) => swatch(hex, hex, value === hex, () => pick(hex))));
  pick(isHex(value) ? value : isCategory ? tonePair(value ?? auto)[dark.matches ? 1 : 0][0] : DEFAULT_ACCENT);
  openSheet(dialog);
}
