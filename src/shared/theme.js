// 画面の値の正本。一覧の画面（build.mjs が tokens.css に書き出す）とアプリ（src/mobile/theme.js）が使う。
// 地・面・文字・区切りは iOS のシステムの色（グループ表示）。アクセントは利用者が選ぶ（既定は抹茶の黄緑）、カテゴリの色はくすみパステルか自由な色。
// 色は [ライト, ダーク]。文字に使う組は、ライトとダークの両方で 4.5:1 以上（self-test が確かめる）

// ---- 色の計算（#RRGGBB） ----
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hexOf = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
export function luminance(hex) {
  const [r, g, b] = rgbOf(hex).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// a に b を t の割合で混ぜる
export const mix = (a, b, t) => hexOf(rgbOf(a).map((v, i) => v + (rgbOf(b)[i] - v) * t));
function hslOf(hex) {
  const [r, g, b] = rgbOf(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hexOfHsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  return hexOf([0, 8, 4].map((n) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))));
}
// 色相と鮮やかさはそのままに、明るさだけを動かして、どの地に対しても 4.5:1 以上にする（ライトは暗く、ダークは明るく）
export function readable(hex, grounds, lighter) {
  const [h, s, l0] = hslOf(hex);
  for (let l = l0; l >= 0 && l <= 1; l += lighter ? 0.01 : -0.01) {
    const c = hexOfHsl(h, s, l);
    if (grounds.every((g) => contrast(c, g) >= 4.5)) return c;
  }
  return lighter ? '#FFFFFF' : '#000000';
}
const LIGHT = { surfaces: ['#FFFFFF', '#F2F2F7'], card: '#FFFFFF' };
const DARK = { surfaces: ['#1C1C1E', '#000000', '#2C2C2E'], card: '#1C1C1E' };

// 既定のアクセント（抹茶の黄緑）と、色を選ぶシートのよく使う色
export const DEFAULT_ACCENT = '#8DB255';
export const ACCENT_PRESETS = ['#8DB255', '#347255', '#3478F6', '#8E5BD6', '#E5484D', '#F2902F', '#8E8E93'];

// アクセントから作る色。[ライト, ダーク] のそれぞれに
// accent（地に塗る色）、onAccent（その上の文字）、accentText（面の上の文字・アイコン）、accentSoft（淡い地）、accentInk（その上の文字）
// on は地の上の文字の色（利用者が選んだもの）。なければ白か黒の読みやすいほう
export function accentSet(hex = DEFAULT_ACCENT, on = null) {
  const onAccent = isHex(on) ? on.toUpperCase() : contrast('#FFFFFF', hex) >= contrast('#000000', hex) ? '#FFFFFF' : '#000000';
  return [[LIGHT, false], [DARK, true]].map(([m, lighter]) => {
    const accentSoft = mix(m.card, hex, 0.18);
    return { accent: hex, onAccent, accentText: readable(hex, [...m.surfaces, accentSoft], lighter), accentSoft, accentInk: readable(hex, [accentSoft], lighter) };
  });
}
// 自由な色のカテゴリの [文字, 地]。[ライト, ダーク]。文字は一覧の行のカテゴリの名前のように地のない面にも置くので、面にも 4.5:1 以上
export function toneSet(hex) {
  return [[LIGHT, false, 0.22], [DARK, true, 0.3]].map(([m, lighter, t]) => {
    const bg = mix(m.card, hex, t);
    return [readable(hex, [bg, ...m.surfaces], lighter), bg];
  });
}
// カテゴリの色の値（決まった色の名前か #RRGGBB）から [[ライトの文字, 地], [ダークの文字, 地]] を返す。点の色は toneDot
const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
export const tonePair = (key) => (isHex(key) ? toneSet(key) : tones[key] ?? tones.gray);
export const toneDot = (key, i) => (isHex(key) ? key : tonePair(key)[i][0]);
const A = accentSet();

