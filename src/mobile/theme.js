// 色は一覧の画面（src/site/style.css）と同じ。カテゴリの色の割り当ては ../shared/view.js
import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#f4f2ec',
  card: '#fcfbf8',
  text: '#3b3934',
  muted: '#67645b',
  line: '#e4dfd4',
  accent: '#347255',
  danger: '#a3413f',
};

// [文字, 地]
export const tones = {
  green: ['#3f6953', '#d9e7df'], teal: ['#3a676b', '#d5e5e7'], blue: ['#3b5f9f', '#dce3f1'],
  purple: ['#6f51a0', '#e5e0ee'], magenta: ['#944771', '#efe0e8'], red: ['#9f4439', '#f2e1df'],
  orange: ['#94531b', '#f6e5d7'], amber: ['#785f20', '#f2e9d4'], brown: ['#79593d', '#ece3db'],
  olive: ['#5c6638', '#e4e8d7'], gray: ['#626057', '#e5e5e2'],
};

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 16, gap: 12 },
  h1: { fontSize: 20, fontWeight: '700', color: colors.text },
  label: { fontSize: 13, color: colors.muted },
  text: { fontSize: 15, color: colors.text, lineHeight: 22 },
  muted: { fontSize: 13, color: colors.muted },
  error: { fontSize: 14, color: colors.danger },
  ok: { fontSize: 14, color: tones.green[0] },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text },
  btn: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', backgroundColor: colors.accent },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  btnGhost: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  btnGhostText: { color: colors.text, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  chipOn: { borderColor: colors.text },
  chipText: { fontSize: 13, color: colors.text },
});
