// 一覧。縦長の Web の一覧の画面と同じ並び（大きな見出し、検索とサイトのフィルター、カテゴリとサブカテゴリのチップ、カード）。
// カードは画像が上に大きく、本文は5行を超えたら「続きを見る」でその場で開く。
// カードを押すと元のページ、「…」か長押しでメニュー（カテゴリの変更、元のページ、削除）、カテゴリの札でカテゴリの変更。
// メニューで「一覧」を選ぶと（toTop が変わると）最上部へ送る。ステータスバーを押しても最上部へ（送りはこのリストだけ）
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, Image, Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { describeError, ops, SITES, subOf } from '../../shared/store.js';
import { categoryTone, searchTextOf, textMatches } from '../../shared/view.js';
import { radius, useTheme } from '../theme';
import { Btn, Chip, Empty, haptic, https, Icon, IconBtn, LargeTitle, motionOK, Press, Row, Sheet, TextBtn, useScroll } from '../parts';

const day = (iso) => (iso ? new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '投稿日不明');
const LINES = 5;
const shortLabel = (b) => {
  const label = b.title || b.text || b.url;
  return `${SITES[b.site] ?? ''}：${label.slice(0, 60)}${label.length > 60 ? '…' : ''}`;
};
// 画像（写真、動画のサムネイル）。https だけ、4枚まで
const imagesOf = (b) => [...(b.photos ?? []).map((p) => ({ src: p.url })), ...(b.videos ?? []).map((v) => ({ src: v.thumbnail, video: true }))].filter((m) => https(m.src)).slice(0, 4);
const placeOf = (data, b) => {
  if (!data.categories.includes(b.category)) return `${b.category}（未分類）`;
  const sub = subOf(data, b);
  return sub ? `${b.category} › ${sub}` : b.category;
};
const SITE_CHOICES = [['', 'すべてのサイト'], ...Object.entries(SITES)];

// 検索の欄。右端にサイトのフィルター（押すとメニュー。絞り込んでいる間はアクセントの文字の色と点）
function SearchField({ value, onChange, site, onSite }) {
  const { c, t } = useTheme();
  const [focused, setFocused] = useState(false);
  const pickSite = () => {
    const options = [...SITE_CHOICES.map(([key, label]) => (key === site ? `✓ ${label}` : label)), 'キャンセル'];
    ActionSheetIOS.showActionSheetWithOptions({ title: 'サイトで絞り込む', options, cancelButtonIndex: options.length - 1 }, (i) => {
      if (i < SITE_CHOICES.length && SITE_CHOICES[i][0] !== site) { haptic.select(); onSite(SITE_CHOICES[i][0]); }
    });
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingLeft: 8, borderRadius: 10, backgroundColor: c.fill }}>
        <Icon name="magnifyingglass" size={16} color={c.secondary} />
        <TextInput style={[t.body, { flex: 1, paddingVertical: 0 }]} value={value} onChangeText={onChange} placeholder="検索" placeholderTextColor={c.secondary}
          clearButtonMode="while-editing" autoCorrect={false} returnKeyType="search" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} accessibilityLabel="タイトル、本文、投稿者、カテゴリで探す" />
        <Press onPress={pickSite} scale={0.85} style={{ width: 44, height: 44, marginVertical: -4, alignItems: 'center', justifyContent: 'center' }}
          accessibilityLabel={site ? `サイトで絞り込む（今は${SITES[site] ?? site}）` : 'サイトで絞り込む'}>
          <Icon name="line.3.horizontal.decrease" size={18} color={site ? c.accentText : c.secondary} />
          {site ? <View style={{ position: 'absolute', top: 9, right: 9, width: 7, height: 7, borderRadius: 4, backgroundColor: c.accentText }} /> : null}
        </Press>
      </View>
      {focused ? <TextBtn title="キャンセル" onPress={() => { onChange(''); Keyboard.dismiss(); }} /> : null}
    </View>
  );
}