export const colors = {
  bg: ['#F2F2F7', '#000000'], // systemGroupedBackground
  surface: ['#FFFFFF', '#1C1C1E'], // secondarySystemGroupedBackground
  surface2: ['#F2F2F7', '#2C2C2E'], // tertiarySystemGroupedBackground
  label: ['#000000', '#FFFFFF'],
  secondary: ['#6E6E73', '#98989D'],
  // プレースホルダーとシェブロンだけ（本文には使わない）
  tertiary: ['#A1A1A6', '#636366'],
  separator: ['#C6C6C8', '#38383A'],
  fill: ['rgba(118, 118, 128, 0.12)', 'rgba(118, 118, 128, 0.24)'], // tertiarySystemFill
  segment: ['#FFFFFF', '#636366'], // セグメントの選んだ側
  // シートの地と、その上の面（ダークでは一段明るい elevated の色にして、下の画面と分ける）
  sheet: ['#F2F2F7', '#1C1C1E'],
  sheetSurface: ['#FFFFFF', '#2C2C2E'],
  // アクセントの既定。利用者が選んだら、画面が accentSet の値で上書きする
  accent: [A[0].accent, A[1].accent],
  onAccent: [A[0].onAccent, A[1].onAccent],
  accentText: [A[0].accentText, A[1].accentText],
  accentSoft: [A[0].accentSoft, A[1].accentSoft],
  accentInk: [A[0].accentInk, A[1].accentInk],
  // 赤は「コントラストを上げる」の値（標準の systemRed は白の上で 4.5:1 に届かない）
  danger: ['#D70015', '#FF6961'],
  onDanger: ['#FFFFFF', '#000000'],
  material: ['rgba(249, 249, 249, 0.8)', 'rgba(29, 29, 31, 0.76)'],
  overlay: ['rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 0.55)'],
  shadow: ['rgba(0, 0, 0, 0.08)', 'rgba(0, 0, 0, 0)'],
};

// カテゴリの色。{ 名前: [[ライトの文字, ライトの地], [ダークの文字, ダークの地]] }。割り当ては view.js の toneOf
export const tones = {
  green: [['#3f6953', '#d9e7df'], ['#b3d1c1', '#264032']],
  teal: [['#3a676b', '#d5e5e7'], ['#b0d1d4', '#253f41']],
  blue: [['#3b5f9f', '#dce3f1'], ['#a6badd', '#252f41']],
  purple: [['#6f51a0', '#e5e0ee'], ['#bdaed6', '#302541']],
  magenta: [['#944771', '#efe0e8'], ['#d7acc4', '#412534']],
  red: [['#9f4439', '#f2e1df'], ['#ddaca6', '#412825']],
  orange: [['#94531b', '#f6e5d7'], ['#ddc0a6', '#413225']],
  amber: [['#785f20', '#f2e9d4'], ['#ddcea6', '#413925']],
  brown: [['#79593d', '#ece3db'], ['#d6c0ae', '#413225']],
  olive: [['#5c6638', '#e4e8d7'], ['#ccd4b0', '#3b4125']],
  gray: [['#626057', '#e5e5e2'], ['#c5c4be', '#363530']],
};

// iOS のテキストスタイル。[大きさ, 行の高さ, 太さ]（pt。Web は 17 を 1rem として rem にする）
export const type = {
  largeTitle: [34, 41, '700'],
  title2: [22, 28, '700'],
  title3: [20, 25, '600'],
  headline: [17, 22, '600'],
  body: [17, 22, '400'],
  callout: [16, 21, '400'],
  subhead: [15, 20, '400'],
  footnote: [13, 18, '400'],
  caption: [12, 16, '400'],
};

export const radius = { card: 14, sheet: 12, control: 10 };

// 動き。ばねは React Native の Animated.spring に、ease と duration は Web の transition に使う
export const motion = {
  spring: { damping: 22, stiffness: 260, mass: 1 },
  ease: 'cubic-bezier(0.32, 0.72, 0, 1)',
  duration: 350,
  press: 0.97,
};
