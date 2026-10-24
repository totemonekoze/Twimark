// 一覧。縦長の Web の一覧の画面と同じ並び（大きな見出し、検索とサイトのフィルター、カテゴリとサブカテゴリのチップ、カード）。
// カードは画像が上に大きく、本文は5行を超えたら「続きを見る」でその場で開く。
// カードを押すと元のページ、「…」か強く押す（3D Touch）とメニュー（カテゴリの変更、元のページ、削除）、カテゴリの札でカテゴリの変更。
// カードを長押しすると写しが指に付いて持ち上がり、下からカテゴリの置き場が出る。札に離すとそこへ移す（DropTray）。
// 一覧のタブをもう一度押すと（toTop が変わると）最上部へ送る。ステータスバーを押しても最上部へ（送りはこのリストだけ）
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Animated, FlatList, Image, Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { describeError, ops, SITES, subOf } from '../../shared/store.js';
import { categoryTone, hitIndex, searchTextOf, textMatches, PRESS } from '../../shared/view.js';
import { motion, radius, useTheme } from '../theme';
import { BarHoldContext, Btn, Chip, Empty, haptic, https, Icon, IconBtn, LargeTitle, motionOK, Press, Row, Sheet, TextBtn, useScroll } from '../parts';

const day = (iso) => (iso ? new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '投稿日不明');
const LINES = 5;
const shortLabel = (b) => {
  const label = b.title || b.text || b.url;
  return `${SITES[b.site] ?? ''}：${label.slice(0, 60)}${label.length > 60 ? '…' : ''}`;
};
// 画像（写真、動画のサムネイル）。https だけ、4枚まで
const imagesOf = (b) => [...(b.photos ?? []).map((p) => ({ src: p.url })), ...(b.videos ?? []).map((v) => ({ src: v.thumbnail, video: true }))].filter((m) => https(m.src)).slice(0, 4);
const placeOf = (data, b) => {
  if (!data.categories.includes(b.category)) return `${b.category}（未分類）`;
  const sub = subOf(data, b);
  return sub ? `${b.category} › ${sub}` : b.category;
};
const SITE_CHOICES = [['', 'すべてのサイト'], ...Object.entries(SITES)];

// 検索の欄。右端にサイトのフィルター（押すとメニュー。絞り込んでいる間はアクセントの文字の色と点）
function SearchField({ value, onChange, site, onSite }) {
  const { c, t } = useTheme();
  const [focused, setFocused] = useState(false);
  const pickSite = () => {
    const options = [...SITE_CHOICES.map(([key, label]) => (key === site ? `✓ ${label}` : label)), 'キャンセル'];
    ActionSheetIOS.showActionSheetWithOptions({ title: 'サイトで絞り込む', options, cancelButtonIndex: options.length - 1 }, (i) => {
      if (i < SITE_CHOICES.length && SITE_CHOICES[i][0] !== site) { haptic.select(); onSite(SITE_CHOICES[i][0]); }
    });
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingLeft: 8, borderRadius: 10, backgroundColor: c.fill }}>
        <Icon name="magnifyingglass" size={16} color={c.secondary} />
        <TextInput style={[t.body, { flex: 1, paddingVertical: 0 }]} value={value} onChangeText={onChange} placeholder="検索" placeholderTextColor={c.secondary}
          clearButtonMode="while-editing" autoCorrect={false} returnKeyType="search" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} accessibilityLabel="タイトル、本文、投稿者、カテゴリで探す" />
        <Press onPress={pickSite} scale={0.85} style={{ width: 44, height: 44, marginVertical: -4, alignItems: 'center', justifyContent: 'center' }}
          accessibilityLabel={site ? `サイトで絞り込む（今は${SITES[site] ?? site}）` : 'サイトで絞り込む'}>
          <Icon name="line.3.horizontal.decrease" size={18} color={site ? c.accentText : c.secondary} />
          {site ? <View style={{ position: 'absolute', top: 9, right: 9, width: 7, height: 7, borderRadius: 4, backgroundColor: c.accentText }} /> : null}
        </Press>
      </View>
      {focused ? <TextBtn title="キャンセル" onPress={() => { onChange(''); Keyboard.dismiss(); }} /> : null}
    </View>
  );
}

