// Twimark の iPhone アプリ。データは一覧の画面・拡張と同じ Worker の API（D1）から読む（../shared/store.js）。
// 認証はアプリのトークン（Bearer）で、キーチェーンに置く。ログインしていなければ「設定」のログインだけを出す。
// 上のバーは出さない。画面の移動は下のボタン1つで開くメニュー（一覧・カテゴリ・設定）、追加は右下の丸い「＋」（一覧だけ）。
// 縦長の Web の一覧の画面と同じ作り。アクセントの色と、その地の上の文字の色はデータの accent・accentOn（利用者ごと）を AccentContext で配る。
// 下のメニューのボタンは、どの画面でも送っている間はフェードで消し、止まって 0.5 秒で出す（ScrollHideContext）。
// 共有シートのショートカットが <アプリの URL>/--/add?url=<ポストの URL> で開くと、追加のシートを出す。
// 書き込みは1件ずつ順番に送り、成功したら返ってきた最新のデータで描き直す。失敗したら今の内容を読み直す
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutAnimation, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { createStore, describeError, PUBLIC_URL } from '../shared/store.js';
import { AccentContext, motion, useTheme } from './theme';
import { haptic, Icon, motionOK, Press, ScrollHideContext } from './parts';
import ListScreen from './screens/ListScreen';
import AddSheet from './screens/AddScreen';
import CategoriesScreen from './screens/CategoriesScreen';
import SettingsScreen from './screens/SettingsScreen';

const TOKEN_KEY = 'twimark.token';
// 前回選んだ [カテゴリ, サブカテゴリ] の JSON
const LAST_PLACE_KEY = 'twimark.lastPlace';
const TABS = [['list', '一覧', 'books.vertical'], ['categories', 'カテゴリ', 'folder'], ['settings', '設定', 'gearshape']];

// 下からせり上がる画面のメニュー。今の画面にチェック
function Menu({ visible, tab, onPick, onClose }) {
  const { c, t, s } = useTheme();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(400)).current;
  useEffect(() => {
    if (!visible) return;
    y.setValue(motionOK() ? 400 : 0);
    if (motionOK()) Animated.spring(y, { toValue: 0, ...motion.spring, useNativeDriver: true }).start();
  }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: c.overlay }} onPress={onClose} accessibilityLabel="メニューを閉じる" />
      <Animated.View style={{ position: 'absolute', left: 8, right: 8, bottom: insets.bottom + 8, transform: [{ translateY: y }] }}>
        <View style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: c.sheetSurface }}>
          <Text style={[s.footnote, { textAlign: 'center', paddingVertical: 12 }]} accessibilityRole="header">メニュー</Text>
          {TABS.map(([key, label, icon]) => (
            <Pressable key={key} onPress={() => onPick(key)} style={({ pressed }) => [s.row, { minHeight: 56, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator }, pressed && { backgroundColor: c.fill }]}
              accessibilityRole="button" accessibilityState={{ selected: tab === key }}>
              <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={18} color={c.onAccent} /></View>
              <Text style={[t.body, { flex: 1, fontWeight: tab === key ? '600' : '400' }]}>{label}</Text>
              {tab === key ? <Icon name="checkmark" size={17} weight="semibold" /> : null}
            </Pressable>
          ))}
        </View>
        <Pressable onPress={onClose} style={({ pressed }) => ({ marginTop: 8, minHeight: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.fill : c.sheetSurface })} accessibilityRole="button">
          <Text style={[t.body, { color: c.accentText, fontWeight: '600' }]}>閉じる</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