// 画像は上に大きく。1枚は全幅（高さを抑える）、複数は2列
function Media({ b }) {
  const { c } = useTheme();
  const [failed, setFailed] = useState([]);
  const images = imagesOf(b).filter((m) => !failed.includes(m.src));
  if (!images.length) return null;
  const one = images.length === 1;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2, backgroundColor: c.surface2 }}>
      {images.map((m) => (
        <View key={m.src} style={{ flexGrow: 1, flexBasis: one ? '100%' : '45%' }}>
          <Image source={{ uri: m.src }} style={{ width: '100%', aspectRatio: one ? 16 / 10 : 16 / 9, maxHeight: one ? 340 : 300 }} resizeMode="cover"
            onError={() => setFailed((f) => [...f, m.src])} accessibilityLabel={m.video ? '動画のサムネイル' : '添付画像'} accessibilityIgnoresInvertColors />
          {m.video ? <View style={{ position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 8, paddingVertical: 1, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.6)' }}><Text style={{ color: '#FFFFFF', fontSize: 12 }}>動画</Text></View> : null}
        </View>
      ))}
    </View>
  );
}

function Card({ b, data, onMenu, onMove }) {
  const { c, t, s, tone } = useTheme();
  const [open, setOpen] = useState(false);
  // 5行を超えるかは、行数を数える見えない写しで測る
  const [long, setLong] = useState(false);
  const [fg, bg] = tone(categoryTone(data, b.category));
  const link = https(b.url);
  // 手で直されたデータでは本文がないこともある
  const text = typeof b.text === 'string' ? b.text : '';
  const place = placeOf(data, b);
  const textStyle = [t.subhead, { lineHeight: 22 }];
  return (
    <Press onPress={() => link && WebBrowser.openBrowserAsync(link)} onLongPress={() => { haptic.light(); onMenu(b); }} scale={0.98} style={[s.shadow, { borderRadius: radius.card }]}
      accessibilityLabel={`${place}、${SITES[b.site] ?? b.site}、${b.title || text.slice(0, 80)}`} accessibilityHint="押すと元のページを開きます。長押しでメニュー">
      {/* 影は外側、角丸の切り抜きは内側（同じ View に overflow: hidden を付けると影が消える） */}
      <View style={s.card}>
        <Media b={b} />
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 }}>
            <Press onPress={() => onMove(b)} scale={0.94} style={{ backgroundColor: bg, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 2, maxWidth: 220 }} accessibilityLabel={`カテゴリ: ${place}（押すと変える）`}>
              <Text style={[t.caption, { color: fg, fontWeight: '600' }]} numberOfLines={1}>{place}</Text>
            </Press>
            <Text style={s.footnote}>{SITES[b.site] ?? b.site}</Text>
            <View style={{ flex: 1 }} />
            <View style={{ margin: -8, marginRight: -12 }}><IconBtn name="ellipsis" color={c.secondary} label="操作" onPress={() => onMenu(b)} /></View>
          </View>
          {b.title ? <Text style={[t.headline, { lineHeight: 23 }]}>{b.title}</Text> : null}
          {text ? (
            <View>
              <Text style={textStyle} numberOfLines={open ? undefined : LINES}>{text}</Text>
              <Text style={[textStyle, { position: 'absolute', left: 0, right: 0, opacity: 0 }]} onTextLayout={(e) => setLong(e.nativeEvent.lines.length > LINES)}
                accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">{text}</Text>
            </View>
          ) : null}
          {long ? (
            <Pressable onPress={() => setOpen(!open)} hitSlop={8} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ alignSelf: 'flex-start' }}>
              <Text style={[t.subhead, { color: c.accentText, fontWeight: '600', paddingVertical: 4 }]}>{open ? '閉じる' : '続きを見る'}</Text>
            </Pressable>
          ) : null}
          <Text style={[s.footnote, { marginTop: 4 }]} numberOfLines={1}>{b.author?.name}{b.author?.handle ? ` @${b.author.handle}` : ''} · {day(b.postedAt)}</Text>
        </View>
      </View>
    </Press>
  );
}

// 読み込み中の淡いカード
function Skeleton() {
  const { c, s } = useTheme();
  const bar = (width, height = 12) => <View style={{ width, height, borderRadius: 6, backgroundColor: c.fill }} />;
  return (
    <View style={{ paddingHorizontal: 16, gap: 12 }}>
      {[true, false, true].map((image, i) => (
        <View key={i} style={s.card}>
          {image ? <View style={{ height: 160, backgroundColor: c.fill }} /> : null}
          <View style={{ gap: 10, padding: 16 }}>{bar('35%')}{bar('100%')}{bar('100%')}{bar('60%')}</View>
        </View>
      ))}
    </View>
  );
}