// 画像は上に大きく。1枚は全幅（高さを抑える）、複数は2列
function Media({ b }) {
  const { c } = useTheme();
  const [failed, setFailed] = useState([]);
  const images = imagesOf(b).filter((m) => !failed.includes(m.src));
  if (!images.length) return null;
  const one = images.length === 1;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2, backgroundColor: c.surface2 }}>
      {images.map((m) => (
        <View key={m.src} style={{ flexGrow: 1, flexBasis: one ? '100%' : '45%' }}>
          <Image source={{ uri: m.src }} style={{ width: '100%', aspectRatio: one ? 16 / 10 : 16 / 9, maxHeight: one ? 340 : 300 }} resizeMode="cover"
            onError={() => setFailed((f) => [...f, m.src])} accessibilityLabel={m.video ? '動画のサムネイル' : '添付画像'} accessibilityIgnoresInvertColors />
          {m.video ? <View style={{ position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 8, paddingVertical: 1, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.6)' }}><Text style={{ color: '#FFFFFF', fontSize: 12 }}>動画</Text></View> : null}
        </View>
      ))}
    </View>
  );
}

function Card({ b, data, onMenu, onMove, onLift, lifted }) {
  const { c, t, s, tone } = useTheme();
  // 強く押す（3D Touch のある機種だけ force が入る。0〜1）。強さに合わせて少し縮め、PRESS.force を超えたらメニュー。
  // そのあとの長押しと押下（離したとき）はしない
  const forced = useRef(false);
  const squeeze = useRef(new Animated.Value(1)).current;
  const onForce = (e) => {
    const f = e.nativeEvent.force ?? 0;
    if (!f || forced.current) return;
    if (motionOK()) squeeze.setValue(1 - 0.04 * Math.min(1, f / PRESS.force));
    if (f < PRESS.force) return;
    forced.current = true;
    squeeze.setValue(1);
    haptic.heavy();
    onMenu(b);
  };
  const release = () => squeeze.setValue(1);
  const [open, setOpen] = useState(false);
  // 5行を超えるかは、行数を数える見えない写しで測る
  const [long, setLong] = useState(false);
  const [fg, bg] = tone(categoryTone(data, b.category));
  const link = https(b.url);
  // 手で直されたデータでは本文がないこともある
  const text = typeof b.text === 'string' ? b.text : '';
  const place = placeOf(data, b);
  const textStyle = [t.subhead, { lineHeight: 22 }];
  return (
    <Animated.View onTouchStart={(e) => { forced.current = false; onForce(e); }} onTouchMove={onForce} onTouchEnd={release} onTouchCancel={release}
      style={{ opacity: lifted ? 0.3 : 1, transform: [{ scale: squeeze }] }}>
    <Press onPress={() => !forced.current && link && WebBrowser.openBrowserAsync(link)} onLongPress={(e) => !forced.current && onLift(b, e)} delayLongPress={PRESS.hold}
      scale={0.98} style={[s.shadow, { borderRadius: radius.card }]}
      accessibilityLabel={`${place}、${SITES[b.site] ?? b.site}、${b.title || text.slice(0, 80)}`} accessibilityHint="押すと元のページを開きます。長押しで持ち上げてカテゴリへ移す"
      accessibilityActions={[{ name: 'move', label: 'カテゴリを変える' }, { name: 'menu', label: '操作' }]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'move' ? onMove(b) : onMenu(b))}>
      {/* 影は外側、角丸の切り抜きは内側（同じ View に overflow: hidden を付けると影が消える） */}
      <View style={s.card}>
        <Media b={b} />
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 }}>
            <Press onPress={() => onMove(b)} scale={0.94} style={{ backgroundColor: bg, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 2, maxWidth: 220 }} accessibilityLabel={`カテゴリ: ${place}（押すと変える）`}>
              <Text style={[t.caption, { color: fg, fontWeight: '600' }]} numberOfLines={1}>{place}</Text>
            </Press>
            <Text style={s.footnote}>{SITES[b.site] ?? b.site}</Text>
            <View style={{ flex: 1 }} />
            <View style={{ margin: -8, marginRight: -12 }}><IconBtn name="ellipsis" color={c.secondary} label="操作" onPress={() => onMenu(b)} /></View>
          </View>
          {b.title ? <Text style={[t.headline, { lineHeight: 23 }]}>{b.title}</Text> : null}
          {text ? (
            <View>
              <Text style={textStyle} numberOfLines={open ? undefined : LINES}>{text}</Text>
              <Text style={[textStyle, { position: 'absolute', left: 0, right: 0, opacity: 0 }]} onTextLayout={(e) => setLong(e.nativeEvent.lines.length > LINES)}
                accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">{text}</Text>
            </View>
          ) : null}
          {long ? (
            <Pressable onPress={() => setOpen(!open)} hitSlop={8} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ alignSelf: 'flex-start' }}>
              <Text style={[t.subhead, { color: c.accentText, fontWeight: '600', paddingVertical: 4 }]}>{open ? '閉じる' : '続きを見る'}</Text>
            </Pressable>
          ) : null}
          <Text style={[s.footnote, { marginTop: 4 }]} numberOfLines={1}>{b.author?.name}{b.author?.handle ? ` @${b.author.handle}` : ''} · {day(b.postedAt)}</Text>
        </View>
      </View>
    </Press>
    </Animated.View>
  );
}

