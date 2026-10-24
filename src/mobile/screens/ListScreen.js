// 一覧。縦長の Web の一覧の画面と同じ並び（大きな見出し、検索、カテゴリとサブカテゴリのチップ、サイトのセグメント、行）。
// 行は画像が主役の、すっきりしたリスト。左に画像（ないときはカテゴリの色の四角にサイトの頭文字）、右にカテゴリ・タイトル・本文・作者と日付。
// 行を押すと元のページ、「…」か長押しでメニュー（全文を読む、カテゴリの変更、元のページ、削除）、カテゴリの名前でカテゴリの変更。
// メニューで「一覧」を選ぶと（toTop が変わると）最上部へ送る。ステータスバーを押しても最上部へ（送りはこのリストだけ）
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, Image, Keyboard, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { describeError, ops, SITES, subOf } from '../../shared/store.js';
import { categoryTone, searchTextOf, textMatches } from '../../shared/view.js';
import { useTheme } from '../theme';
import { Btn, Chip, Empty, haptic, https, Icon, IconBtn, LargeTitle, motionOK, Press, Row, Segmented, Sheet, TextBtn, useScroll } from '../parts';

const day = (iso) => (iso ? new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '投稿日不明');
const LETTERS = { x: 'X', note: 'n', qiita: 'Q' };
const THUMB = 104;
const shortLabel = (b) => {
  const label = b.title || b.text || b.url;
  return `${SITES[b.site] ?? ''}：${label.slice(0, 60)}${label.length > 60 ? '…' : ''}`;
};
// 画像（写真、動画のサムネイル）。https だけ
const imagesOf = (b) => [...(b.photos ?? []).map((p) => ({ src: p.url })), ...(b.videos ?? []).map((v) => ({ src: v.thumbnail, video: true }))].filter((m) => https(m.src));
const placeOf = (data, b) => {
  if (!data.categories.includes(b.category)) return `${b.category}（未分類）`;
  const sub = subOf(data, b);
  return sub ? `${b.category} › ${sub}` : b.category;
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

// 画像のないとき（と読めなかったとき）は、カテゴリの色の四角にサイトの頭文字
function Thumb({ b, toneKey }) {
  const { tone } = useTheme();
  const [failed, setFailed] = useState(false);
  const [fg, bg] = tone(toneKey);
  const images = imagesOf(b);
  const box = { width: THUMB, height: THUMB, borderRadius: 12, overflow: 'hidden', backgroundColor: bg, alignItems: 'center', justifyContent: 'center' };
  if (!images.length || failed) return <View style={box}><Text style={{ fontSize: 40, fontWeight: '700', color: fg }}>{LETTERS[b.site] ?? '・'}</Text></View>;
  const badge = { position: 'absolute', bottom: 6, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)' };
  return (
    <View style={box}>
      <Image source={{ uri: images[0].src }} style={{ width: THUMB, height: THUMB }} resizeMode="cover" onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
      {images[0].video ? <View style={[badge, { left: 6 }]}><Icon name="play.fill" size={11} color="#FFFFFF" /></View> : null}
      {images.length > 1 ? <View style={[badge, { right: 6 }]}><Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>+{images.length - 1}</Text></View> : null}
    </View>
  );
}

function BookmarkRow({ b, data, first, onMenu, onMove }) {
  const { c, t, s, tone, dot } = useTheme();
  const toneKey = categoryTone(data, b.category);
  const link = https(b.url);
  // 手で直されたデータでは本文がないこともある
  const text = typeof b.text === 'string' ? b.text : '';
  const place = placeOf(data, b);
  return (
    <Press onPress={() => link && WebBrowser.openBrowserAsync(link)} onLongPress={() => { haptic.light(); onMenu(b); }} scale={0.985}
      style={{ flexDirection: 'row', gap: 14, paddingVertical: 14 }}
      accessibilityLabel={`${place}、${SITES[b.site] ?? b.site}、${b.title || text.slice(0, 80)}`} accessibilityHint="押すと元のページを開きます。長押しでメニュー">
      {!first ? <View style={{ position: 'absolute', top: 0, left: THUMB + 14, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: c.separator }} /> : null}
      <Thumb b={b} toneKey={toneKey} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 26 }}>
          <Press onPress={() => onMove(b)} scale={0.94} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 190 }} accessibilityLabel={`カテゴリ: ${place}（押すと変える）`}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot(toneKey) }} />
            <Text style={[t.footnote, { color: tone(toneKey)[0], fontWeight: '600' }]} numberOfLines={1}>{place}</Text>
          </Press>
          <Text style={s.footnote}>· {SITES[b.site] ?? b.site}</Text>
          <View style={{ flex: 1 }} />
          <View style={{ margin: -8 }}><IconBtn name="ellipsis" color={c.secondary} label="操作" onPress={() => onMenu(b)} /></View>
        </View>
        {b.title ? <Text style={[t.headline, { lineHeight: 22 }]} numberOfLines={2}>{b.title}</Text> : null}
        {text ? <Text style={[t.subhead, b.title ? { color: c.secondary } : { fontWeight: '500' }, { lineHeight: 21 }]} numberOfLines={b.title ? 2 : 4}>{text}</Text> : null}
        <Text style={[s.footnote, { marginTop: 'auto', paddingTop: 2 }]} numberOfLines={1}>{b.author?.name || (b.author?.handle ? `@${b.author.handle}` : '')} · {day(b.postedAt)}</Text>
      </View>
    </Press>
  );
}

