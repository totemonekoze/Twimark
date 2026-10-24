// 設定。Web の設定のタブと同じ段の順（アカウント、パスキー、パスワード、拡張・アプリのトークン、招待、ログインの履歴、ログアウト）に、
// アプリにしかないもの（ショートカットの URL、接続の確認、Web の一覧）を足す。ログインしていなければログインだけを出す。
// 設定の操作はアプリのトークンでできる。前の版のトークン（拡張と同じ扱い）では web_only で断られるので、ログインし直してもらう。
// パスキーの追加は WebAuthn がそのサイトのブラウザでしか動かないので、Web の設定をアプリ内の認証の画面で開いて行う
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Animated, PanResponder, Pressable, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createStore, describeError, ops, PUBLIC_URL } from '../../shared/store.js';
import { deviceLabel } from '../../shared/view.js';
import { useTheme } from '../theme';
import { accentSet, DEFAULT_ACCENT } from '../../shared/theme.js';
import { Btn, Group, haptic, Icon, LargeTitle, Row, Sheet, Status, TextBtn, useScroll } from '../parts';
import ColorSheet from '../ColorSheet';

const DEVICE = 'iPhone アプリ';
const day = (iso) => (iso ? new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short' }) : 'まだ使っていない');
const METHOD = { password: 'パスワード', passkey: 'パスキー' };
const CLIENT = { web: 'Web', app: 'アプリ' };

// 戻ってきた URL の #token= などを取り出す
function hashParam(url, name) {
  const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  return new URLSearchParams(hash).get(name) ?? '';
}

function LoginPanel({ onToken }) {
  const { c, s } = useTheme();
  const { top, bottom, hide } = useScroll();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const done = async (token) => {
    try {
      await onToken(token);
      haptic.success();
    } catch {
      setStatus({ text: 'キーチェーンに保存できませんでした。', kind: 'error' });
    }
  };
  // Safari と同じ認証の画面で Web のログインを開き、ログインのあとに渡されるアプリのトークンを受け取る
  const withBrowser = async () => {
    setStatus(null);
    const redirect = Linking.createURL('login');
    const result = await WebBrowser.openAuthSessionAsync(`${PUBLIC_URL}/?app=${encodeURIComponent(redirect)}`, redirect);
    if (result.type !== 'success') { setStatus({ text: 'ログインを取りやめました。', kind: 'error' }); return; }
    const token = hashParam(result.url, 'token');
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
    <View style={s.screen}>
      <Animated.ScrollView contentContainerStyle={{ paddingTop: top, paddingBottom: bottom }} {...hide} keyboardShouldPersistTaps="handled">
        <LargeTitle>ログイン</LargeTitle>
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <Text style={s.footnote}>Twimark の画面をこのアプリの中で開いてログインします。パスキーを登録していれば、パスキーでログインできます。</Text>
          <Btn title="ブラウザでログイン" icon="person.badge.key" onPress={withBrowser} />
          <Status status={status} />
        </View>
        <Text style={s.groupTitle}>ID とパスワードでログイン</Text>
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          <TextInput style={s.field} value={login} onChangeText={setLogin} placeholder="ID" placeholderTextColor={c.tertiary} autoCapitalize="none" autoCorrect={false} textContentType="username" />
          <TextInput style={s.field} value={password} onChangeText={setPassword} placeholder="パスワード" placeholderTextColor={c.tertiary} secureTextEntry textContentType="password" onSubmitEditing={withPassword} />
          <Btn kind="tinted" title="ログイン" onPress={withPassword} disabled={busy || !login.trim() || !password} />
          <Text style={s.footnote}>上のログインが動かないときに使います（パスキーは使えません）。</Text>
        </View>
        <Text style={s.groupTitle}>Web の一覧</Text>
        <Group><Row title={PUBLIC_URL} onPress={() => WebBrowser.openBrowserAsync(PUBLIC_URL)} right={<Icon name="arrow.up.right.square" size={18} />} /></Group>
      </Animated.ScrollView>
    </View>
  );
}

// ログインの履歴。行を押すと IP・国・端末の元の文字列を出す
function HistoryRow({ e }) {
  const { c, t, s } = useTheme();
  const [open, setOpen] = useState(false);
  const failed = e.result === 'failure';
  return (
    <Pressable onPress={() => setOpen(!open)} style={({ pressed }) => [s.row, { alignItems: 'flex-start', flexDirection: 'column', gap: 2 }, pressed && { backgroundColor: c.fill }]} accessibilityRole="button" accessibilityState={{ expanded: open }}>
      <Text style={[t.body, failed && { color: c.danger }]}>{failed ? `失敗（${e.reason ?? 'unknown'}）` : '成功'} · {METHOD[e.method] ?? e.method}</Text>
      <Text style={s.footnote}>{day(e.at)} · {CLIENT[e.client] ?? e.client} · {deviceLabel(e.userAgent)}</Text>
      {open ? <Text selectable style={[s.footnote, { color: c.label, marginTop: 4 }]}>{`IP: ${e.ip || '不明'}\n国: ${e.country || '不明'}\n端末: ${e.userAgent || '不明'}`}</Text> : null}
    </Pressable>
  );
}

function HistoryPage({ store, onBack }) {
  const { s } = useTheme();
  const { top, bottom, hide } = useScroll();
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    store.call('/api/login-events').then((r) => setEvents(r.events), (err) => setError(describeError(err, '履歴を読み込めませんでした。')));
  }, [store]);
  // 左の端から右へ送ると戻る
  const edge = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (e, g) => e.nativeEvent.pageX - g.dx < 30 && g.dx > 12 && Math.abs(g.dy) < 20,
    onPanResponderRelease: (_, g) => { if (g.dx > 80) onBack(); },
  })).current;
  return (
    <View style={s.screen} {...edge.panHandlers}>
      <Animated.ScrollView contentContainerStyle={{ paddingTop: top, paddingBottom: bottom }} {...hide}>
        <View style={{ paddingHorizontal: 8 }}><BackBtn onPress={onBack} /></View>
        <LargeTitle>ログインの履歴</LargeTitle>
        <Text style={[s.groupNote, { marginTop: 0, marginBottom: 12 }]}>この ID へのログインの成功と失敗（30日分）です。心当たりのない失敗が続くときは、パスワードを変えてください。行を押すと詳しく出ます。</Text>
        {events?.length ? <Group>{events.map((e) => <HistoryRow key={e.id ?? `${e.at}${e.result}`} e={e} />)}</Group> : null}
        {events && events.length === 0 ? <Text style={s.groupNote}>まだ記録はありません。</Text> : null}
        {error ? <Text style={[s.error, { marginHorizontal: 32 }]}>{error}</Text> : null}
      </Animated.ScrollView>
    </View>
  );
}