// 持ち上げている間の、カードの写し（画像の1枚目と、カテゴリと題名だけの小さい形）
const GHOST_W = 200;
function Ghost({ b, data, pos, scale, opacity }) {
  const { t, s, tone } = useTheme();
  const image = imagesOf(b)[0];
  const [fg, bg] = tone(categoryTone(data, b.category));
  return (
    <Animated.View pointerEvents="none" style={[s.shadow, { position: 'absolute', left: 0, top: 0, width: GHOST_W, borderRadius: radius.card, opacity, shadowOpacity: 0.3, shadowRadius: 20,
      transform: [...pos.getTranslateTransform(), { scale }] }]}>
      <View style={s.card}>
        {image ? <Image source={{ uri: image.src }} style={{ width: '100%', height: 110 }} resizeMode="cover" /> : null}
        <View style={{ padding: 10, gap: 4 }}>
          <View style={{ alignSelf: 'flex-start', backgroundColor: bg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 1 }}>
            <Text style={[t.caption, { color: fg, fontWeight: '600' }]} numberOfLines={1}>{placeOf(data, b)}</Text>
          </View>
          <Text style={[t.footnote, { fontWeight: '600' }]} numberOfLines={2}>{b.title || b.text || b.url}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// カテゴリの置き場。下からせり上がり、札を2列で並べる。札の位置は onLayout で受け取り、指の位置との当たりは ListScreen が決める
function DropTray({ title, tiles, hit, y, scrollRef, onTray, onView, onTile }) {
  const { c, t, s, dot } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Animated.View pointerEvents="none" onLayout={(e) => onTray(e.nativeEvent.layout)}
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '45%', paddingTop: 14, paddingHorizontal: 16, paddingBottom: insets.bottom + 16,
        borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, backgroundColor: c.sheetSurface, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.separator,
        shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -6 }, transform: [{ translateY: y }] }}>
      <Text style={[s.footnote, { fontWeight: '600', marginBottom: 10, marginLeft: 4 }]}>{title}</Text>
      <ScrollView ref={scrollRef} scrollEnabled={false} onLayout={(e) => onView(e.nativeEvent.layout)}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 }}>
          {tiles.map((tile, i) => {
            const over = i === hit;
            return (
              <View key={tile.key} onLayout={(e) => onTile(i, e.nativeEvent.layout)}
                style={{ width: '48.5%', minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: radius.control,
                  backgroundColor: over ? c.accentSoft : c.bg, borderWidth: over ? 2 : StyleSheet.hairlineWidth, borderColor: over ? c.accentText : c.separator,
                  opacity: tile.current ? 0.55 : 1, transform: [{ scale: over && !tile.current && motionOK() ? 1.05 : 1 }] }}>
                {tile.tone ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot(tile.tone) }} /> : null}
                <Text style={[t.subhead, { flex: 1, fontWeight: '600', color: over ? c.accentInk : tile.back ? c.accentText : c.label }]} numberOfLines={1}>{tile.label}</Text>
                <Text style={[t.caption, { color: c.secondary }]}>{tile.current ? '今の場所' : tile.count ?? ''}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </Animated.View>
  );
}