// 読み込み中の淡い形
function Skeleton() {
  const { c } = useTheme();
  const bar = (width, height = 12) => <View style={{ width, height, borderRadius: 6, backgroundColor: c.fill }} />;
  return (
    <View style={{ paddingHorizontal: 16 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 14, paddingVertical: 14 }}>
          <View style={{ width: THUMB, height: THUMB, borderRadius: 12, backgroundColor: c.fill }} />
          <View style={{ flex: 1, gap: 10, paddingTop: 6 }}>{bar('40%')}{bar('90%', 16)}{bar('70%')}</View>
        </View>
      ))}
    </View>
  );
}

// 全文。画像（すべて）、タイトル、本文、作者と日付
function ReadSheet({ b, data, onClose }) {
  const { t, s } = useTheme();
  if (!b) return <Sheet visible={false} onClose={onClose} />;
  const link = https(b.url);
  return (
    <Sheet visible onClose={onClose} title="全文" left={<TextBtn title="閉じる" onPress={onClose} />} right={link ? <TextBtn title="開く" strong onPress={() => WebBrowser.openBrowserAsync(link)} /> : null}>
      <Text style={s.footnote}>{placeOf(data, b)} · {SITES[b.site] ?? b.site}</Text>
      {imagesOf(b).map((m) => <Image key={m.src} source={{ uri: m.src }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12 }} resizeMode="cover" accessibilityLabel={m.video ? '動画のサムネイル' : '添付画像'} />)}
      {b.title ? <Text style={t.title3}>{b.title}</Text> : null}
      <Text selectable style={[t.body, { lineHeight: 27 }]}>{b.text ?? ''}</Text>
      <Text style={s.footnote}>{b.author?.name}{b.author?.handle ? ` @${b.author.handle}` : ''} · {day(b.postedAt)}</Text>
    </Sheet>
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
  const { c, s } = useTheme();
  const { top, bottom } = useScroll();
  const list = useRef(null);
  const [q, setQ] = useState('');
  const [site, setSite] = useState('');
  const [moving, setMoving] = useState(null);
  const [reading, setReading] = useState(null);
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
    const options = ['全文を読む', 'カテゴリを変える', ...(link ? ['元のページを開く'] : []), '削除', 'キャンセル'];
    ActionSheetIOS.showActionSheetWithOptions({ title: shortLabel(b), options, destructiveButtonIndex: options.length - 2, cancelButtonIndex: options.length - 1 }, (i) => {
      const choice = options[i];
      if (choice === '全文を読む') setReading(b);
      if (choice === 'カテゴリを変える') setMoving(b);
      if (choice === '元のページを開く') WebBrowser.openBrowserAsync(link);
      if (choice === '削除') remove(b);
    });
  };

  const header = (
    <View style={{ gap: 10, paddingBottom: 6 }}>
      <LargeTitle>{title}</LargeTitle>
      <View style={{ paddingHorizontal: 16 }}><SearchField value={q} onChange={setQ} /></View>
      {/* 横に送るチップは、ステータスバーを押したときの送りの先にしない（一覧のリストだけにする） */}
      <ScrollView horizontal scrollsToTop={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        <Chip label="すべて" count={bookmarks.length} on={sel.all} onPress={() => setSel({ all: true })} />
        {categories.map((cat) => <Chip key={cat} label={cat} count={countOf(cat)} tone={categoryTone(data, cat)} on={sel.category === cat && !sel.sub} onPress={() => setSel({ category: cat })} />)}
        {uncategorized > 0 ? <Chip label="未分類" count={uncategorized} on={sel.uncategorized} onPress={() => setSel({ uncategorized: true })} /> : null}
      </ScrollView>
      {sel.category && subsOf(sel.category).length > 0 ? (
        <ScrollView horizontal scrollsToTop={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
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
        renderItem={({ item, index }) => <View style={{ paddingHorizontal: 16 }}><BookmarkRow b={item} data={data} first={index === 0} onMenu={menu} onMove={setMoving} /></View>}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingTop: top, paddingBottom: bottom }}
        refreshControl={<RefreshControl refreshing={loading && Boolean(data)} onRefresh={onRefresh} tintColor={c.secondary} progressViewOffset={top} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
      <MoveSheet b={moving} data={data} save={save} onClose={() => setMoving(null)} />
      <ReadSheet b={reading} data={data} onClose={() => setReading(null)} />
    </View>
  );
}
