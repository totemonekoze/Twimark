// 追加。共有シートのショートカットから受け取った URL か、貼り付けた URL を判定して下見を出し、カテゴリを選んで保存する
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ops, SITES } from '../../shared/store.js';
import { parseUrl, fetchMeta } from '../../shared/meta.js';
import { toneOf } from '../../shared/view.js';
import { colors, ui } from '../theme';
import { Btn, Chip, Status } from '../parts';

export default function AddScreen({ data, canEdit, incoming, lastCategory, save, onAdded }) {
  const [urlText, setUrlText] = useState('');
  const [parsed, setParsed] = useState(null);
  // undefined: 取得中、null: 取得できなかった
  const [item, setItem] = useState(undefined);
  const [pasted, setPasted] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const lookupId = useRef(0);

  const categories = data?.categories ?? [];
  const saved = parsed && data?.bookmarks.some((b) => b.id === parsed.id);

  useEffect(() => {
    if (!category || !categories.includes(category)) setCategory(categories.includes(lastCategory) ? lastCategory : categories[0] ?? '');
  }, [categories.join('\n'), lastCategory]);

  async function lookup(raw) {
    const id = ++lookupId.current;
    setUrlText(raw);
    setPasted('');
    setStatus(null);
    const next = parseUrl(raw);
    setParsed(next);
    if (!next) {
      setItem(null);
      if (raw.trim()) setStatus({ text: '追加できるのは X のポストと note・Qiita の記事の URL です。', kind: 'error' });
      return;
    }
    setItem(undefined);
    const meta = await fetchMeta(next);
    if (id !== lookupId.current) return;
    setItem(meta);
    if (!meta) setStatus({ text: '本文を取得できませんでした。貼り付けると保存できます。', kind: 'error' });
  }

  // 共有シートから来たとき。同じ URL がもう一度来ても `at` が変われば読み直す
  useEffect(() => { if (incoming?.url) lookup(incoming.url); }, [incoming?.at]);

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
      savedAt: new Date().toISOString(),
    };
    setSaving(true);
    setStatus({ text: '保存中…' });
    try {
      await save(ops.add(bookmark), `Add ${bookmark.id}`);
      setStatus({ text: '追加しました。', kind: 'ok' });
      onAdded(category);
    } catch (err) {
      setStatus({ text: err?.message ?? '保存できませんでした。', kind: 'error' });
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) return <View style={[ui.screen, ui.pad]}><Text style={ui.text}>追加にはトークンが要ります。「設定」で入れてください。</Text></View>;
  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.pad} keyboardShouldPersistTaps="handled">
      <Text style={ui.label}>ポストか記事の URL</Text>
      <TextInput style={ui.input} value={urlText} onChangeText={setUrlText} onSubmitEditing={() => lookup(urlText)} placeholder="https://x.com/…/status/…" autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="search" />
      <View style={ui.row}>
        <Btn ghost title="クリップボードから貼り付け" onPress={pasteUrl} />
        <Btn ghost title="読み込む" onPress={() => lookup(urlText)} />
      </View>

      {parsed && (
        <View style={{ backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 6 }}>
          <Text style={ui.muted}>{SITES[parsed.site]}{item ? ` ・ ${item.author.name} @${item.author.handle}` : parsed.handle ? ` ・ @${parsed.handle}` : ''}</Text>
          {item === undefined && <Text style={ui.muted}>取得中…</Text>}
          {item?.title ? <Text style={[ui.text, { fontWeight: '700' }]}>{item.title}</Text> : null}
          {item?.text ? <Text style={ui.text} numberOfLines={8}>{item.text}</Text> : null}
        </View>
      )}

      {parsed && item === null && !saved && (
        <TextInput style={[ui.input, { minHeight: 120, textAlignVertical: 'top' }]} value={pasted} onChangeText={setPasted} placeholder="本文を貼り付け" multiline />
      )}

      {parsed && !saved && (
        <>
          <Text style={ui.label}>カテゴリ</Text>
          <View style={[ui.row, { flexWrap: 'wrap' }]}>
            {categories.map((c) => <Chip key={c} label={c} tone={category === c ? toneOf(categories, c) : undefined} on={category === c} onPress={() => setCategory(c)} />)}
          </View>
          <Btn title="追加" onPress={add} disabled={saving || item === undefined || !category} />
        </>
      )}
      {saved && status?.kind !== 'ok' ? <Status status={{ text: 'このページはもう保存されています。', kind: 'ok' }} /> : <Status status={status} />}
      {!data && <Text style={ui.muted}>一覧を読み込めていません。一覧の画面で引っぱって読み込み直してください。</Text>}
    </ScrollView>
  );
}