// 下に浮かぶボタン。真ん中は今の画面の名前（押すとメニュー）、右下はその一段上に追加（一覧だけ）。
// 「＋」は下の帯の中央寄せの並びに入れず、画面に対して置く。メニューのボタンは送っている間は消す（消えている間は押せない）
export const barBottom = (insets) => Math.max(12, insets.bottom + 4);
function BottomBar({ tab, opacity, hiding, onMenu, onAdd }) {
  const { c, t } = useTheme();
  const insets = useSafeAreaInsets();
  const [hidden, setHidden] = useState(false);
  useEffect(() => { hiding.current = setHidden; }, []);
  const label = TABS.find(([k]) => k === tab)?.[1];
  const bottom = barBottom(insets);
  return (
    <>
    <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} style={{ position: 'absolute', left: 0, right: 0, bottom, height: 56, alignItems: 'center', justifyContent: 'center', opacity }}>
      <Press onPress={() => { haptic.select(); onMenu(); }} scale={0.95} accessibilityLabel={`メニュー（今は${label}）`}
        style={{ borderRadius: 24, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }}>
        {/* 影は外側、角丸の切り抜きと素材は内側（同じ View に overflow: hidden を付けると影が消える） */}
        <View style={{ borderRadius: 24, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: c.separator }}>
          <BlurView tint="systemChromeMaterial" intensity={100} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingLeft: 16, paddingRight: 20 }}>
            <Icon name="line.3.horizontal" size={18} />
            <Text style={[t.subhead, { fontWeight: '600' }]}>{label}</Text>
          </BlurView>
        </View>
      </Press>
    </Animated.View>
      {tab === 'list' ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', right: 16, bottom: bottom + 64 }}>
        <Press onPress={onAdd} scale={0.9} accessibilityLabel="追加"
          style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }}>
          <Icon name="plus" size={26} weight="semibold" color={c.onAccent} />
        </Press>
        </View>
      ) : null}
    </>
  );
}

// 画面を替えたときに重ねて入れ替える
function FadeIn({ children }) {
  const v = useRef(new Animated.Value(motionOK() ? 0 : 1)).current;
  useEffect(() => { Animated.timing(v, { toValue: 1, duration: 220, useNativeDriver: true }).start(); }, []);
  return <Animated.View style={{ flex: 1, opacity: v }}>{children}</Animated.View>;
}

