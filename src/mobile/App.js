// Twimark の iPhone アプリ。データは一覧の画面・拡張と同じ Worker の API（D1）から読む（../shared/store.js）。
// 認証はアプリのトークン（Bearer）で、キーチェーンに置く。ログインしていなければ「設定」のログインだけを出す。
// 画面は下のタブ（一覧・カテゴリ・設定）で切り替え、追加は一覧の「＋」から出すシート。縦長の Web の一覧の画面と同じ作り。
// 共有シートのショートカットが <アプリの URL>/--/add?url=<ポストの URL> で開くと、追加のシートを出す。
// 書き込みは1件ずつ順番に送り、成功したら返ってきた最新のデータで描き直す。失敗したら今の内容を読み直す
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { createStore, describeError, PUBLIC_URL } from '../shared/store.js';
import { useTheme } from './theme';
import { haptic, Icon, motionOK, TAB_HEIGHT } from './parts';
import ListScreen from './screens/ListScreen';
import AddSheet from './screens/AddScreen';
import CategoriesScreen from './screens/CategoriesScreen';
import SettingsScreen from './screens/SettingsScreen';

const TOKEN_KEY = 'twimark.token';
// 前回選んだ [カテゴリ, サブカテゴリ] の JSON
const LAST_PLACE_KEY = 'twimark.lastPlace';
const TABS = [['list', '一覧', 'books.vertical'], ['categories', 'カテゴリ', 'folder'], ['settings', '設定', 'gearshape']];

function TabBar({ tab, onChange }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom }} accessibilityRole="tabbar">
      <BlurView tint="systemChromeMaterial" intensity={100} style={StyleSheet.absoluteFill} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: c.separator }} />
      <View style={{ flexDirection: 'row', height: TAB_HEIGHT }}>
        {TABS.map(([key, label, icon]) => {
          const on = tab === key;
          return (
            <Pressable key={key} onPress={() => onChange(key)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}>
              <Icon name={on ? `${icon}.fill` : icon} size={24} color={on ? c.accent : c.secondary} />
              <Text style={{ fontSize: 10, fontWeight: '500', color: on ? c.accent : c.secondary }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// タブを替えたときに重ねて入れ替える
function FadeIn({ children }) {
  const v = useRef(new Animated.Value(motionOK() ? 0 : 1)).current;
  useEffect(() => { Animated.timing(v, { toValue: 1, duration: 220, useNativeDriver: true }).start(); }, []);
  return <Animated.View style={{ flex: 1, opacity: v }}>{children}</Animated.View>;
}

function Root() {
  const { c, dark } = useTheme();
  // null はキーチェーンをまだ読んでいない。'' はログインしていない
  const [token, setToken] = useState(null);
  const [lastPlace, setLastPlace] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('list');
  // 一覧の絞り込み。カテゴリのタブから選んでも変わる。{ all } | { category, sub? } | { uncategorized }
  const [sel, setSel] = useState({ all: true });
  // 追加のシート。{ url, at } で開き、null で閉じる
  const [adding, setAdding] = useState(null);
  const store = useMemo(() => (token ? createStore({ base: PUBLIC_URL, token }) : null), [token]);

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
  const changeTab = (key) => {
    if (key !== tab) haptic.select();
    setTab(key);
  };

  let screen = null;
  if (token === '') screen = <SettingsScreen token="" onToken={onToken} />;
  else if (token) {
    if (tab === 'list') screen = <ListScreen data={data} loading={loading} error={error} onRefresh={refresh} save={save} sel={sel} setSel={setSel} onAdd={() => setAdding({ url: '', at: Date.now() })} />;
    if (tab === 'categories') screen = <CategoriesScreen data={data} save={save} onPick={(next) => { setSel(next); setTab('list'); }} />;
    if (tab === 'settings') screen = <SettingsScreen token={token} store={store} onToken={onToken} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <FadeIn key={token ? tab : 'login'}>{screen}</FadeIn>
      {token ? <TabBar tab={tab} onChange={changeTab} /> : null}
      {token ? <AddSheet store={store} data={data} incoming={adding} lastPlace={lastPlace} save={save} onAdded={onAdded} onClose={() => setAdding(null)} /> : null}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}
