// 色を選ぶシート（アクセント、アクセントの文字、カテゴリの色で同じもの。一覧の画面の src/site/colors.js と同じ並び）。
// Expo Go に OS の色の選び方の部品がないので、彩度と明るさの四角と色相の帯を expo-linear-gradient で描き、指でなぞって選ぶ。
// RGB の欄と #RRGGBB の欄、よく使う色も同じ値を指す。カテゴリのときは、決まった11色と「自動（並び順の色）」も出す。
// アクセントの文字のときは、白・黒と「自動」を出し、見本の組が 4.5:1 に届かなければ注意を出す（保存はできる）。
// 見本・四角・色相の帯はシートの上側に固定し、送りの外に置く（送りと指を取り合わない）。残り（決まった色、RGB、よく使う色）だけを送る。
// 色見本の並びは、押したまま指を滑らせて選べる（指の下の見本を選び、変わるたびに触覚）。なぞっている間は送りを止める。シートは下へなぞっても閉じない
import { useEffect, useRef, useState } from 'react';
import { PanResponder, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { accentSet, contrast, tonePair, tones, DEFAULT_ACCENT, ACCENT_PRESETS } from '../shared/theme.js';
import { describeError } from '../shared/store.js';
import { hitIndex } from '../shared/view.js';
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

// 色見本の並び。items は [{ key, color, label, on }]。押したまま滑らせると、指の下の見本で onPick(item) を呼ぶ（変わるたびに触覚）。
// 離したら onDone(item)（押しただけのときも）。見本は指を受けず（pointerEvents）、並び全体で受けるので、位置は並びの中の座標になる
const GAP = 10;
function SwatchRow({ items, onPick, onDone, holding }) {
  const { c } = useTheme();
  const layouts = useRef([]);
  const latest = useRef({ items, onPick, onDone, holding });
  latest.current = { items, onPick, onDone, holding };
  const at = useRef({ x: 0, y: 0, i: -1 });
  const pick = (x, y) => {
    const rects = layouts.current.map((l) => (l ? { x: l.x, y: l.y, w: l.width, h: l.height } : { x: -1e6, y: -1e6, w: 0, h: 0 }));
    const i = hitIndex(rects, x, y, GAP / 2);
    if (i < 0 || i === at.current.i) return;
    at.current.i = i;
    haptic.select();
    latest.current.onPick?.(latest.current.items[i]);
  };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      latest.current.holding(true);
      at.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY, i: -1 };
      pick(at.current.x, at.current.y);
    },
    onPanResponderMove: (_, g) => pick(at.current.x + g.dx, at.current.y + g.dy),
    onPanResponderRelease: () => {
      latest.current.holding(false);
      const item = latest.current.items[at.current.i];
      if (item) latest.current.onDone?.(item);
    },
    onPanResponderTerminate: () => latest.current.holding(false),
  })).current;
  return (
    <View {...pan.panHandlers} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingVertical: 4 }} accessible={false}>
      {items.map((item, i) => (
        <View key={item.key} pointerEvents="none" onLayout={(e) => { layouts.current[i] = e.nativeEvent.layout; }}
          accessible accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: item.on }}
          accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={() => { latest.current.onPick?.(item); latest.current.onDone?.(item); }}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: item.color, borderWidth: item.on ? 3 : 0.5, borderColor: item.on ? c.label : 'rgba(0,0,0,0.15)' }} />
      ))}
    </View>
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
  // 決まった色・白黒は、押すか滑らせて離したときに保存して閉じる（滑らせている間は見本に出すだけ）
  const fixed = isCategory
    ? Object.keys(tones).map((name) => ({ key: name, color: tonePair(name)[i][0], label: name, on: value === name, value: name }))
    : isText ? [['#FFFFFF', '白'], ['#000000', '黒']].map(([hex, label]) => ({ key: hex, color: hex, label, on: value === hex, value: hex })) : null;
  const presets = ACCENT_PRESETS.map((hex) => ({ key: hex, color: hex, label: hex, on: picked === hex }));
  const preview = (item) => setHsv(hsvOf(item.color));
  return (
    <Sheet visible={visible} onClose={onClose} title={title} right={<TextBtn title="保存" strong onPress={() => finish(picked)} />} scroll={false} swipeToClose={false}>
      {/* 上側に固定: 見本、彩度と明るさの四角、色相の帯 */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.separator }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.card, backgroundColor: c.sheetSurface }}>
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
        {/* 色相の帯。押せる高さは 44、見た目の帯は 20 */}
        <View {...barDrag.panHandlers} onLayout={(e) => setBar({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} style={{ height: 44, justifyContent: 'center' }} accessible accessibilityLabel="色相">
          <LinearGradient colors={['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 20, borderRadius: 10 }} pointerEvents="none" />
          <View pointerEvents="none" style={{ position: 'absolute', top: 8, left: (hsv.h / 360) * bar.w - 14, width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: '#FFFFFF', backgroundColor: hexOfHsv({ h: hsv.h, s: 1, v: 1 }), shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }} />
        </View>
      </View>

      {/* 送る部分: 決まった色、RGB と #RRGGBB、よく使う色、自動 */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 12 }} scrollEnabled={!holding} keyboardShouldPersistTaps="handled">
        {fixed ? (
          <>
            <Text style={s.footnote}>{isCategory ? '決まった色' : '白か黒'}</Text>
            <SwatchRow items={fixed} onPick={preview} onDone={(item) => finish(item.value)} holding={setHolding} />
          </>
        ) : null}
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
        <SwatchRow items={presets} onPick={preview} holding={setHolding} />
        {error ? <Text style={s.error}>{error}</Text> : null}
        <Btn kind="tinted" title={isCategory ? '自動（並び順の色）' : isText ? '自動（白か黒の読みやすいほう）' : '既定に戻す'} onPress={() => finish(null)} />
      </ScrollView>
    </Sheet>
  );
}
