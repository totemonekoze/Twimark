// 画面で共通に使う部品。一覧の画面（src/site）の部品と同じ形にする。
// アイコンは SF Symbols、触覚は expo-haptics。上のバーは出さない。動きを減らす設定では、拡大縮小と移動をやめる
import { createContext, useContext, useRef } from 'react';
import { AccessibilityInfo, Animated, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { motion, radius, useTheme } from './theme';

export const https = (url) => (typeof url === 'string' && /^https:\/\//.test(url) ? url : null);

// 触覚。失敗しても操作は止めない
export const haptic = {
  select: () => Haptics.selectionAsync().catch(() => {}),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
};

let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduceMotion = v; }, () => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => { reduceMotion = v; });
export const motionOK = () => !reduceMotion;

export function Icon({ name, size = 22, color, weight = 'regular' }) {
  const { c } = useTheme();
  return <SymbolView name={name} size={size} tintColor={color ?? c.accentText} weight={weight} type="monochrome" />;
}

// 押している間だけ少し縮む。style は外側の Animated.View に付ける
export function Press({ onPress, onLongPress, disabled, style, children, scale = motion.press, accessibilityLabel, accessibilityRole = 'button', accessibilityState, hitSlop }) {
  const v = useRef(new Animated.Value(1)).current;
  const to = (value) => { if (motionOK()) Animated.spring(v, { toValue: value, ...motion.spring, useNativeDriver: true }).start(); };
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={disabled} onPressIn={() => to(scale)} onPressOut={() => to(1)} hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel} accessibilityRole={accessibilityRole} accessibilityState={accessibilityState ?? { disabled: Boolean(disabled) }}>
      <Animated.View style={[style, { transform: [{ scale: v }] }, disabled && { opacity: 0.4 }]}>{children}</Animated.View>
    </Pressable>
  );
}

// kind: filled（アクセントの地）| tinted（薄い地にアクセントの文字）
export function Btn({ title, onPress, kind = 'filled', danger, disabled, icon }) {
  const { c, t } = useTheme();
  const filled = kind === 'filled';
  const fg = filled ? (danger ? c.onDanger : c.onAccent) : danger ? c.danger : c.accentText;
  return (
    <Press onPress={onPress} disabled={disabled} style={{ minHeight: 50, borderRadius: radius.control, backgroundColor: filled ? (danger ? c.danger : c.accent) : c.fill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20 }}>
      {icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text style={[t.headline, { color: fg }]}>{title}</Text>
    </Press>
  );
}

// 文字だけのボタン（バーの「キャンセル」「追加」「編集」など）
export function TextBtn({ title, onPress, strong, disabled, danger }) {
  const { c, t } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, opacity: pressed ? 0.4 : 1 })} accessibilityRole="button">
      <Text style={[t.body, { color: disabled ? c.tertiary : danger ? c.danger : c.accentText, fontWeight: strong ? '600' : '400' }]}>{title}</Text>
    </Pressable>
  );
}

export function IconBtn({ name, onPress, label, color }) {
  return (
    <Press onPress={onPress} scale={0.85} accessibilityLabel={label} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={22} color={color} />
    </Press>
  );
}

// tone を渡すと、名前の前にカテゴリの色の点を出す
export function Chip({ label, count, on, tone, onPress }) {
  const { c, t, dot } = useTheme();
  const fg = on ? c.onAccent : c.label;
  return (
    <Press onPress={() => { haptic.select(); onPress(); }} scale={0.95} accessibilityState={{ selected: Boolean(on) }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? c.accent : c.fill }}>
      {tone ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot(tone), borderWidth: on ? 1.5 : 0, borderColor: c.onAccent }} /> : null}
      <Text style={[t.subhead, { color: fg, fontWeight: on ? '600' : '400' }]}>{label}</Text>
      {count !== undefined ? <Text style={[t.subhead, { color: on ? fg : c.secondary }]}>{count}</Text> : null}
    </Press>
  );
}

// 画面の送りの上下の余白。上は安全領域の上端から、下は浮かぶボタン（メニューと、その一段上の「＋」）に最後の行が隠れない分
export function useScroll() {
  const insets = useSafeAreaInsets();
  // hide は送りの合図（onScrollBeginDrag など）。各画面の送りに付けると、送っている間は下のメニューのボタンが消える
  return { top: insets.top + 8, bottom: Math.max(12, insets.bottom + 4) + 64 + 56 + 16, hide: useContext(ScrollHideContext) };
}
export const ScrollHideContext = createContext({});

