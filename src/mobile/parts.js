// 画面で共通に使う小さな部品
import { Pressable, Text } from 'react-native';
import { tones, ui } from './theme';

export function Btn({ title, onPress, ghost, danger, disabled }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[ghost ? ui.btnGhost : ui.btn, danger && !ghost && { backgroundColor: tones.red[0] }, disabled && { opacity: 0.5 }]}>
      <Text style={[ghost ? ui.btnGhostText : ui.btnText, danger && ghost && { color: tones.red[0] }]}>{title}</Text>
    </Pressable>
  );
}

// tone を渡すとカテゴリの色で塗る
export function Chip({ label, on, tone, onPress }) {
  const [fg, bg] = tone ? tones[tone] : [];
  return (
    <Pressable onPress={onPress} style={[ui.chip, tone && { backgroundColor: bg, borderColor: bg }, on && ui.chipOn]}>
      <Text style={[ui.chipText, tone && { color: fg, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

// { text, kind: '' | 'ok' | 'error' }
export function Status({ status }) {
  if (!status?.text) return null;
  return <Text style={status.kind === 'error' ? ui.error : status.kind === 'ok' ? ui.ok : ui.muted}>{status.text}</Text>;
}

export const https = (url) => (typeof url === 'string' && /^https:\/\//.test(url) ? url : null);
