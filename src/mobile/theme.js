// 値は一覧の画面と同じ ../shared/theme.js から取り、端末のライト・ダークと、利用者が選んだアクセントに合わせて選ぶ。
// アクセントは App が AccentContext で渡す（データの accent）。カテゴリの色は決まった色の名前か #RRGGBB
import { createContext, useContext, useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { colors, type, radius, motion, accentSet, tonePair, toneDot } from '../shared/theme.js';

export { motion, radius };
export const AccentContext = createContext(null);

function build(i, accent) {
  const c = { ...Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, v[i]])), ...accentSet(accent ?? undefined)[i] };
  // [文字, 地] と、点の色
  const tone = (key) => tonePair(key)[i];
  const dot = (key) => toneDot(key, i);
  const t = Object.fromEntries(Object.entries(type).map(([k, [fontSize, lineHeight, fontWeight]]) => [k, { fontSize, lineHeight, fontWeight, color: c.label }]));
  const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    largeTitle: { ...t.largeTitle, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
    secondary: { ...t.subhead, color: c.secondary },
    footnote: { ...t.footnote, color: c.secondary },
    error: { ...t.footnote, color: c.danger },
    ok: { ...t.footnote, color: c.accentText },
    group: { marginHorizontal: 16, borderRadius: radius.control, backgroundColor: c.surface, overflow: 'hidden' },
    groupTitle: { ...t.footnote, color: c.secondary, marginHorizontal: 32, marginTop: 28, marginBottom: 6 },
    groupNote: { ...t.footnote, color: c.secondary, marginHorizontal: 32, marginTop: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 10, paddingHorizontal: 16 },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: c.separator, marginLeft: 16 },
    field: { ...t.body, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.control, backgroundColor: c.fill, color: c.label },
    card: { borderRadius: radius.card, backgroundColor: c.surface, overflow: 'hidden' },
    shadow: { shadowColor: '#000', shadowOpacity: i ? 0 : 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  });
  return { dark: i === 1, c, tone, dot, t, s };
}
const cache = new Map();

export function useTheme() {
  const dark = useColorScheme() === 'dark';
  const accent = useContext(AccentContext);
  return useMemo(() => {
    const key = `${dark ? 1 : 0}${accent ?? ''}`;
    if (!cache.has(key)) cache.set(key, build(dark ? 1 : 0, accent));
    return cache.get(key);
  }, [dark, accent]);
}
