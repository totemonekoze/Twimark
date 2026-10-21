// 値は一覧の画面と同じ ../shared/theme.js から取り、端末のライト・ダークに合わせて選ぶ。カテゴリの色の割り当ては ../shared/view.js
import { useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { colors, tones, type, radius, motion } from '../shared/theme.js';

export { motion, radius };

function build(i) {
  const c = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, v[i]]));
  // [文字, 地]
  const tone = (name) => (tones[name] ?? tones.gray)[i];
  const t = Object.fromEntries(Object.entries(type).map(([k, [fontSize, lineHeight, fontWeight]]) => [k, { fontSize, lineHeight, fontWeight, color: c.label }]));
  const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    largeTitle: { ...t.largeTitle, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
    secondary: { ...t.subhead, color: c.secondary },
    footnote: { ...t.footnote, color: c.secondary },
    error: { ...t.footnote, color: c.danger },
    ok: { ...t.footnote, color: c.accent },
    group: { marginHorizontal: 16, borderRadius: radius.control, backgroundColor: c.surface, overflow: 'hidden' },
    groupTitle: { ...t.footnote, color: c.secondary, marginHorizontal: 32, marginTop: 28, marginBottom: 6 },
    groupNote: { ...t.footnote, color: c.secondary, marginHorizontal: 32, marginTop: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 10, paddingHorizontal: 16 },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: c.separator, marginLeft: 16 },
    field: { ...t.body, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.control, backgroundColor: c.fill, color: c.label },
    card: { borderRadius: radius.card, backgroundColor: c.surface, overflow: 'hidden' },
    shadow: { shadowColor: '#000', shadowOpacity: i ? 0 : 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  });
  return { dark: i === 1, c, tone, t, s };
}
const THEMES = [build(0), build(1)];

export function useTheme() {
  const dark = useColorScheme() === 'dark';
  return useMemo(() => THEMES[dark ? 1 : 0], [dark]);
}