// 読み込み中の淡いカード
function Skeleton() {
  const { c, s } = useTheme();
  const bar = (width, height = 12) => <View style={{ width, height, borderRadius: 6, backgroundColor: c.fill }} />;
  return (
    <View style={{ paddingHorizontal: 16, gap: 12 }}>
      {[true, false, true].map((image, i) => (
        <View key={i} style={s.card}>
          {image ? <View style={{ height: 160, backgroundColor: c.fill }} /> : null}
          <View style={{ gap: 10, padding: 16 }}>{bar('35%')}{bar('100%')}{bar('100%')}{bar('60%')}</View>
        </View>
      ))}
    </View>
  );
}

// カテゴリの変更。カテゴリと、その下に字下げしたサブカテゴリ。今のものにチェック
function MoveSheet({ b, data, save, onClose }) {
  const { c, s, dot } = useTheme();
  const [error, setError] = useState('');
  if (!b) return <Sheet visible={false} onClose={onClose} />;
  const current = [b.category, data.categories.includes(b.category) ? subOf(data, b) : null];
  const choose = (category, sub) => {
    if (current[0] === category && current[1] === sub) { onClose(); return; }
    save(ops.setCategory(b.id, category, sub)).then(() => { haptic.success(); onClose(); }, (err) => setError(describeError(err, '保存できませんでした。')));
  };
  const rows = data.categories.flatMap((cat) => [[cat, null], ...(data.subcategories[cat] ?? []).map((sub) => [cat, sub])]);
  return (
    <Sheet visible onClose={onClose} title="カテゴリを変える">
      <Text style={s.footnote} numberOfLines={2}>{shortLabel(b)}</Text>
      <View style={{ borderRadius: 10, overflow: 'hidden', backgroundColor: c.sheetSurface }}>
        {rows.map(([cat, sub], i) => (
          <View key={`${cat}\n${sub ?? ''}`} style={{ paddingLeft: sub ? 24 : 0 }}>
            {i > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.separator, marginLeft: 16 }} /> : null}
            <Row title={sub ?? cat} dot={sub ? null : dot(categoryTone(data, cat))} check={current[0] === cat && current[1] === sub} onPress={() => choose(cat, sub)} />
          </View>
        ))}
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
    </Sheet>
  );
}

