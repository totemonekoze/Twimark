// 設定。ログイン（Web の画面をアプリ内で開く。パスキーが使える）、予備の ID・パスワードのログイン、ログアウト、
// ショートカットに入れる URL、Web の一覧。端末のトークンはこの iPhone のキーチェーンにだけ置く
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createStore, describeError, PUBLIC_URL } from '../../shared/store.js';
import { colors, ui } from '../theme';
import { Btn, Status } from '../parts';

const DEVICE = 'iPhone アプリ';

// 戻ってきた URL の #token= を取り出す
function tokenFrom(url) {
  const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  return new URLSearchParams(hash).get('token') ?? '';
}

function LoginPanel({ onToken }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const done = async (token) => {
    try {
      await onToken(token);
    } catch {
      setStatus({ text: 'キーチェーンに保存できませんでした。', kind: 'error' });
    }
  };

  // Safari と同じ認証の画面で Web のログインを開き、ログインのあとに渡される端末のトークンを受け取る
  const withBrowser = async () => {
    setStatus(null);
    const redirect = Linking.createURL('login');
    const result = await WebBrowser.openAuthSessionAsync(`${PUBLIC_URL}/?app=${encodeURIComponent(redirect)}`, redirect);
    if (result.type !== 'success') { setStatus({ text: 'ログインを取りやめました。', kind: 'error' }); return; }
    const token = tokenFrom(result.url);
    if (!token) { setStatus({ text: 'ログインを受け取れませんでした。下の ID とパスワードでも入れます。', kind: 'error' }); return; }
    await done(token);
  };

  // 予備。Expo Go で上の受け渡しが動かないとき
  const withPassword = async () => {
    setBusy(true);
    setStatus({ text: 'ログインしています…' });
    try {
      const { token } = await createStore({ base: PUBLIC_URL }).call('/api/login/password', { method: 'POST', body: { login: login.trim(), password, device: DEVICE } });
      await done(token);
    } catch (err) {
      setStatus({ text: describeError(err, 'ログインできませんでした。'), kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Text style={ui.h1}>ログイン</Text>
      <Text style={ui.muted}>Twimark の画面をこのアプリの中で開いてログインします。パスキーを登録していれば、パスキーでログインできます。</Text>
      <Btn title="ブラウザでログイン" onPress={withBrowser} />
      <Text style={[ui.h1, { marginTop: 16, fontSize: 16 }]}>ID とパスワードでログイン</Text>
      <Text style={ui.muted}>上のログインが動かないときに使います（パスキーは使えません）。</Text>
      <TextInput style={ui.input} value={login} onChangeText={setLogin} placeholder="ID" autoCapitalize="none" autoCorrect={false} textContentType="username" />
      <TextInput style={ui.input} value={password} onChangeText={setPassword} placeholder="パスワード" secureTextEntry textContentType="password" />
      <Btn ghost title="ログイン" onPress={withPassword} disabled={busy || !login.trim() || !password} />
      <Status status={status} />
    </>
  );
}

export default function SettingsScreen({ token, onToken }) {
  const [status, setStatus] = useState(null);
  const [copied, setCopied] = useState(false);

  // ショートカットは、この後ろにエンコードしたポストの URL をつないで開く。
  // createURL は Expo Go のクエリ（channel-name など）を渡したものの後ろに足すので、url= は自分で最後に付ける
  const base = Linking.createURL('add');
  const shortcutUrl = `${base}${base.includes('?') ? '&' : '?'}url=`;

  const test = async () => {
    setStatus({ text: '確かめています…' });
    try {
      const { data } = await createStore({ base: PUBLIC_URL, token }).load();
      setStatus({ text: `接続できました（ブックマーク ${data.bookmarks.length}件）。`, kind: 'ok' });
    } catch (err) {
      setStatus({ text: describeError(err, '接続できませんでした。'), kind: 'error' });
    }
  };
  // トークンを取り消してから、キーチェーンから消す（取り消しに失敗しても消す）
  const logout = async () => {
    try { await createStore({ base: PUBLIC_URL, token }).call('/api/logout', { method: 'POST', body: {} }); } catch { /* 通信できなくてもこの iPhone からは消す */ }
    try {
      await onToken('');
    } catch {
      setStatus({ text: 'キーチェーンから消せませんでした。', kind: 'error' });
    }
  };
  const copy = async () => {
    await Clipboard.setStringAsync(shortcutUrl);
    setCopied(true);
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.pad} keyboardShouldPersistTaps="handled">
      {!token ? <LoginPanel onToken={onToken} /> : (
        <>
          <Text style={ui.h1}>ログイン中</Text>
          <Text style={ui.muted}>この iPhone には、Twimark の端末のトークンがキーチェーンに置かれています。Web の一覧の「設定」からも取り消せます。</Text>
          <View style={[ui.row, { flexWrap: 'wrap' }]}>
            <Btn ghost title="接続を確かめる" onPress={test} />
            <Btn ghost danger title="ログアウト" onPress={logout} />
          </View>
          <Status status={status} />

          <Text style={[ui.h1, { marginTop: 16 }]}>共有シートのショートカット</Text>
          <Text style={ui.muted}>ショートカットの「URL を開く」に、この URL の後ろに「URL をエンコード」の結果をつないだものを入れます（作り方は README）。開き方が変わると URL も変わるので、EAS Update から開いたこの画面の値を使ってください。</Text>
          <Text selectable style={[ui.text, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 10, fontFamily: 'Menlo', fontSize: 13 }]}>{shortcutUrl}</Text>
          <View style={ui.row}>
            <Btn ghost title={copied ? 'コピーしました' : 'URL をコピー'} onPress={copy} />
          </View>
        </>
      )}

      <Text style={[ui.h1, { marginTop: 16 }]}>Web の一覧</Text>
      <Text style={{ color: colors.accent, fontSize: 15 }} onPress={() => WebBrowser.openBrowserAsync(PUBLIC_URL)}>{PUBLIC_URL}</Text>
    </ScrollView>
  );
}
