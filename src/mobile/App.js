// Twimark の iPhone アプリ。データは一覧の画面・拡張と同じ Worker の API（D1）から読む（../shared/store.js）。
// 認証は端末のトークン（Bearer）で、キーチェーンに置く。ログインしていなければ「設定」のログインだけを出す。
// 画面は下のタブで切り替える。共有シートのショートカットが <アプリの URL>/--/add?url=<ポストの URL> で開くと「追加」に移る。
// 書き込みは1件ずつ順番に送り、成功したら返ってきた最新のデータで描き直す。失敗したら今の内容を読み直す
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { createStore, describeError, PUBLIC_URL } from '../shared/store.js';
import { colors, ui } from './theme';
import ListScreen from './screens/ListScreen';
import AddScreen from './screens/AddScreen';
import CategoriesScreen from './screens/CategoriesScreen';
import SettingsScreen from './screens/SettingsScreen';

const TOKEN_KEY = 'twimark.token';
// 前回選んだ [カテゴリ, サブカテゴリ] の JSON
const LAST_PLACE_KEY = 'twimark.lastPlace';
const TABS = [['list', '一覧'], ['add', '追加'], ['categories', 'カテゴリ'], ['settings', '設定']];

export default function App() {
  // null はキーチェーンをまだ読んでいない。'' はログインしていない
  const [token, setToken] = useState(null);
  const [lastPlace, setLastPlace] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('list');
  const [incoming, setIncoming] = useState(null);
  const store = useMemo(() => (token ? createStore({ base: PUBLIC_URL, token }) : null), [token]);

  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY).then((t) => setToken(t ?? ''), () => setToken(''));
    SecureStore.getItemAsync(LAST_PLACE_KEY).then((p) => setLastPlace(p ?? ''), () => {});
  }, []);

  const onToken = useCallback(async (next) => {
    if (next) await SecureStore.setItemAsync(TOKEN_KEY, next);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
    setData(null);
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
  const refresh = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    try {
      setData((await enqueue(store.load).catch(expired)).data);
      setError('');
    } catch (err) {
      setError(describeError(err, '読み込めませんでした。'));
    } finally {
      setLoading(false);
    }
  }, [store, expired]);
  useEffect(() => { refresh(); }, [refresh]);

  const save = useCallback((op) => enqueue(() => store.update(op).catch(expired)).then(
    (next) => { setData(next); return next; },
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
      setIncoming({ url: shared, at: Date.now() });
      setTab('add');
    }
  }, [url]);

  const onAdded = (place) => {
    setLastPlace(place);
    SecureStore.setItemAsync(LAST_PLACE_KEY, place).catch(() => {});
  };

  let screen = null;
  if (token === '') screen = <SettingsScreen token="" onToken={onToken} />;
  else if (token) {
    if (tab === 'list') screen = <ListScreen data={data} canEdit loading={loading} error={error} onRefresh={refresh} save={save} />;
    if (tab === 'add') screen = <AddScreen data={data} canEdit incoming={incoming} lastPlace={lastPlace} save={save} onAdded={onAdded} />;
    if (tab === 'categories') screen = <CategoriesScreen data={data} canEdit save={save} />;
    if (tab === 'settings') screen = <SettingsScreen token={token} onToken={onToken} />;
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={ui.screen} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={ui.h1}>Twimark</Text>
        </View>
        <View style={{ flex: 1 }}>{screen}</View>
      </SafeAreaView>
      {token ? (
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line }}>
          <View style={{ flexDirection: 'row' }}>
            {TABS.map(([key, label]) => (
              <Pressable key={key} onPress={() => setTab(key)} style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
                <Text style={{ fontSize: 14, color: tab === key ? colors.accent : colors.muted, fontWeight: tab === key ? '700' : '400' }}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </SafeAreaView>
      ) : null}
    </SafeAreaProvider>
  );
}
