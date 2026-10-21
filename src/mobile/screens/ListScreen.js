// 一覧。縦長の Web の一覧の画面と同じ並び（大きな見出し、検索、カテゴリとサブカテゴリのチップ、サイトのセグメント、カード）。
// カードを押すと元のページ、「…」か長押しでメニュー（カテゴリの変更、元のページ、削除）、カテゴリの札でカテゴリの変更
import { useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, Animated, Image, Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { describeError, ops, SITES, subOf } from '../../shared/store.js';
import { searchTextOf, textMatches, toneOf } from '../../shared/view.js';
import { radius, useTheme } from '../theme';
import { Btn, Chip, Empty, haptic, https, Icon, IconBtn, LargeTitle, NavBar, Press, Row, Segmented, Sheet, TextBtn, useScroll } from '../parts';

const day = (iso) => (iso ? new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '投稿日不明');
const LONG = 160;
const shortLabel = (b) => {
  const label = b.title || b.text || b.url;
  return `${SITES[b.site] ?? ''}：${label.slice(0, 60)}${label.length > 60 ? '…' : ''}`;
};

function SearchField({ value, onChange }) {
  const { c, t } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 8, borderRadius: 10, backgroundColor: c.fill }}>
        <Icon name="magnifyingglass" size={16} color={c.secondary} />
        <TextInput style={[t.body, { flex: 1, paddingVertical: 0 }]} value={value} onChangeText={onChange} placeholder="検索" placeholderTextColor={c.secondary}
          clearButtonMode="while-editing" autoCorrect={false} returnKeyType="search" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} accessibilityLabel="タイトル、本文、投稿者、カテゴリで探す" />
      </View>
      {focused ? <TextBtn title="キャンセル" onPress={() => { onChange(''); Keyboard.dismiss(); }} /> : null}
    </View>
  );
}

function Card({ b, data, onMenu, onMove }) {
  const { c, t, s, tone } = useTheme();
  const [open, setOpen] = useState(false);
  const categories = data.categories;
  const [fg, bg] = tone(toneOf(categories, b.category));
  const image = https(b.photos?.[0]?.url) ?? https(b.videos?.[0]?.thumbnail);
  const link = https(b.url);
  // 手で直されたデータでは本文がないこともある
  const text = typeof b.text === 'string' ? b.text : '';
  const sub = subOf(data, b);
  const place = categories.includes(b.category) ? (sub ? `${b.category} › ${sub}` : b.category) : `${b.category}（未分類）`;
  return (
    <Press onPress={() => link && WebBrowser.openBrowserAsync(link)} onLongPress={() => { haptic.light(); onMenu(b); }} scale={0.98} style={[s.shadow, { borderRadius: radius.card }]}
      accessibilityLabel={`${place}、${SITES[b.site] ?? b.site}、${b.title || text.slice(0, 80)}`} accessibilityHint="押すと元のページを開きます。長押しでメニュー">
      {/* 影は外側、角丸の切り抜きは内側（同じ View に overflow: hidden を付けると影が消える） */}
      <View style={s.card}>
      {image ? <Image source={{ uri: image }} style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: c.surface2 }} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 }}>
          <Press onPress={() => onMove(b)} scale={0.94} style={{ backgroundColor: bg, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 2, maxWidth: 220 }} accessibilityLabel={`カテゴリ: ${place}（押すと変える）`}>
            <Text style={[t.caption, { color: fg, fontWeight: '600' }]} numberOfLines={1}>{place}</Text>
          </Press>
          <Text style={s.footnote}>{SITES[b.site] ?? b.site}</Text>
          <View style={{ flex: 1 }} />
          <IconBtn name="ellipsis" color={c.secondary} label="操作" onPress={() => onMenu(b)} />
        </View>
        {b.title ? <Text style={[t.headline, { lineHeight: 23 }]}>{b.title}</Text> : null}
        {text ? <Text style={[t.subhead, { lineHeight: 22 }]} numberOfLines={open ? undefined : 6}>{text}</Text> : null}
        {text.length > LONG ? (
          <Pressable onPress={() => setOpen(!open)} hitSlop={8} accessibilityRole="button"><Text style={[t.subhead, { color: c.accent, paddingVertical: 4 }]}>{open ? '閉じる' : '続きを読む'}</Text></Pressable>
        ) : null}
        <Text style={[s.footnote, { marginTop: 4 }]}>{b.author?.name} @{b.author?.handle} · {day(b.postedAt)}</Text>
      </View>
      </View>
    </Press>
  );
}

