// 画面の値の正本。一覧の画面（build.mjs が tokens.css に書き出す）とアプリ（src/mobile/theme.js）が使う。
// 地・面・文字・区切りは iOS のシステムの色（グループ表示）。アクセントは Portal のくすみ緑、カテゴリの色はくすみパステル。
// 色は [ライト, ダーク]。文字に使う組は、ライトとダークの両方で 4.5:1 以上（self-test が確かめる）

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
  accent: ['#347255', '#7FB89B'],
  onAccent: ['#FFFFFF', '#0B2117'],
  accentSoft: ['#DCEBE2', '#1F3A2D'],
  accentInk: ['#24523E', '#A9D6BE'],
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
