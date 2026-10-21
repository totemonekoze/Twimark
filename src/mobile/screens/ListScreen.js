// 一覧。カテゴリ・サイト・検索で絞り込み、カードからカテゴリの変更と削除をする（トークンがあるときだけ）
import { useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { ops, SITES } from '../../shared/store.js';
import { searchTextOf, textMatches, toneOf } from '../../shared/view.js';
import { colors, tones, ui } from '../theme';
import { Chip, https } from '../parts';

const day = (iso) => (iso ? new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '投稿日不明');
const LONG = 160;

export default function ListScreen({ data, canEdit, loading, error, onRefresh, save }) {
  const [q, setQ] = useState('');
  // { all } | { category } | { uncategorized }
  const [picked, setSel] = useState({ all: true });
  const [site, setSite] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());

  const categories = data?.categories ?? [];
  const bookmarks = data?.bookmarks ?? [];
  // 選んでいたカテゴリが消されたら「すべて」に戻す
  const sel = picked.category !== undefined && !categories.includes(picked.category) ? { all: true } : picked;
  const uncategorized = bookmarks.filter((b) => !categories.includes(b.category)).length;
  const shown = useMemo(() => bookmarks.filter((b) => {
    if (sel.uncategorized ? categories.includes(b.category) : sel.category !== undefined && b.category !== sel.category) return false;
    return (!site || b.site === site) && textMatches(searchTextOf(b), q);
  }), [bookmarks, categories, sel, site, q]);

  const fail = (err) => Alert.alert('保存できませんでした', err?.message ?? '');
  const changeCategory = (b) => {
    const options = [...categories, 'やめる'];
    ActionSheetIOS.showActionSheetWithOptions({ title: 'カテゴリを変える', options, cancelButtonIndex: options.length - 1 }, (i) => {
      const next = categories[i];
      if (next && next !== b.category) save(ops.setCategory(b.id, next), `Change category of ${b.id}`).catch(fail);
    });
  };
  const remove = (b) => {
    Alert.alert('削除しますか？', `${SITES[b.site] ?? ''}：${(b.title || b.text || b.url).slice(0, 60)}`, [
      { text: 'やめる', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => save(ops.remove(b.id), `Delete ${b.id}`).catch(fail) },
    ]);
  };
  const toggle = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const header = (
    <View style={{ gap: 10, paddingBottom: 6 }}>
      <TextInput style={ui.input} value={q} onChangeText={setQ} placeholder="検索（空白で区切るとすべてを含むもの）" clearButtonMode="while-editing" autoCorrect={false} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ui.row}>
        <Chip label={`すべて ${bookmarks.length}`} on={sel.all} onPress={() => setSel({ all: true })} />
        {categories.map((c) => (
          <Chip key={c} label={`${c} ${bookmarks.filter((b) => b.category === c).length}`} tone={toneOf(categories, c)} on={sel.category === c} onPress={() => setSel({ category: c })} />
        ))}
        {uncategorized > 0 && <Chip label={`未分類 ${uncategorized}`} on={sel.uncategorized} onPress={() => setSel({ uncategorized: true })} />}
      </ScrollView>
      <View style={ui.row}>
        {[['', 'すべてのサイト'], ...Object.entries(SITES)].map(([key, label]) => <Chip key={key} label={label} on={site === key} onPress={() => setSite(key)} />)}
      </View>
      {error ? <Text style={ui.error}>{error}</Text> : null}
    </View>
  );

  const card = ({ item: b }) => {
    const tone = toneOf(categories, b.category);
    const image = https(b.photos?.[0]?.url) ?? https(b.videos?.[0]?.thumbnail);
    const open = expanded.has(b.id);
    const link = https(b.url);
    // 手で直されたファイルでは本文がないこともある
    const text = typeof b.text === 'string' ? b.text : '';
    return (
      <View style={{ backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
        {image && <Image source={{ uri: image }} style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: tones.gray[1] }} resizeMode="cover" />}
        <View style={{ padding: 12, gap: 8 }}>
          <View style={ui.row}>
            <Pressable disabled={!canEdit} onPress={() => changeCategory(b)} style={{ backgroundColor: tones[tone][1], borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: tones[tone][0], fontSize: 12, fontWeight: '600' }}>{categories.includes(b.category) ? b.category : '未分類'}{canEdit ? ' ▾' : ''}</Text>
            </Pressable>
            <Text style={ui.muted}>{SITES[b.site] ?? b.site}</Text>
          </View>
          {b.title ? <Text style={[ui.text, { fontWeight: '700' }]}>{b.title}</Text> : null}
          <Text style={ui.text} numberOfLines={open ? undefined : 6}>{text}</Text>
          {text.length > LONG && <Text style={[ui.muted, { color: colors.accent }]} onPress={() => toggle(b.id)}>{open ? 'たたむ' : 'もっと見る'}</Text>}
          <Text style={ui.muted}>{b.author?.name} @{b.author?.handle} ・ {day(b.postedAt)}</Text>
          <View style={[ui.row, { justifyContent: 'space-between' }]}>
            {link ? <Text style={{ color: colors.accent, fontSize: 14 }} onPress={() => WebBrowser.openBrowserAsync(link)}>元のページを開く</Text> : <View />}
            {canEdit && <Text style={{ color: colors.danger, fontSize: 14 }} onPress={() => remove(b)}>削除</Text>}
          </View>
        </View>
      </View>
    );
  };

  const empty = !data ? (loading ? '読み込み中…' : '') : bookmarks.length === 0 ? 'ブックマークはまだありません。共有シートのショートカットか「追加」から追加できます。' : '条件に合うブックマークはありません。';
  return (
    <FlatList
      style={ui.screen}
      contentContainerStyle={[ui.pad, { paddingBottom: 32 }]}
      data={shown}
      keyExtractor={(b) => b.id}
      renderItem={card}
      ListHeaderComponent={header}
      ListEmptyComponent={empty ? <Text style={ui.muted}>{empty}</Text> : null}
      refreshing={loading}
      onRefresh={onRefresh}
      keyboardShouldPersistTaps="handled"
    />
  );
}
