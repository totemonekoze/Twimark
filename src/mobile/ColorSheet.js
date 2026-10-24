// 色を選ぶシート（アクセント、アクセントの文字、カテゴリの色で同じもの。一覧の画面の src/site/colors.js と同じ並び）。
// Expo Go に OS の色の選び方の部品がないので、彩度と明るさの四角と色相の帯を expo-linear-gradient で描き、指でなぞって選ぶ。
// RGB の欄と #RRGGBB の欄、よく使う色も同じ値を指す。カテゴリのときは、決まった11色と「自動（並び順の色）」も出す。
// アクセントの文字のときは、白・黒と「自動」を出し、見本の組が 4.5:1 に届かなければ注意を出す（保存はできる）。
// 四角と帯をなぞっている間はシートの送りを止め、シートは下へなぞっても閉じない（なぞりを色の操作だけにする）
import { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { accentSet, contrast, tonePair, tones, DEFAULT_ACCENT, ACCENT_PRESETS } from '../shared/theme.js';
import { describeError } from '../shared/store.js';
import { radius, useTheme } from './theme';
import { Btn, haptic, Sheet, TextBtn } from './parts';

const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hexOf = (rgb) => `#${rgb.map((v) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
function hsvOf(hex) {
  const [r, g, b] = rgbOf(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: max ? d / max : 0, v: max };
}
function hexOfHsv({ h, s, v }) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return hexOf([f(5), f(3), f(1)].map((x) => x * 255));
}
const clamp = (x) => Math.min(1, Math.max(0, x));

// 指でなぞる面。on(x, y) は面の中の 0〜1 の位置。holding(true/false) はなぞり始めと終わり
function useDrag(size, on, holding) {
  const start = useRef({ x: 0, y: 0 });
  const latest = useRef({ size, on, holding });
  latest.current = { size, on, holding };
  return useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      latest.current.holding(true);
      start.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
      const { size: area, on: f } = latest.current;
      f(clamp(start.current.x / area.w), clamp(start.current.y / area.h));
    },
    onPanResponderMove: (_, g) => {
      const { size: area, on: f } = latest.current;
      f(clamp((start.current.x + g.dx) / area.w), clamp((start.current.y + g.dy) / area.h));
    },
    onPanResponderRelease: () => latest.current.holding(false),
    onPanResponderTerminate: () => latest.current.holding(false),
  })).current;
}

function Swatch({ color, on, label, onPress }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} hitSlop={4}
      style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color, borderWidth: on ? 3 : 0.5, borderColor: on ? c.label : 'rgba(0,0,0,0.15)' }} />
  );
}

// kind: 'accent' | 'accent-text' | 'category'。value は今の値（#RRGGBB・決まった色の名前・null）。auto はカテゴリの「自動」のときの今の色。
// pair は accent なら今の文字の色、accent-text なら今のアクセント（見本と読みやすさの計算に使う）
export default function ColorSheet({ visible, kind, title, value, auto = 'gray', pair = null, onSave, onClose }) {
  const { c, t, s, dark } = useTheme();
  const i = dark ? 1 : 0;
  const isCategory = kind === 'category';
  const isText = kind === 'accent-text';
  const [holding, setHolding] = useState(false);
  const [hsv, setHsv] = useState(hsvOf(DEFAULT_ACCENT));
  const [fields, setFields] = useState({ r: '', g: '', b: '', hex: '' });
  const [square, setSquare] = useState({ w: 1, h: 180 });
  const [bar, setBar] = useState({ w: 1, h: 28 });
  const [error, setError] = useState('');
  const picked = hexOfHsv(hsv);

  // 開いたら、今の値から始める
  useEffect(() => {
    if (!visible) return;
    setError('');
    const start = isHex(value) ? value : isCategory ? tonePair(value ?? auto)[i][0] : isText ? accentSet(pair ?? DEFAULT_ACCENT)[i].onAccent : DEFAULT_ACCENT;
    setHsv(hsvOf(start));
  }, [visible]);
  // 欄は、打っている途中でなければ選んだ色にそろえる
  useEffect(() => { const [r, g, b] = rgbOf(picked); setFields({ r: String(r), g: String(g), b: String(b), hex: picked }); }, [picked]);

  const squareDrag = useDrag(square, (x, y) => setHsv((now) => ({ ...now, s: x, v: 1 - y })), setHolding);
  const barDrag = useDrag(bar, (x) => setHsv((now) => ({ ...now, h: x * 359.9 })), setHolding);
  const typeRgb = (key, text) => {
    const next = { ...fields, [key]: text.replace(/[^0-9]/g, '').slice(0, 3) };
    setFields(next);
    const rgb = ['r', 'g', 'b'].map((k) => Number(next[k]));
    if (rgb.every((v) => v >= 0 && v <= 255) && ['r', 'g', 'b'].every((k) => next[k] !== '')) setHsv(hsvOf(hexOf(rgb)));
  };
  const typeHex = (text) => {
    const hex = text.startsWith('#') ? text : `#${text}`;
    setFields({ ...fields, hex: text });
    if (isHex(hex)) setHsv(hsvOf(hex));
  };
  const finish = async (next) => {
    setError('');
    try {
      await onSave(next);
      haptic.success();
      onClose();
    } catch (err) {
      setError(describeError(err, '保存できませんでした。'));
    }
  };

  const ground = isText ? pair ?? DEFAULT_ACCENT : picked;
  const a = accentSet(ground, isText ? picked : pair)[i];
  const ratio = contrast(a.onAccent, ground);
  const [toneFg, toneBg] = tonePair(picked)[i];
  return (
    <Sheet visible={visible} onClose={onClose} title={title} right={<TextBtn title="保存" strong onPress={() => finish(picked)} />} scrollEnabled={!holding} swipeToClose={false}>
      {isCategory ? (
        <>
          <Text style={s.footnote}>決まった色</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {Object.keys(tones).map((name) => <Swatch key={name} color={tonePair(name)[i][0]} on={value === name} label={name} onPress={() => finish(name)} />)}
          </View>
          <Text style={[s.footnote, { marginTop: 8 }]}>自由な色</Text>
        </>
      ) : null}
      {isText ? (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[['#FFFFFF', '白'], ['#000000', '黒']].map(([hex, label]) => <Swatch key={hex} color={hex} on={value === hex} label={label} onPress={() => finish(hex)} />)}
          </View>
          <Text style={[s.footnote, { marginTop: 8 }]}>自由な色</Text>
        </>
      ) : null}

      {/* 見本 */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: 16, borderRadius: radius.card, backgroundColor: c.sheetSurface }}>
        {isCategory ? (
          <>
            <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 7, backgroundColor: toneBg }}><Text style={[t.footnote, { color: toneFg, fontWeight: '600' }]}>カテゴリ</Text></View>
            <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: toneBg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 20, fontWeight: '700', color: toneFg }}>X</Text></View>
          </>
        ) : (
          <>
            <View style={{ paddingHorizontal: 14, minHeight: 34, justifyContent: 'center', borderRadius: 999, backgroundColor: a.accent }}><Text style={[t.subhead, { color: a.onAccent, fontWeight: '600' }]}>選択中</Text></View>
            <View style={{ paddingHorizontal: 16, minHeight: 36, justifyContent: 'center', borderRadius: radius.control, backgroundColor: a.accent }}><Text style={[t.subhead, { color: a.onAccent, fontWeight: '600' }]}>ボタン</Text></View>
            {isText
              ? <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: a.accent, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 24, fontWeight: '600', color: a.onAccent }}>＋</Text></View>
              : <Text style={[t.body, { color: a.accentText, fontWeight: '600' }]}>リンク</Text>}
          </>
        )}
      </View>
      {!isCategory && ratio < 4.5 ? <Text style={s.error}>読みにくいかもしれません（コントラスト {ratio.toFixed(1)}:1）</Text> : null}

      {/* 彩度（横）と明るさ（縦）の四角。地は色相の色に、白と黒の重ねで作る */}
      <View {...squareDrag.panHandlers} onLayout={(e) => setSquare({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        style={{ height: 180, borderRadius: 12, overflow: 'hidden', backgroundColor: hexOfHsv({ h: hsv.h, s: 1, v: 1 }) }} accessible accessibilityLabel="彩度と明るさ">
        <LinearGradient colors={['#FFFFFF', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <LinearGradient colors={['rgba(0,0,0,0)', '#000000']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View pointerEvents="none" style={{ position: 'absolute', left: hsv.s * square.w - 12, top: (1 - hsv.v) * square.h - 12, width: 24, height: 24, borderRadius: 12, borderWidth: 3, borderColor: '#FFFFFF', backgroundColor: picked, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }} />
      </View>
      {/* 色相の帯 */}
      <View {...barDrag.panHandlers} onLayout={(e) => setBar({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} style={{ height: 28, justifyContent: 'center' }} accessible accessibilityLabel="色相">
        <LinearGradient colors={['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 20, borderRadius: 10 }} pointerEvents="none" />
        <View pointerEvents="none" style={{ position: 'absolute', left: (hsv.h / 360) * bar.w - 14, width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: '#FFFFFF', backgroundColor: hexOfHsv({ h: hsv.h, s: 1, v: 1 }), shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }} />
      </View>

      {/* RGB と #RRGGBB */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[['r', 'R'], ['g', 'G'], ['b', 'B']].map(([k, label]) => (
          <View key={k} style={{ flex: 1, gap: 4 }}>
            <Text style={s.footnote}>{label}</Text>
            <TextInput style={[s.field, { minHeight: 38, paddingVertical: 6 }]} value={fields[k]} onChangeText={(v) => typeRgb(k, v)} keyboardType="number-pad" maxLength={3} accessibilityLabel={label} />
          </View>
        ))}
      </View>
      <View style={{ gap: 4 }}>
        <Text style={s.footnote}>#RRGGBB</Text>
        <TextInput style={[s.field, { minHeight: 38, paddingVertical: 6 }]} value={fields.hex} onChangeText={typeHex} autoCapitalize="characters" autoCorrect={false} maxLength={7} accessibilityLabel="#RRGGBB" />
      </View>

      <Text style={[s.footnote, { marginTop: 4 }]}>よく使う色</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {ACCENT_PRESETS.map((hex) => <Swatch key={hex} color={hex} on={picked === hex} label={hex} onPress={() => { haptic.select(); setHsv(hsvOf(hex)); }} />)}
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Btn kind="tinted" title={isCategory ? '自動（並び順の色）' : isText ? '自動（白か黒の読みやすいほう）' : '既定に戻す'} onPress={() => finish(null)} />
    </Sheet>
  );
}