export default function ListScreen({ data, loading, error, onRefresh, save, sel: picked, setSel, toTop, onAdd }) {
  const { c, t, s } = useTheme();
  const { top, bottom, hide } = useScroll();
  const list = useRef(null);
  const [q, setQ] = useState('');
  const [site, setSite] = useState('');
  const [moving, setMoving] = useState(null);
  useEffect(() => { if (toTop) list.current?.scrollToOffset({ offset: 0, animated: motionOK() }); }, [toTop]);

  const categories = data?.categories ?? [];
  const bookmarks = data?.bookmarks ?? [];
  const subsOf = (cat) => data?.subcategories?.[cat] ?? [];
  // 選んでいたカテゴリが消されたら「すべて」に戻す
  let sel = picked.category !== undefined && !categories.includes(picked.category) ? { all: true } : picked;
  if (sel.sub && !subsOf(sel.category).includes(sel.sub)) sel = { category: sel.category };
  const uncategorized = bookmarks.filter((b) => !categories.includes(b.category)).length;
  const shown = useMemo(() => [...bookmarks].sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt))).filter((b) => {
    if (sel.uncategorized ? categories.includes(b.category) : sel.category !== undefined && b.category !== sel.category) return false;
    if (sel.sub && subOf(data, b) !== sel.sub) return false;
    return (!site || b.site === site) && textMatches(searchTextOf(b), q);
  }), [bookmarks, categories, sel.category, sel.sub, sel.uncategorized, site, q]);
  const title = sel.uncategorized ? '未分類' : sel.category ? (sel.sub ? `${sel.category} › ${sel.sub}` : sel.category) : 'すべて';
  const countOf = (cat, sub) => bookmarks.filter((b) => b.category === cat && (sub === undefined || subOf(data, b) === sub)).length;

  const fail = (err) => Alert.alert('保存できませんでした', describeError(err, ''));
  const remove = (b) => ActionSheetIOS.showActionSheetWithOptions(
    { title: 'このブックマークを削除しますか？', message: shortLabel(b), options: ['削除', 'キャンセル'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
    (i) => { if (i === 0) { haptic.warning(); save(ops.remove(b.id)).catch(fail); } },
  );
  const menu = (b) => {
    const link = https(b.url);
    const options = ['カテゴリを変える', ...(link ? ['元のページを開く'] : []), '削除', 'キャンセル'];
    ActionSheetIOS.showActionSheetWithOptions({ title: shortLabel(b), options, destructiveButtonIndex: options.length - 2, cancelButtonIndex: options.length - 1 }, (i) => {
      const choice = options[i];
      if (choice === 'カテゴリを変える') setMoving(b);
      if (choice === '元のページを開く') WebBrowser.openBrowserAsync(link);
      if (choice === '削除') remove(b);
    });
  };

  // ---- 長押しで持ち上げて、カテゴリの置き場へ移す ----
  // 指の動きは画面全体の onTouchMove で受ける（長押しのあとも、指はカードの Pressable が持ったまま）。
  // L は持ち上げている間の値: 指の位置、当たっている札、置き場と札の位置（onLayout）、置き場の中の送り
  const hold = useContext(BarHoldContext);
  const [lift, setLift] = useState(null);
  const [hit, setHit] = useState(-1);
  const L = useRef(null);
  const pos = useRef(new Animated.ValueXY()).current;
  const gScale = useRef(new Animated.Value(1)).current;
  const gOpacity = useRef(new Animated.Value(1)).current;
  const trayY = useRef(new Animated.Value(600)).current;
  const trayScroll = useRef(null);
  const liftB = lift && bookmarks.find((x) => x.id === lift.id);
  // 札。parent がなければカテゴリ、あればその中（戻る札、直下、サブカテゴリ）。今の場所の札は置き先にしない
  const tiles = useMemo(() => {
    if (!liftB) return [];
    const sub = subOf(data, liftB) || null;
    if (!lift.parent) {
      return categories.map((cat) => ({ key: cat, label: cat, count: String(countOf(cat)), tone: categoryTone(data, cat), place: { category: cat, sub: null }, open: subsOf(cat).length > 0, current: liftB.category === cat }));
    }
    const p = lift.parent;
    return [{ key: ' back', label: '‹ カテゴリ', back: true },
      { key: ' root', label: `${p}（直下）`, tone: categoryTone(data, p), place: { category: p, sub: null }, current: liftB.category === p && !sub },
      ...subsOf(p).map((x) => ({ key: x, label: x, count: String(countOf(p, x)), place: { category: p, sub: x }, current: liftB.category === p && sub === x }))];
  }, [liftB, lift?.parent, data]);
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;
  const ghostAt = (x, y) => ({ x: x - GHOST_W / 2, y: y - 60 });
  const viewTop = (l) => l.tray.y + l.view.y;

  const hover = () => {
    const l = L.current;
    if (!l?.tray || !l.view) return;
    const top = viewTop(l);
    const inside = l.y >= top && l.y <= top + l.view.height;
    const rects = tilesRef.current.map((_, i) => {
      const r = l.rects[i];
      return r ? { x: l.tray.x + l.view.x + r.x, y: top + r.y - l.scroll, w: r.width, h: r.height } : { x: -1e6, y: -1e6, w: 0, h: 0 };
    });
    const i = inside ? hitIndex(rects, l.x, l.y, 4) : -1;
    if (i === l.hit) return;
    l.hit = i;
    setHit(i);
    clearTimeout(l.dwell);
    const tile = tilesRef.current[i];
    if (!tile) return;
    haptic.select();
    // サブカテゴリを持つ札と戻る札は、重ねたままにすると中身を替える
    if (tile.open || tile.back) {
      l.dwell = setTimeout(() => {
        if (L.current !== l) return;
        Object.assign(l, { rects: [], scroll: 0, hit: -1 });
        trayScroll.current?.scrollTo({ y: 0, animated: false });
        setHit(-1);
        setLift((v) => v && { ...v, parent: tile.back ? null : tile.place.category });
      }, PRESS.dwell);
    }
  };
  // 置き場の上端・下端 48px に指があれば、置き場の中を送る
  const edge = () => {
    const l = L.current;
    if (!l?.tray || !l.view) return;
    const top = viewTop(l);
    const bottomY = top + l.view.height;
    const step = l.y >= top && l.y < top + 48 ? -8 : l.y > bottomY - 48 && l.y <= bottomY ? 8 : 0;
    const max = Math.max(0, ...l.rects.filter(Boolean).map((r) => r.y + r.height)) - l.view.height;
    if (!step || max <= 0) return;
    l.scroll = Math.min(max, Math.max(0, l.scroll + step));
    trayScroll.current?.scrollTo({ y: l.scroll, animated: false });
    hover();
  };
  const onLift = (b, e) => {
    if (L.current) return;
    const { pageX: x, pageY: y } = e.nativeEvent;
    L.current = { id: b.id, x, y, x0: x, y0: y, hit: -1, rects: [], scroll: 0, tray: null, view: null, dwell: null, timer: setInterval(edge, 16) };
    pos.setValue(ghostAt(x, y));
    gOpacity.setValue(1);
    gScale.setValue(motionOK() ? 1.12 : 1);
    trayY.setValue(motionOK() ? 600 : 0);
    if (motionOK()) {
      Animated.spring(gScale, { toValue: 1, ...motion.spring, useNativeDriver: true }).start();
      Animated.spring(trayY, { toValue: 0, ...motion.spring, useNativeDriver: true }).start();
    }
    haptic.medium();
    hold(true);
    setHit(-1);
    setLift({ id: b.id, parent: null });
  };
  const moveLift = (e) => {
    const l = L.current;
    if (!l) return;
    l.x = e.nativeEvent.pageX;
    l.y = e.nativeEvent.pageY;
    pos.setValue(ghostAt(l.x, l.y));
    hover();
  };
  // 札の上で離したら、写しが札へ縮んで消えて移す。外なら、写しが持ち上げた場所へ戻る
  const endLift = (cancelled) => {
    const l = L.current;
    if (!l) return;
    L.current = null;
    clearInterval(l.timer);
    clearTimeout(l.dwell);
    const tile = cancelled ? null : tilesRef.current[l.hit];
    const place = tile && !tile.current && !tile.back ? tile.place : null;
    const finish = () => { setLift(null); setHit(-1); hold(false); };
    if (place) {
      haptic.success();
      save(ops.setCategory(l.id, place.category, place.sub)).catch(fail);
    }
    if (!motionOK()) { finish(); return; }
    Animated.timing(trayY, { toValue: 600, duration: 220, useNativeDriver: true }).start();
    if (place) {
      const r = l.rects[l.hit];
      const to = ghostAt(l.tray.x + l.view.x + r.x + r.width / 2, viewTop(l) + r.y - l.scroll + r.height / 2);
      Animated.parallel([
        Animated.timing(pos, { toValue: to, duration: 220, useNativeDriver: true }),
        Animated.timing(gScale, { toValue: 0.1, duration: 220, useNativeDriver: true }),
        Animated.timing(gOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(finish);
    } else {
      Animated.parallel([
        Animated.spring(pos, { toValue: ghostAt(l.x0, l.y0), ...motion.spring, useNativeDriver: true }),
        Animated.timing(gOpacity, { toValue: 0, duration: 340, useNativeDriver: true }),
      ]).start(finish);
    }
  };
  useEffect(() => () => { if (L.current) { clearInterval(L.current.timer); clearTimeout(L.current.dwell); hold(false); } }, []);

  const header = (
    <View style={{ gap: 10, paddingBottom: 12 }}>
      <LargeTitle>{title}</LargeTitle>
      <View style={{ paddingHorizontal: 16 }}><SearchField value={q} onChange={setQ} site={site} onSite={setSite} /></View>
      {/* 横に送るチップは、ステータスバーを押したときの送りの先にしない（一覧のリストだけにする） */}
      <ScrollView horizontal scrollsToTop={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        <Chip label="すべて" count={bookmarks.length} on={sel.all} onPress={() => setSel({ all: true })} />
        {categories.map((cat) => <Chip key={cat} label={cat} count={countOf(cat)} tone={categoryTone(data, cat)} on={sel.category === cat && !sel.sub} onPress={() => setSel({ category: cat })} />)}
        {uncategorized > 0 ? <Chip label="未分類" count={uncategorized} on={sel.uncategorized} onPress={() => setSel({ uncategorized: true })} /> : null}
        {/* サイトで絞り込んでいるときは、外すチップを最後に出す */}
        {site ? (
          <Press onPress={() => { haptic.select(); setSite(''); }} scale={0.95} accessibilityLabel={`${SITES[site] ?? site}の絞り込みを外す`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: c.accentSoft }}>
            <Text style={[t.subhead, { color: c.accentInk, fontWeight: '600' }]}>{SITES[site] ?? site}</Text>
            <Icon name="xmark" size={12} weight="semibold" color={c.accentInk} />
          </Press>
        ) : null}
      </ScrollView>
      {sel.category && subsOf(sel.category).length > 0 ? (
        <ScrollView horizontal scrollsToTop={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          <Chip label={`${sel.category}のすべて`} count={countOf(sel.category)} on={!sel.sub} onPress={() => setSel({ category: sel.category })} />
          {subsOf(sel.category).map((sub) => <Chip key={sub} label={sub} count={countOf(sel.category, sub)} on={sel.sub === sub} onPress={() => setSel({ category: sel.category, sub })} />)}
        </ScrollView>
      ) : null}
      {error ? <Text style={[s.error, { paddingHorizontal: 16 }]}>{error}</Text> : null}
    </View>
  );

  let empty = null;
  if (!data) empty = loading ? <Skeleton /> : <Empty icon="arrow.clockwise" title="読み込めませんでした" text={error} action={<Btn kind="tinted" title="再読み込み" onPress={onRefresh} />} />;
  else if (bookmarks.length === 0) empty = <Empty icon="books.vertical" title="ブックマークはまだありません" text="X のポストや note・Qiita の記事の URL から追加できます。共有シートのショートカットからも追加できます。" action={<Btn title="追加" onPress={onAdd} />} />;
  else empty = <Empty icon="magnifyingglass" title="一致するブックマークはありません" text="検索の語や絞り込みを変えてください。" />;

  return (
    <View style={s.screen} onTouchMove={moveLift} onTouchEnd={() => endLift(false)} onTouchCancel={() => endLift(true)}>
      <FlatList
        ref={list}
        scrollsToTop
        data={shown}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}><Card b={item} data={data} onMenu={menu} onMove={setMoving} onLift={onLift} lifted={lift?.id === item.id} /></View>}
        extraData={lift}
        scrollEnabled={!lift}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingTop: top, paddingBottom: bottom }}
        refreshControl={<RefreshControl refreshing={loading && Boolean(data)} onRefresh={onRefresh} tintColor={c.secondary} progressViewOffset={top} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        {...hide}
      />
      <MoveSheet b={moving} data={data} save={save} onClose={() => setMoving(null)} />
      {liftB ? (
        <DropTray title={lift.parent ? `「${lift.parent}」の中へ移す` : 'カテゴリへ移す'} tiles={tiles} hit={hit} y={trayY} scrollRef={trayScroll}
          onTray={(layout) => { if (L.current) L.current.tray = layout; }}
          onView={(layout) => { if (L.current) L.current.view = layout; }}
          onTile={(i, layout) => { if (!L.current) return; L.current.rects[i] = layout; hover(); }} />
      ) : null}
      {liftB ? <Ghost b={liftB} data={data} pos={pos} scale={gScale} opacity={gOpacity} /> : null}
    </View>
  );
}