// カテゴリの変更。カテゴリと、その下に字下げしたサブカテゴリ。今のものにチェック
function MoveSheet({ b, data, save, onClose }) {
  const { c, s, dot } = useTheme();
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
            <Row title={sub ?? cat} dot={sub ? null : dot(categoryTone(data, cat))} check={current[0] === cat && current[1] === sub} onPress={() => choose(cat, sub)} />
          </View>
        ))}
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
    </Sheet>
  );
}

export default function ListScreen({ data, loading, error, onRefresh, save, sel: picked, setSel, toTop, onAdd }) {
  const { c, t, s } = useTheme();
  const { top, bottom, hide } = useScroll();
  const list = useRef(null);
  const [q, setQ] = useState('');
  const [site, setSite] = useState('');
  const [moving, setMoving] = useState(null);
  useEffect(() => { if (toTop) list.current?.scrollToOffset({ offset: 0, animated: motionOK() }); }, [toTop]);

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
    <View style={{ gap: 10, paddingBottom: 12 }}>
      <LargeTitle>{title}</LargeTitle>
      <View style={{ paddingHorizontal: 16 }}><SearchField value={q} onChange={setQ} site={site} onSite={setSite} /></View>
      {/* 横に送るチップは、ステータスバーを押したときの送りの先にしない（一覧のリストだけにする） */}
      <ScrollView horizontal scrollsToTop={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        <Chip label="すべて" count={bookmarks.length} on={sel.all} onPress={() => setSel({ all: true })} />
        {categories.map((cat) => <Chip key={cat} label={cat} count={countOf(cat)} tone={categoryTone(data, cat)} on={sel.category === cat && !sel.sub} onPress={() => setSel({ category: cat })} />)}
        {uncategorized > 0 ? <Chip label="未分類" count={uncategorized} on={sel.uncategorized} onPress={() => setSel({ uncategorized: true })} /> : null}
        {/* サイトで絞り込んでいるときは、外すチップを最後に出す */}
        {site ? (
          <Press onPress={() => { haptic.select(); setSite(''); }} scale={0.95} accessibilityLabel={`${SITES[site] ?? site}の絞り込みを外す`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: c.accentSoft }}>
            <Text style={[t.subhead, { color: c.accentInk, fontWeight: '600' }]}>{SITES[site] ?? site}</Text>
            <Icon name="xmark" size={12} weight="semibold" color={c.accentInk} />
          </Press>
        ) : null}
      </ScrollView>
      {sel.category && subsOf(sel.category).length > 0 ? (
        <ScrollView horizontal scrollsToTop={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          <Chip label={`${sel.category}のすべて`} count={countOf(sel.category)} on={!sel.sub} onPress={() => setSel({ category: sel.category })} />
          {subsOf(sel.category).map((sub) => <Chip key={sub} label={sub} count={countOf(sel.category, sub)} on={sel.sub === sub} onPress={() => setSel({ category: sel.category, sub })} />)}
        </ScrollView>
      ) : null}
      {error ? <Text style={[s.error, { paddingHorizontal: 16 }]}>{error}</Text> : null}
    </View>
  );

  let empty = null;
  if (!data) empty = loading ? <Skeleton /> : <Empty icon="arrow.clockwise" title="読み込めませんでした" text={error} action={<Btn kind="tinted" title="再読み込み" onPress={onRefresh} />} />;
  else if (bookmarks.length === 0) empty = <Empty icon="books.vertical" title="ブックマークはまだありません" text="X のポストや note・Qiita の記事の URL から追加できます。共有シートのショートカットからも追加できます。" action={<Btn title="追加" onPress={onAdd} />} />;
  else empty = <Empty icon="magnifyingglass" title="一致するブックマークはありません" text="検索の語や絞り込みを変えてください。" />;

  return (
    <View style={s.screen}>
      <FlatList
        ref={list}
        scrollsToTop
        data={shown}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}><Card b={item} data={data} onMenu={menu} onMove={setMoving} /></View>}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingTop: top, paddingBottom: bottom }}
        refreshControl={<RefreshControl refreshing={loading && Boolean(data)} onRefresh={onRefresh} tintColor={c.secondary} progressViewOffset={top} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        {...hide}
      />
      <MoveSheet b={moving} data={data} save={save} onClose={() => setMoving(null)} />
    </View>
  );
}