function Root({ data, setData }) {
  const { c, dark } = useTheme();
  // null はキーチェーンをまだ読んでいない。'' はログインしていない
  const [token, setToken] = useState(null);
  const [lastPlace, setLastPlace] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('list');
  const [menu, setMenu] = useState(false);
  // 一覧で「一覧」を選んだら、一覧の最上部へ送る（数が変わるたびに送る）
  const [toTop, setToTop] = useState(0);
  // 一覧の絞り込み。カテゴリの画面から選んでも変わる。{ all } | { category, sub? } | { uncategorized }
  const [sel, setSel] = useState({ all: true });
  // 追加のシート。{ url, at } で開き、null で閉じる
  const [adding, setAdding] = useState(null);
  const store = useMemo(() => (token ? createStore({ base: PUBLIC_URL, token }) : null), [token]);
  // 送りの合図で、メニューのボタンを 0.2 秒で消し、止まって 0.5 秒たったら出す（透明度だけなので、動きを減らす設定でも同じ）
  const pill = useRef(new Animated.Value(1)).current;
  const hiding = useRef(() => {});
  const showTimer = useRef(null);
  const scrollHide = useMemo(() => {
    const fade = (to) => Animated.timing(pill, { toValue: to, duration: 200, useNativeDriver: true }).start();
    const hide = () => { clearTimeout(showTimer.current); hiding.current(true); fade(0); };
    const show = () => { clearTimeout(showTimer.current); showTimer.current = setTimeout(() => { hiding.current(false); fade(1); }, 500); };
    return { onScrollBeginDrag: hide, onMomentumScrollBegin: hide, onScrollEndDrag: show, onMomentumScrollEnd: show };
  }, []);
  // 送りの慣性の途中で画面が替わると終わりの合図が来ないので、画面が替わったらすぐに出す
  useEffect(() => { clearTimeout(showTimer.current); hiding.current(false); pill.setValue(1); }, [tab]);

  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY).then((t) => setToken(t ?? ''), () => setToken(''));
    SecureStore.getItemAsync(LAST_PLACE_KEY).then((p) => setLastPlace(p ?? ''), () => {});
  }, []);

  const onToken = useCallback(async (next) => {
    if (next) await SecureStore.setItemAsync(TOKEN_KEY, next);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
    setData(null);
    setTab(next ? 'list' : 'settings');
    setToken(next);
  }, []);
  // トークンが取り消されていたら、ログインからやり直す
  const expired = useCallback((err) => {
    if (err?.code === 'unauthorized') onToken('').catch(() => {});
    throw err;
  }, [onToken]);

  const queue = useRef(Promise.resolve());
  const enqueue = (task) => {
    const run = queue.current.then(task);
    queue.current = run.catch(() => {});
    return run;
  };
  // 並びの変化（追加・削除・カテゴリの変更・並べ替え）を動かす
  const animate = () => { if (motionOK()) LayoutAnimation.configureNext(LayoutAnimation.create(260, 'easeInEaseOut', 'opacity')); };
  const refresh = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    try {
      const next = (await enqueue(store.load).catch(expired)).data;
      animate();
      setData(next);
      setError('');
    } catch (err) {
      setError(describeError(err, '読み込めませんでした。'));
    } finally {
      setLoading(false);
    }
  }, [store, expired]);
  useEffect(() => { refresh(); }, [refresh]);

  const save = useCallback((op) => enqueue(() => store.update(op).catch(expired)).then(
    (next) => { animate(); setData(next); return next; },
    (err) => { enqueue(store.load).then((r) => setData(r.data), () => {}); throw err; },
  ), [store, expired]);

  // 共有シートから。起動時の URL も、起動中に来た URL もここに来る。
  // Expo Go では前に exp://u.expo.dev/<プロジェクトID>/--/ が付くので、パスの最後が add かだけを見る
  const url = Linking.useURL();
  useEffect(() => {
    if (!url) return;
    let path = '';
    let shared = null;
    try {
      const u = new URL(url);
      path = u.pathname;
      shared = u.searchParams.get('url');
    } catch { return; }
    if (/(^|\/)add\/?$/.test(path) && shared) {
      setTab('list');
      setAdding({ url: shared, at: Date.now() });
    }
  }, [url]);

  const onAdded = (place) => {
    setLastPlace(place);
    SecureStore.setItemAsync(LAST_PLACE_KEY, place).catch(() => {});
  };
  const pickTab = (key) => {
    haptic.select();
    setMenu(false);
    if (key === tab && key === 'list') setToTop((n) => n + 1);
    setTab(key);
  };

  let screen = null;
  if (token === '') screen = <SettingsScreen token="" onToken={onToken} />;
  else if (token) {
    if (tab === 'list') screen = <ListScreen data={data} loading={loading} error={error} onRefresh={refresh} save={save} sel={sel} setSel={setSel} toTop={toTop} onAdd={() => setAdding({ url: '', at: Date.now() })} />;
    if (tab === 'categories') screen = <CategoriesScreen data={data} save={save} onPick={(next) => { setSel(next); setTab('list'); }} />;
    if (tab === 'settings') screen = <SettingsScreen token={token} store={store} data={data} save={save} onToken={onToken} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ScrollHideContext.Provider value={scrollHide}><FadeIn key={token ? tab : 'login'}>{screen}</FadeIn></ScrollHideContext.Provider>
      {token ? <BottomBar tab={tab} opacity={pill} hiding={hiding} onMenu={() => setMenu(true)} onAdd={() => setAdding({ url: '', at: Date.now() })} /> : null}
      <Menu visible={menu} tab={tab} onPick={pickTab} onClose={() => setMenu(false)} />
      {token ? <AddSheet store={store} data={data} incoming={adding} lastPlace={lastPlace} save={save} onAdded={onAdded} onClose={() => setAdding(null)} /> : null}
    </View>
  );
}

// データはアクセントの色を配るために一番外で持つ
export default function App() {
  const [data, setData] = useState(null);
  const accent = useMemo(() => ({ accent: data?.accent ?? null, on: data?.accentOn ?? null }), [data?.accent, data?.accentOn]);
  return (
    <SafeAreaProvider>
      <AccentContext.Provider value={accent}>
        <Root data={data} setData={setData} />
      </AccentContext.Provider>
    </SafeAreaProvider>
  );
}
