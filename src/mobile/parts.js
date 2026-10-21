// 画面で共通に使う部品。一覧の画面（src/site）の部品と同じ形にする。
// アイコンは SF Symbols、触覚は expo-haptics、バーの素材は expo-blur。動きを減らす設定では、拡大縮小と移動をやめる
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { motion, radius, useTheme } from './theme';

export const https = (url) => (typeof url === 'string' && /^https:\/\//.test(url) ? url : null);
export const NAV_HEIGHT = 44;
export const TAB_HEIGHT = 49;

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
  return <SymbolView name={name} size={size} tintColor={color ?? c.accent} weight={weight} type="monochrome" />;
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
  const fg = filled ? (danger ? c.onDanger : c.onAccent) : danger ? c.danger : c.accent;
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
      <Text style={[t.body, { color: disabled ? c.tertiary : danger ? c.danger : c.accent, fontWeight: strong ? '600' : '400' }]}>{title}</Text>
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
  const { c, t, tone: toneOf } = useTheme();
  const fg = on ? c.onAccent : c.label;
  return (
    <Press onPress={() => { haptic.select(); onPress(); }} scale={0.95} accessibilityState={{ selected: Boolean(on) }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? c.accent : c.fill }}>
      {tone ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: toneOf(tone)[0], borderWidth: on ? 1.5 : 0, borderColor: c.onAccent }} /> : null}
      <Text style={[t.subhead, { color: fg, fontWeight: on ? '600' : '400' }]}>{label}</Text>
      {count !== undefined ? <Text style={[t.subhead, { color: on ? fg : c.secondary }]}>{count}</Text> : null}
    </Press>
  );
}

// セグメント。選んだ側のつまみをばねで動かす
export function Segmented({ items, value, onChange }) {
  const { c, t } = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, items.findIndex(([k]) => k === value));
  const x = useRef(new Animated.Value(index)).current;
  useEffect(() => {
    if (motionOK()) Animated.spring(x, { toValue: index, ...motion.spring, useNativeDriver: true }).start();
    else x.setValue(index);
  }, [index]);
  const each = width ? (width - 4) / items.length : 0;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', padding: 2, borderRadius: 9, backgroundColor: c.fill }} accessibilityRole="tablist">
      {each ? <Animated.View style={{ position: 'absolute', top: 2, bottom: 2, left: 2, width: each, borderRadius: 7, backgroundColor: c.segment, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, transform: [{ translateX: Animated.multiply(x, each) }] }} /> : null}
      {items.map(([key, label]) => (
        <Pressable key={key} onPress={() => { if (key !== value) { haptic.select(); onChange(key); } }} style={{ flex: 1, minHeight: 30, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="tab" accessibilityState={{ selected: key === value }}>
          <Text style={[t.footnote, { fontWeight: key === value ? '600' : '500' }]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// 上のバー。大きな見出しが隠れるほど送ると、素材と小さな見出しを出す（scrollY は contentInset の分だけ負から始まる）
export function NavBar({ title, scrollY, left, right }) {
  const { c, t } = useTheme();
  const insets = useSafeAreaInsets();
  const shown = scrollY ? scrollY.interpolate({ inputRange: [-insets.top - 12, -insets.top + 8], outputRange: [0, 1], extrapolate: 'clamp' }) : 1;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: insets.top }}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: shown }]}>
        <BlurView tint="systemChromeMaterial" intensity={100} style={StyleSheet.absoluteFill} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: c.separator }} />
      </Animated.View>
      <View style={{ height: NAV_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
        <View style={{ flex: 1, alignItems: 'flex-start' }}>{left}</View>
        <Animated.Text numberOfLines={1} style={[t.headline, { opacity: shown, maxWidth: '55%' }]}>{title}</Animated.Text>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }}>{right}</View>
      </View>
    </View>
  );
}

// 上のバーの下から始まる送り。iOS では contentInset で空けるので、引っぱって再読み込みもバーの下に出る
export function useScroll() {
  const insets = useSafeAreaInsets();
  const top = insets.top + NAV_HEIGHT;
  const scrollY = useRef(new Animated.Value(-top)).current;
  return {
    scrollY,
    props: {
      contentInset: { top },
      contentOffset: { x: 0, y: -top },
      scrollIndicatorInsets: { top, bottom: TAB_HEIGHT },
      automaticallyAdjustContentInsets: false,
      contentInsetAdjustmentBehavior: 'never',
      onScroll: Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true }),
      scrollEventThrottle: 16,
    },
    bottom: insets.bottom + TAB_HEIGHT + 24,
  };
}

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

// 下からのシート（pageSheet）。下へのスワイプで閉じる
export function Sheet({ visible, onClose, title, left, right, children, scroll = true }) {
  const { c, t } = useTheme();
  const Body = scroll ? ScrollView : View;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.sheet }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 8, paddingHorizontal: 8, minHeight: 56 }}>
          <View style={{ flex: 1, alignItems: 'flex-start' }}>{left ?? <TextBtn title="キャンセル" onPress={onClose} />}</View>
          <Text style={t.headline} accessibilityRole="header">{title}</Text>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>{right}</View>
        </View>
        <Body style={{ flex: 1 }} contentContainerStyle={scroll ? { padding: 16, paddingBottom: 48, gap: 12 } : undefined} keyboardShouldPersistTaps="handled">{children}</Body>
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