// カテゴリの変更。カテゴリと、その下に字下げしたサブカテゴリ。今のものにチェック
function MoveSheet({ b, data, save, onClose }) {
  const { c, s, tone } = useTheme();
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
            <Row title={sub ?? cat} dot={sub ? null : tone(toneOf(data.categories, cat))[0]} check={current[0] === cat && current[1] === sub} onPress={() => choose(cat, sub)} />
          </View>
        ))}
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
    </Sheet>
  );
}

export default function ListScreen({ data, loading, error, onRefresh, save, sel: picked, setSel, onAdd }) {
  const { c, s } = useTheme();
  const { scrollY, props, bottom } = useScroll();
  const [q, setQ] = useState('');
  const [site, setSite] = useState('');
  const [moving, setMoving] = useState(null);

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

  const header = (
    <View style={{ gap: 10, paddingBottom: 14 }}>
      <LargeTitle>{title}</LargeTitle>
      <View style={{ paddingHorizontal: 16 }}><SearchField value={q} onChange={setQ} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        <Chip label="すべて" count={bookmarks.length} on={sel.all} onPress={() => setSel({ all: true })} />
        {categories.map((cat) => <Chip key={cat} label={cat} count={countOf(cat)} tone={toneOf(categories, cat)} on={sel.category === cat && !sel.sub} onPress={() => setSel({ category: cat })} />)}
        {uncategorized > 0 ? <Chip label="未分類" count={uncategorized} on={sel.uncategorized} onPress={() => setSel({ uncategorized: true })} /> : null}
      </ScrollView>
      {sel.category && subsOf(sel.category).length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          <Chip label={`${sel.category}のすべて`} count={countOf(sel.category)} on={!sel.sub} onPress={() => setSel({ category: sel.category })} />
          {subsOf(sel.category).map((sub) => <Chip key={sub} label={sub} count={countOf(sel.category, sub)} on={sel.sub === sub} onPress={() => setSel({ category: sel.category, sub })} />)}
        </ScrollView>
      ) : null}
      <View style={{ paddingHorizontal: 16 }}>
        <Segmented items={[['', 'すべて'], ...Object.entries(SITES)]} value={site} onChange={setSite} />
      </View>
      {error ? <Text style={[s.error, { paddingHorizontal: 16 }]}>{error}</Text> : null}
    </View>
  );

  let empty = null;
  if (!data) empty = loading ? null : <Empty icon="arrow.clockwise" title="読み込めませんでした" text={error} action={<Btn kind="tinted" title="再読み込み" onPress={onRefresh} />} />;
  else if (bookmarks.length === 0) empty = <Empty icon="books.vertical" title="ブックマークはまだありません" text="X のポストや note・Qiita の記事の URL から追加できます。共有シートのショートカットからも追加できます。" action={<Btn title="追加" onPress={onAdd} />} />;
  else empty = <Empty icon="magnifyingglass" title="一致するブックマークはありません" text="検索の語や絞り込みを変えてください。" />;

  return (
    <View style={s.screen}>
      <Animated.FlatList
        {...props}
        data={shown}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}><Card b={item} data={data} onMenu={menu} onMove={setMoving} /></View>}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingBottom: bottom }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={c.secondary} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
      <NavBar title={title} scrollY={scrollY} right={<IconBtn name="plus" label="追加" onPress={onAdd} />} />
      <MoveSheet b={moving} data={data} save={save} onClose={() => setMoving(null)} />
    </View>
  );
}
