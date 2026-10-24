// 追加のシート。共有シートのショートカットから受け取った URL か、貼り付けた URL を判定し、Worker の /api/meta で下見を取り、
// カテゴリを選んで保存する。中身は Web の追加のシート（src/site/add.js）と同じ。取得できなければ本文を貼り付けて保存する
import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { describeError, ops, SITES } from '../../shared/store.js';
import { parseUrl } from '../../shared/meta.js';
import { categoryTone } from '../../shared/view.js';
import { useTheme } from '../theme';
import { BottomSheet, Btn, Chip, haptic, Status, TextBtn } from '../parts';

export default function AddSheet({ store, data, incoming, lastPlace, save, onAdded, onClose }) {
  const { c, t, s } = useTheme();
  const [urlText, setUrlText] = useState('');
  const [parsed, setParsed] = useState(null);
  // undefined: 取得中、null: 取得できなかった
  const [item, setItem] = useState(null);
  const [pasted, setPasted] = useState('');
  const [category, setCategory] = useState('');
  // null はカテゴリの直下
  const [sub, setSub] = useState(null);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const lookupId = useRef(0);

  const categories = data?.categories ?? [];
  const subsOf = (cat) => data?.subcategories?.[cat] ?? [];
  const saved = Boolean(parsed) && Boolean(data?.bookmarks.some((b) => b.id === parsed.id));

  useEffect(() => {
    if (category && categories.includes(category)) return;
    // 前回選んだ組（[カテゴリ, サブカテゴリ] の JSON）がまだあればそれにする
    let last = [];
    try { last = JSON.parse(lastPlace || '[]'); } catch { /* 壊れていたら先頭のカテゴリ */ }
    const ok = categories.includes(last[0]);
    setCategory(ok ? last[0] : categories[0] ?? '');
    setSub(ok && last[1] && subsOf(last[0]).includes(last[1]) ? last[1] : null);
  }, [categories.join('\n'), lastPlace]);

  async function lookup(raw) {
    const id = ++lookupId.current;
    const text = raw.trim();
    setUrlText(text);
    setPasted('');
    setStatus(null);
    const next = parseUrl(text);
    setParsed(next);
    if (!next) {
      setItem(null);
      // 共有シートの「Twimarkへ追加」から対象外の URL で開いたときも、ここで失敗と知らせる
      if (text) { haptic.warning(); setStatus({ text: '追加できるのは X のポストと note・Qiita の記事の URL です。', kind: 'error' }); }
      return;
    }
    setItem(undefined);
    let meta = null;
    try {
      meta = (await store.call('/api/meta', { method: 'POST', body: { url: text } })).item ?? null;
    } catch (err) {
      if (id === lookupId.current) setStatus({ text: describeError(err, '取得できませんでした。'), kind: 'error' });
    }
    if (id !== lookupId.current) return;
    setItem(meta);
    if (!meta) setStatus((prev) => prev ?? { text: '本文を取得できませんでした。貼り付けると保存できます。', kind: 'error' });
  }

  // 開いたとき。同じ URL がもう一度来ても `at` が変われば読み直す
  useEffect(() => {
    if (!incoming) return;
    lookupId.current++;
    setUrlText('');
    setParsed(null);
    setItem(null);
    setPasted('');
    setStatus(null);
    if (incoming.url) lookup(incoming.url);
  }, [incoming?.at]);

  async function pasteUrl() {
    const text = (await Clipboard.getStringAsync()).trim();
    if (text) lookup(text);
    else setStatus({ text: 'クリップボードが空です。X の「リンクをコピー」でコピーしてください。', kind: 'error' });
  }

  async function add() {
    if (!item && !pasted.trim()) { setStatus({ text: '本文を貼り付けてください。', kind: 'error' }); return; }
    const bookmark = {
      id: parsed.id,
      site: parsed.site,
      url: item?.url ?? parsed.url ?? `https://x.com/i/status/${parsed.key}`,
      author: item?.author ?? { name: parsed.handle ?? '', handle: parsed.handle ?? '' },
      postedAt: item?.postedAt ?? null,
      title: item?.title ?? '',
      text: item?.text ?? pasted.trim(),
      photos: item?.photos ?? [],
      videos: item?.videos ?? [],
      category,
      subcategory: sub,
    };
    setSaving(true);
    setStatus({ text: '保存中…' });
    try {
      await save(ops.add(bookmark));
      haptic.success();
      onAdded(JSON.stringify([category, sub]));
      onClose();
    } catch (err) {
      setStatus({ text: describeError(err, '保存できませんでした。'), kind: 'error' });
    } finally {
      setSaving(false);
    }
  }

  const canAdd = Boolean(parsed) && !saved && !saving && item !== undefined && Boolean(category);
  return (
    <BottomSheet visible={Boolean(incoming)} onClose={onClose} title="追加" right={<TextBtn title="追加" strong disabled={!canAdd} onPress={add} />}>
      <TextInput style={s.field} value={urlText} onChangeText={(v) => { setUrlText(v); const p = parseUrl(v.trim()); if (p && p.id !== parsed?.id) lookup(v); }}
        onSubmitEditing={() => lookup(urlText)} placeholder="https://x.com/…/status/…" placeholderTextColor={c.tertiary}
        autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="go" autoFocus={!incoming?.url} accessibilityLabel="ポストか記事の URL" />
      <Btn kind="tinted" icon="doc.on.clipboard" title="クリップボードから貼り付け" onPress={pasteUrl} />

      {parsed ? (
        <View style={[s.card, { padding: 16, gap: 4, backgroundColor: c.sheetSurface }]}>
          <Text style={s.footnote}>{SITES[parsed.site]}{item ? ` · ${item.author.name} @${item.author.handle}` : parsed.handle ? ` · @${parsed.handle}` : ''}</Text>
          {item === undefined ? <Text style={s.footnote}>取得中…</Text> : null}
          {item?.title ? <Text style={t.headline}>{item.title}</Text> : null}
          {item?.text ? <Text style={t.subhead} numberOfLines={6}>{item.text}</Text> : null}
        </View>
      ) : null}

      {parsed && item === null && !saved ? (
        <TextInput style={[s.field, { minHeight: 120, textAlignVertical: 'top' }]} value={pasted} onChangeText={setPasted} placeholder="本文を貼り付け" placeholderTextColor={c.tertiary} multiline accessibilityLabel="本文" />
      ) : null}

      {parsed && !saved ? (
        <>
          <Text style={[s.footnote, { marginTop: 8 }]}>カテゴリ</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {categories.map((cat) => <Chip key={cat} label={cat} tone={categoryTone(data, cat)} on={category === cat} onPress={() => { setCategory(cat); setSub(null); }} />)}
          </View>
          {subsOf(category).length > 0 ? (
            <>
              <Text style={[s.footnote, { marginTop: 8 }]}>サブカテゴリ</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Chip label="なし" on={sub === null} onPress={() => setSub(null)} />
                {subsOf(category).map((x) => <Chip key={x} label={x} on={sub === x} onPress={() => setSub(x)} />)}
              </View>
            </>
          ) : null}
        </>
      ) : null}
      {saved ? <Status status={{ text: 'このページはもう保存されています。', kind: 'ok' }} /> : <Status status={status} />}
      {!data ? <Text style={s.footnote}>一覧を読み込めていません。一覧の画面で引っぱって読み込み直してください。</Text> : null}
    </BottomSheet>
  );
}
