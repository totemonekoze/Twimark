// 設定。トークン（この iPhone のキーチェーンにだけ置く）、ショートカットに入れる URL、Web の一覧
import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createAppStore } from '../github';
import { colors, ui } from '../theme';
import { Btn, Status } from '../parts';

export const WEB_URL = 'https://totemonekoze.github.io/Twimark/';

export default function SettingsScreen({ token, onToken }) {
  const [input, setInput] = useState(token);
  const [status, setStatus] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => setInput(token), [token]);

  // ショートカットは、この後ろにエンコードしたポストの URL をつないで開く。
  // createURL は Expo Go のクエリ（channel-name など）を渡したものの後ろに足すので、url= は自分で最後に付ける
  const base = Linking.createURL('add');
  const shortcutUrl = `${base}${base.includes('?') ? '&' : '?'}url=`;

  const saveToken = async () => {
    try {
      await onToken(input.trim());
      setStatus({ text: '保存しました。', kind: 'ok' });
    } catch {
      setStatus({ text: 'キーチェーンに保存できませんでした。', kind: 'error' });
    }
  };
  const test = async () => {
    setStatus({ text: '確かめています…' });
    try {
      const { data, sha } = await createAppStore(input.trim()).load();
      setStatus({ text: sha ? `接続できました（ブックマーク ${data.bookmarks.length}件）。` : '接続できました。最初の追加でデータのファイルを作ります。', kind: 'ok' });
    } catch (err) {
      setStatus({ text: err?.message ?? '接続できませんでした。', kind: 'error' });
    }
  };
  const clear = async () => {
    try {
      await onToken('');
      setStatus({ text: 'この iPhone から消しました。見るだけになります。', kind: 'ok' });
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
      <Text style={ui.h1}>トークン</Text>
      <Text style={ui.muted}>見るだけならトークンは要りません。追加や編集には、Twimark リポジトリだけを対象にし、権限を「Contents」の読み取りと書き込みだけ、期限付きにした fine-grained personal access token を入れてください。この iPhone のキーチェーンにだけ保存します。</Text>
      <TextInput style={ui.input} value={input} onChangeText={setInput} placeholder="github_pat_…" secureTextEntry autoCapitalize="none" autoCorrect={false} />
      <View style={[ui.row, { flexWrap: 'wrap' }]}>
        <Btn title="保存" onPress={saveToken} disabled={!input.trim()} />
        <Btn ghost title="接続を確かめる" onPress={test} />
        <Btn ghost danger title="この iPhone から消す" onPress={clear} disabled={!token} />
      </View>
      <Status status={status} />

      <Text style={[ui.h1, { marginTop: 16 }]}>共有シートのショートカット</Text>
      <Text style={ui.muted}>ショートカットの「URL を開く」に、この URL の後ろに「URL をエンコード」の結果をつないだものを入れます（作り方は README）。開き方が変わると URL も変わるので、EAS Update から開いたこの画面の値を使ってください。</Text>
      <Text selectable style={[ui.text, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 10, fontFamily: 'Menlo', fontSize: 13 }]}>{shortcutUrl}</Text>
      <View style={ui.row}>
        <Btn ghost title={copied ? 'コピーしました' : 'URL をコピー'} onPress={copy} />
      </View>

      <Text style={[ui.h1, { marginTop: 16 }]}>Web の一覧</Text>
      <Text style={{ color: colors.accent, fontSize: 15 }} onPress={() => WebBrowser.openBrowserAsync(WEB_URL)}>{WEB_URL}</Text>
    </ScrollView>
  );
}