export function LargeTitle({ children }) {
  const { s } = useTheme();
  return <Text style={s.largeTitle} accessibilityRole="header" numberOfLines={2}>{children}</Text>;
}

// グループ表示のリスト。子の間に区切りを入れる
export function Group({ title, note, children, style }) {
  const { s } = useTheme();
  const rows = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
  return (
    <View style={style}>
      {title ? <Text style={s.groupTitle}>{title}</Text> : null}
      {rows.length ? (
        <View style={s.group}>
          {rows.map((r, i) => <View key={r.key ?? i}>{i > 0 ? <View style={s.separator} /> : null}{r}</View>)}
        </View>
      ) : null}
      {note ? <Text style={s.groupNote}>{note}</Text> : null}
    </View>
  );
}

// 行。icon は左の色付きの四角（設定の行）、value は右の薄い文字、chevron は右の ›
export function Row({ icon, title, detail, value, onPress, chevron, danger, center, right, check, dot }) {
  const { c, t, s } = useTheme();
  const body = (
    <View style={[s.row, center && { justifyContent: 'center' }]}>
      {icon ? <View style={{ width: 29, height: 29, borderRadius: 7, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={17} color={c.onAccent} /></View> : null}
      {dot ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} /> : null}
      <View style={{ flex: center ? 0 : 1, minWidth: 0 }}>
        <Text style={[t.body, { color: danger ? c.danger : c.label }]}>{title}</Text>
        {detail ? <Text style={s.footnote}>{detail}</Text> : null}
      </View>
      {value ? <Text style={[t.body, { color: c.secondary }]}>{value}</Text> : null}
      {right}
      {check ? <Icon name="checkmark" size={17} weight="semibold" /> : null}
      {chevron ? <Icon name="chevron.right" size={14} weight="semibold" color={c.tertiary} /> : null}
    </View>
  );
  if (!onPress) return body;
  return <Pressable onPress={onPress} style={({ pressed }) => pressed && { backgroundColor: c.fill }} accessibilityRole="button">{body}</Pressable>;
}

// 下からのシート（pageSheet）。scrollEnabled は中の送りを止める（指でなぞって選ぶ部品の間）。
// swipeToClose を false にすると、下へなぞっても閉じない（渡さなければ React Native の既定）
export function Sheet({ visible, onClose, title, left, right, children, scroll = true, scrollEnabled = true, swipeToClose }) {
  const { c, t } = useTheme();
  const Body = scroll ? ScrollView : View;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} allowSwipeDismissal={swipeToClose}>
      <View style={{ flex: 1, backgroundColor: c.sheet }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 8, paddingHorizontal: 8, minHeight: 56 }}>
          <View style={{ flex: 1, alignItems: 'flex-start' }}>{left ?? <TextBtn title="キャンセル" onPress={onClose} />}</View>
          <Text style={t.headline} accessibilityRole="header">{title}</Text>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>{right}</View>
        </View>
        <Body style={{ flex: 1 }} contentContainerStyle={scroll ? { padding: 16, paddingBottom: 48, gap: 12 } : undefined} scrollEnabled={scroll ? scrollEnabled : undefined} keyboardShouldPersistTaps="handled">{children}</Body>
      </View>
    </Modal>
  );
}

// 空・失敗の表示（iOS の Content Unavailable の形）
export function Empty({ icon, title, text, action }) {
  const { c, t, s } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingHorizontal: 32, paddingTop: 64 }}>
      <Icon name={icon} size={44} color={c.tertiary} />
      <Text style={[t.title3, { textAlign: 'center' }]}>{title}</Text>
      {text ? <Text style={[s.footnote, { textAlign: 'center' }]}>{text}</Text> : null}
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}

// { text, kind: '' | 'ok' | 'error' }
export function Status({ status }) {
  const { s } = useTheme();
  if (!status?.text) return null;
  return <Text style={status.kind === 'error' ? s.error : status.kind === 'ok' ? s.ok : s.footnote}>{status.text}</Text>;
}