function BackBtn({ onPress }) {
  const { c, t } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: 44, opacity: pressed ? 0.4 : 1 })} accessibilityRole="button" accessibilityLabel="設定に戻る">
      <Icon name="chevron.left" size={20} weight="semibold" />
      <Text style={[t.body, { color: c.accentText }]}>設定</Text>
    </Pressable>
  );
}

// 値を一度だけ出す箱（トークン、招待リンク）
function Secret({ note, value }) {
  const { c, s } = useTheme();
  const [copied, setCopied] = useState(false);
  return (
    <View style={{ marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 10, backgroundColor: c.accentSoft, gap: 8 }}>
      <Text style={[s.footnote, { color: c.accentInk }]}>{note}</Text>
      <Text selectable style={{ fontFamily: 'Menlo', fontSize: 13, color: c.accentInk }}>{value}</Text>
      <Btn kind="tinted" icon="doc.on.doc" title={copied ? 'コピーしました' : 'コピー'} onPress={() => Clipboard.setStringAsync(value).then(() => { haptic.success(); setCopied(true); })} />
    </View>
  );
}

function PasswordSheet({ visible, store, onClose, onDone }) {
  const { c, s } = useTheme();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setCurrent(''); setNext(''); setError(''); } }, [visible]);
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await store.call('/api/password', { method: 'POST', body: { current, next } });
      haptic.success();
      onDone();
    } catch (err) {
      setError(describeError(err, '変えられませんでした。'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="パスワードの変更" right={<TextBtn title="変更" strong disabled={busy || !current || next.length < 10} onPress={submit} />}>
      <Text style={s.footnote}>今のパスワード</Text>
      <TextInput style={s.field} value={current} onChangeText={setCurrent} secureTextEntry textContentType="password" autoFocus placeholderTextColor={c.tertiary} />
      <Text style={s.footnote}>新しいパスワード（10文字以上）</Text>
      <TextInput style={s.field} value={next} onChangeText={setNext} secureTextEntry textContentType="newPassword" placeholderTextColor={c.tertiary} onSubmitEditing={submit} />
      <Text style={s.footnote}>変えると、ほかのログインと、拡張・アプリのトークンはすべて使えなくなります（このアプリはログインしたまま）。</Text>
      {error ? <Text style={s.error}>{error}</Text> : null}
    </Sheet>
  );
}

function Signed({ token, store, data, save, onToken }) {
  const { c, s } = useTheme();
  const { top, bottom, hide } = useScroll();
  const [page, setPage] = useState(null);
  const [session, setSession] = useState(null);
  const [passkeys, setPasskeys] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [invites, setInvites] = useState({ open: [], used: [] });
  // 前の版のトークンで、設定の操作が断られたとき
  const [stale, setStale] = useState(false);
  const [status, setStatus] = useState(null);
  const [secret, setSecret] = useState(null); // { kind: 'token' | 'invite', value }
  const [password, setPassword] = useState(false);
  // アクセントの色を選ぶシート
  // 開いている色のシート（'accent' | 'accent-text' | null）
  const [coloring, setColoring] = useState(null);
  // 閉じる動きの間も中身を替えないよう、最後に開いた種類を覚える
  const colorKind = useRef('accent');
  if (coloring) colorKind.current = coloring;
  const isText = colorKind.current === 'accent-text';
  const accent = data?.accent ?? DEFAULT_ACCENT;
  const accentOn = data?.accentOn ?? null;
  const fail = (err) => {
    if (err?.code === 'web_only') setStale(true);
    else setStatus({ text: describeError(err, 'できませんでした。'), kind: 'error' });
  };

  const refresh = useCallback(async () => {
    try {
      const me = await store.call('/api/session');
      setSession(me);
      const [p, tk] = await Promise.all([store.call('/api/passkeys'), store.call('/api/tokens')]);
      setPasskeys(p.passkeys);
      setTokens(tk.tokens);
      if (me.role === 'owner') setInvites(await store.call('/api/invites'));
      setStale(false);
    } catch (err) {
      fail(err);
    }
  }, [store]);
  useEffect(() => { refresh(); }, [refresh]);

  const confirm = (title, message, label, run) => ActionSheetIOS.showActionSheetWithOptions(
    { title, message, options: [label, 'キャンセル'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
    (i) => { if (i === 0) { haptic.warning(); run().then(refresh, fail); } },
  );

  const addPasskey = async () => {
    setStatus(null);
    const back = Linking.createURL('passkey');
    const result = await WebBrowser.openAuthSessionAsync(`${PUBLIC_URL}/?tab=settings&passkey=add&app=${encodeURIComponent(back)}`, back);
    if (result.type === 'success' && hashParam(result.url, 'passkey') === 'added') {
      haptic.success();
      setStatus({ text: 'パスキーを追加しました。', kind: 'ok' });
    }
    refresh();
  };
  const issueToken = () => Alert.prompt('拡張のトークンを発行', '見分けるための名前を付けてください。', [
    { text: 'キャンセル', style: 'cancel' },
    {
      text: '発行',
      onPress: (name) => {
        if (!name?.trim()) return;
        store.call('/api/tokens', { method: 'POST', body: { device: name.trim() } }).then((r) => { setSecret({ kind: 'token', value: r.token }); refresh(); }, fail);
      },
    },
  ], 'plain-text', '', 'default');
  const createInvite = () => store.call('/api/invites', { method: 'POST', body: {} }).then((r) => { setSecret({ kind: 'invite', value: r.url }); refresh(); }, fail);
  // トークンを取り消してから、キーチェーンから消す（取り消しに失敗しても消す）
  const logout = () => ActionSheetIOS.showActionSheetWithOptions({ title: 'ログアウトしますか？', options: ['ログアウト', 'キャンセル'], destructiveButtonIndex: 0, cancelButtonIndex: 1 }, async (i) => {
    if (i !== 0) return;
    try { await store.call('/api/logout', { method: 'POST', body: {} }); } catch { /* 通信できなくてもこの iPhone からは消す */ }
    onToken('').catch(() => setStatus({ text: 'キーチェーンから消せませんでした。', kind: 'error' }));
  });
  const test = async () => {
    setStatus({ text: '確かめています…' });
    try {
      const { data } = await store.load();
      setStatus({ text: `接続できました（ブックマーク ${data.bookmarks.length}件）。`, kind: 'ok' });
    } catch (err) {
      setStatus({ text: describeError(err, '接続できませんでした。'), kind: 'error' });
    }
  };

  // ショートカットは、この後ろにエンコードしたポストの URL をつないで開く。
  // createURL は Expo Go のクエリ（channel-name など）を渡したものの後ろに足すので、url= は自分で最後に付ける
  const base = Linking.createURL('add');
  const shortcutUrl = `${base}${base.includes('?') ? '&' : '?'}url=`;
  const [copied, setCopied] = useState(false);

  if (page === 'history') return <HistoryPage store={store} onBack={() => setPage(null)} />;
  return (
    <View style={s.screen}>
      <Animated.ScrollView contentContainerStyle={{ paddingTop: top, paddingBottom: bottom }} {...hide} keyboardShouldPersistTaps="handled">
        <LargeTitle>設定</LargeTitle>
        {stale ? (
          <View style={{ marginHorizontal: 16, padding: 16, borderRadius: 10, backgroundColor: c.surface, gap: 10 }}>
            <Text style={s.secondary}>設定を使うには、ログインし直してください（前の版のアプリのログインでは、設定を変えられません）。</Text>
            <Btn title="ログインし直す" onPress={() => onToken('').catch(() => {})} />
          </View>
        ) : null}
        <View style={{ marginHorizontal: 32 }}><Status status={status} /></View>

        <Group title="アカウント"><Row title="ID" value={session?.login ?? ''} /></Group>

        <Group title="外観" note="選択中のチップやボタン、リンクの色と、その地の上の文字の色です。Web とアプリで共通です。カテゴリの色は「カテゴリ」の「編集」で、色の点を押して変えます。">
          <Row title="アクセントの色" value={data?.accent ?? `既定（${DEFAULT_ACCENT}）`} chevron onPress={() => setColoring('accent')}
            right={<View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: accent, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.15)' }} />} />
          <Row title="アクセントの文字の色" value={{ '#FFFFFF': '白', '#000000': '黒' }[accentOn] ?? accentOn ?? '自動'} chevron onPress={() => setColoring('accent-text')}
            right={<View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.15)' }}><Text style={{ fontSize: 12, fontWeight: '700', color: accentSet(accent, accentOn)[0].onAccent }}>A</Text></View>} />
        </Group>

        <Group title="パスキー" note="パスキーがあると、ログインのときにパスキーを先に求めます。追加は Web の画面をアプリの中で開いて行います。">
          {passkeys.map((p) => <Row key={p.id} title={p.name} detail={`追加 ${day(p.createdAt)} · 最後 ${day(p.lastUsedAt)}`} right={<TextBtn title="削除" danger onPress={() => confirm(`パスキー「${p.name}」を削除しますか？`, '', '削除', () => store.call(`/api/passkeys/${encodeURIComponent(p.id)}`, { method: 'DELETE' }))} />} />)}
          <Row icon="person.badge.key" title="パスキーを追加" onPress={addPasskey} />
        </Group>

        <Group title="パスワード" note="変えると、ほかのログインと、拡張・アプリのトークンはすべて使えなくなります。">
          <Row icon="lock" title="パスワードを変更" chevron onPress={() => setPassword(true)} />
        </Group>

        <Group title="拡張・アプリのトークン">
          {tokens.map((tk) => <Row key={tk.id} title={tk.name} detail={`${tk.app ? 'アプリ' : '拡張'} · 発行 ${day(tk.createdAt)} · 最後 ${day(tk.lastUsedAt)}`} right={<TextBtn title="取り消し" danger onPress={() => confirm(`トークン「${tk.name}」を取り消しますか？`, 'その拡張やアプリは、ログインし直しになります。', '取り消す', () => store.call(`/api/tokens/${encodeURIComponent(tk.id)}`, { method: 'DELETE' }))} />} />)}
          <Row icon="iphone" title="拡張のトークンを発行" onPress={issueToken} />
        </Group>
        {secret?.kind === 'token' ? <Secret note="拡張機能の設定に入れてください。値はこの1回だけ出ます。" value={secret.value} /> : null}

        {session?.role === 'owner' ? (
          <>
            <Group title="招待" note="招待リンクから登録した人だけが Twimark を使えます。招待した人のブックマークは、その人だけのものです。">
              <Row icon="person.badge.plus" title="招待リンクを作る" onPress={createInvite} />
              {invites.open.map((i) => <Row key={i.id} title={`作成 ${day(i.createdAt)}`} detail={`使われていない · 期限 ${day(i.expiresAt)}`} right={<TextBtn title="取り消し" danger onPress={() => confirm('この招待リンクを取り消しますか？', '取り消すと、そのリンクでは登録できなくなります。', '取り消す', () => store.call(`/api/invites/${encodeURIComponent(i.id)}`, { method: 'DELETE' }))} />} />)}
              {invites.used.map((u) => <Row key={`${u.login}${u.usedAt}`} title={u.login} detail={`招待から登録 ${day(u.usedAt)}`} />)}
            </Group>
            {secret?.kind === 'invite' ? <Secret note="このリンクは今だけ表示されます。1回きりで、作ってから3日で切れます。" value={secret.value} /> : null}
          </>
        ) : null}

        <Group title="安全"><Row icon="clock" title="ログインの履歴" value="30日" chevron onPress={() => setPage('history')} /></Group>

        <Group title="共有シートのショートカット" note="ショートカットの「URL を開く」に、この URL の後ろに「URL をエンコード」の結果をつないだものを入れます（作り方は README）。開き方が変わると URL も変わるので、EAS Update から開いたこの画面の値を使ってください。">
          <Row title={shortcutUrl} />
          <Row icon="doc.on.doc" title={copied ? 'コピーしました' : 'URL をコピー'} onPress={() => Clipboard.setStringAsync(shortcutUrl).then(() => { haptic.success(); setCopied(true); })} />
        </Group>

        <Group title="接続">
          <Row icon="antenna.radiowaves.left.and.right" title="接続を確かめる" onPress={test} />
          <Row icon="safari" title="Web の一覧を開く" onPress={() => WebBrowser.openBrowserAsync(PUBLIC_URL)} />
        </Group>

        <Group style={{ marginTop: 32 }}><Row title="ログアウト" danger center onPress={logout} /></Group>
      </Animated.ScrollView>
      {/* アクセントを既定に戻しても、文字の色は残す（別の設定） */}
      <ColorSheet visible={coloring !== null} kind={colorKind.current} title={isText ? 'アクセントの文字の色' : 'アクセントの色'}
        value={isText ? accentOn : data?.accent ?? null} pair={isText ? data?.accent ?? null : accentOn}
        onSave={(color) => save(isText ? ops.setAccentText(color) : ops.setAccent(color))} onClose={() => setColoring(null)} />
      <PasswordSheet visible={password} store={store} onClose={() => setPassword(false)} onDone={() => { setPassword(false); setStatus({ text: 'パスワードを変えました。', kind: 'ok' }); refresh(); }} />
    </View>
  );
}

export default function SettingsScreen({ token, store, data, save, onToken }) {
  if (!token) return <LoginPanel onToken={onToken} />;
  return <Signed token={token} store={store} data={data} save={save} onToken={onToken} />;
}
