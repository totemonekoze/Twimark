// カテゴリのタブ。縦長の Web のカテゴリのタブと同じグループ表示のリスト。行を押すとそのカテゴリで絞った一覧へ移る。
// 「編集」で、削除（⊖）、並べ替え（右のつまみをドラッグ。読み上げでは「上へ」「下へ」）、サブカテゴリとカテゴリの追加。
// つまみで動かしてほかのカテゴリの行に重ねて離すと、その下へ入れる（カテゴリはサブカテゴリになり、サブカテゴリは移る）。
// サブカテゴリを動かす間だけ一番下に「カテゴリにする」の置き場を出す。名前を押すと同じことをメニューでできる。
// カテゴリを消してもブックマークは消えず「未分類」に出る。サブカテゴリを消すと、そのブックマークはカテゴリの直下に戻る
import { useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Animated, LayoutAnimation, PanResponder, Pressable, Text, View } from 'react-native';
import { describeError, ops, LIMITS, subOf } from '../../shared/store.js';
import { toneOf } from '../../shared/view.js';
import { useTheme } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic, Icon, LargeTitle, motionOK, NavBar, Row, Status, TAB_HEIGHT, TextBtn, useScroll } from '../parts';

// 「カテゴリにする」の置き場。カテゴリの名前とぶつからない値
const PROMOTE = '\u0000promote';

// 並べ替えと、入れ先への移動。つまみを押さえて動かした分だけ行が指に付いて動き、入る位置に線を出す。
// drops.hit(画面の y) が入れ先（カテゴリの名前か PROMOTE）を返す間は線を出さず、離すと drops.drop(key, 入れ先)。
// 並べ替えは新しい並びを先に出して保存する（onDrop は Promise を返す。終わったら保存の結果の並びに戻す）。busy（保存中）の間は持ち上げない
function useReorder(saved, onDrop, setScrolling, busy, drops) {
  const [pending, setPending] = useState(null);
  const keys = pending ?? saved;
  const layouts = useRef({});
  const dy = useRef(new Animated.Value(0)).current;
  const [drag, setDrag] = useState(null); // { key, target, over }
  const latest = useRef(null);
  latest.current = { keys, onDrop, busy, drops };
  const responders = useRef({});
  // 最後に重なった入れ先。離したときはこれを使う（動かさずに離すと gestureState.moveY は 0 のままで、位置を当てにできない）
  const hovered = useRef(null);

  // 動かす行を抜いた並びの中で、入る位置
  const targetOf = (key, moved) => {
    const { keys: list } = latest.current;
    const me = layouts.current[key];
    if (!me) return list.indexOf(key);
    const mid = me.y + me.height / 2 + moved;
    return list.filter((k) => k !== key && layouts.current[k] && layouts.current[k].y + layouts.current[k].height / 2 < mid).length;
  };
  const commit = (next, drop = latest.current.onDrop) => {
    if (motionOK()) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPending(next);
    drop(next).finally(() => setPending(null));
  };
  const finish = (key, moved) => {
    const { keys: list, drops: d } = latest.current;
    const over = hovered.current;
    hovered.current = null;
    d?.end();
    dy.setValue(0);
    setDrag(null);
    setScrolling(true);
    if (over) { d.drop(key, over); return; }
    const next = list.filter((k) => k !== key);
    next.splice(targetOf(key, moved), 0, key);
    if (next.join('\n') !== list.join('\n')) commit(next);
  };
  const responderFor = (key) => {
    responders.current[key] ??= PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.busy,
      onMoveShouldSetPanResponder: () => !latest.current.busy,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        haptic.light();
        setScrolling(false);
        dy.setValue(0);
        hovered.current = null;
        latest.current.drops?.start(key);
        setDrag({ key, target: latest.current.keys.indexOf(key), over: null });
      },
      onPanResponderMove: (_, g) => {
        dy.setValue(g.dy);
        const d = latest.current.drops;
        const over = d?.hit(g.moveY, key) ?? null;
        hovered.current = over;
        d?.hover(over);
        const target = over ? null : targetOf(key, g.dy);
        setDrag((now) => {
          if (!now || (now.over === over && now.target === target)) return now;
          haptic.select();
          return { key, target, over };
        });
      },
      onPanResponderRelease: (_, g) => finish(key, g.dy),
      onPanResponderTerminate: (_, g) => finish(key, g.dy),
    });
    return responders.current[key];
  };
  // 動かしている行だけが指に付いて動く（ほかの行はずらさないので、入れ先の位置が変わらない）
  const styleFor = (key) => (drag?.key === key
    ? { transform: [{ translateY: dy }, { scale: motionOK() ? 1.02 : 1 }], zIndex: 10, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }
    : null);
  // 入る位置の線の高さ（親の中の y）。動かないときと、入れ先に重なっているときは null
  let lineY = null;
  if (drag && !drag.over && drag.target !== keys.indexOf(drag.key)) {
    const others = keys.filter((k) => k !== drag.key);
    const at = layouts.current[others[drag.target]];
    const last = layouts.current[others.at(-1)];
    lineY = at ? at.y : last ? last.y + last.height : null;
  }
  const onLayoutFor = (key) => (e) => { layouts.current[key] = e.nativeEvent.layout; };
  const step = (key, by) => {
    const next = [...keys];
    const i = next.indexOf(key);
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  return { keys, responderFor, styleFor, onLayoutFor, step, lineY };
}

function InsertLine({ y, left = 16 }) {
  const { c } = useTheme();
  if (y === null) return null;
  return <View pointerEvents="none" style={{ position: 'absolute', left, right: 8, top: y - 1, height: 3, borderRadius: 2, backgroundColor: c.accent, zIndex: 20 }} />;
}

function Handle({ label, responder, onStep }) {
  const { c } = useTheme();
  return (
    <View {...responder.panHandlers} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      accessible accessibilityLabel={`${label}を並べ替え`} accessibilityActions={[{ name: 'up', label: '上へ' }, { name: 'down', label: '下へ' }]}
      onAccessibilityAction={(e) => onStep(e.nativeEvent.actionName === 'up' ? -1 : 1)}>
      <Icon name="line.3.horizontal" size={18} color={c.tertiary} />
    </View>
  );
}

function DeleteMark({ label, onPress }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={6} style={{ marginLeft: -4 }} accessibilityRole="button" accessibilityLabel={`${label}を削除`}>
      <Icon name="minus.circle.fill" size={22} color={c.danger} />
    </Pressable>
  );
}

// 編集中の名前。押すと移し先のメニュー（読み上げでは「移す」）
function MoveName({ label, style, onMenu }) {
  return (
    <Pressable onPress={onMenu} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }} accessibilityRole="button" accessibilityHint="移し先を選びます"
      accessibilityActions={[{ name: 'activate' }, { name: 'move', label: '移す' }]} onAccessibilityAction={onMenu}>
      <Text style={style}>{label}</Text>
    </Pressable>
  );
}

// カテゴリ1つ分のサブカテゴリの行と、編集中は「サブカテゴリを追加」
function Block({ cat, data, editing, busy, run, onPick, onScrolling, drops, onMenu }) {
  const { c, t, s } = useTheme();
  const count = (sub) => data.bookmarks.filter((b) => b.category === cat && (sub === undefined || subOf(data, b) === sub)).length;
  const subOrder = useReorder(data.subcategories[cat] ?? [], (names) => run(ops.sortSubcategories(cat, names)), onScrolling, busy, drops);
  const subs = subOrder.keys;
  const removeSub = (sub) => ActionSheetIOS.showActionSheetWithOptions({
    title: `「${cat} › ${sub}」を削除しますか？`, message: `このサブカテゴリのブックマークは消えず、「${cat}」の直下に戻ります。`,
    options: ['削除', 'キャンセル'], destructiveButtonIndex: 0, cancelButtonIndex: 1,
  }, (i) => { if (i === 0) { haptic.warning(); run(ops.removeSubcategory(cat, sub)); } });
  const addSub = () => Alert.prompt(`「${cat}」にサブカテゴリを追加`, `${LIMITS.category}文字まで`, [
    { text: 'キャンセル', style: 'cancel' },
    { text: '追加', onPress: (name) => run(ops.addSubcategory(cat, (name ?? '').trim())) },
  ], 'plain-text');
  return (
    <View>
      {subs.map((sub) => (
        <Animated.View key={sub} onLayout={subOrder.onLayoutFor(sub)} style={[{ backgroundColor: c.surface }, subOrder.styleFor(sub)]}>
          <View style={[s.separator, { marginLeft: 40 }]} />
          {editing ? (
            <View style={[s.row, { paddingLeft: 16, paddingVertical: 0, paddingRight: 0 }]}>
              <DeleteMark label={sub} onPress={() => removeSub(sub)} />
              <View style={{ width: 12 }} />
              <MoveName label={sub} style={t.subhead} onMenu={() => onMenu(cat, sub)} />
              <Handle label={sub} responder={subOrder.responderFor(sub)} onStep={(by) => !busy && subOrder.step(sub, by)} />
            </View>
          ) : (
            <Pressable onPress={() => onPick({ category: cat, sub })} style={({ pressed }) => [s.row, { paddingLeft: 40 }, pressed && { backgroundColor: c.fill }]} accessibilityRole="button">
              <Text style={[t.subhead, { flex: 1 }]}>{sub}</Text>
              <Text style={[t.subhead, { color: c.secondary }]}>{count(sub)}</Text>
              <Icon name="chevron.right" size={13} weight="semibold" color={c.tertiary} />
            </Pressable>
          )}
        </Animated.View>
      ))}
      <InsertLine y={subOrder.lineY} left={40} />
      {editing ? (
        <View>
          <View style={[s.separator, { marginLeft: 40 }]} />
          <Pressable onPress={addSub} disabled={busy} style={({ pressed }) => [s.row, { paddingLeft: 40 }, pressed && { backgroundColor: c.fill }]} accessibilityRole="button">
            <Icon name="plus" size={16} />
            <Text style={[t.subhead, { color: c.accent }]}>サブカテゴリを追加</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export default function CategoriesScreen({ data, save, onPick }) {
  const { c, t, s, tone } = useTheme();
  const { scrollY, props, bottom } = useScroll();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(null);
  const [scrolling, setScrolling] = useState(true);
  // 保存の間は操作させない。続けて並べ替えると、保存前の並びから入れ替えて上書きしてしまうため
  const [busy, setBusy] = useState(false);
  // ドラッグの入れ先。カテゴリの行と置き場の画面の位置を、持ち上げたときに測る（ドラッグの間は送りもずらしもしない）
  const headers = useRef({});
  const zone = useRef(null);
  const rects = useRef({});
  const [hover, setHover] = useState(null);
  const [subDragging, setSubDragging] = useState(false);
  const run = (op, done) => {
    setBusy(true);
    return save(op)
      .then(() => { setStatus(null); done?.(); }, (err) => { haptic.warning(); setStatus({ text: describeError(err, '保存できませんでした。'), kind: 'error' }); })
      .finally(() => setBusy(false));
  };
  // カテゴリをサブカテゴリにする・戻す・移す。子を持つカテゴリは、区切りが戻せなくなるので確かめてから入れる
  const nestTo = (name, parent) => {
    const subs = (data.subcategories[name] ?? []).length;
    const go = () => run(ops.nestCategory(name, parent), haptic.success);
    if (!subs) { go(); return; }
    ActionSheetIOS.showActionSheetWithOptions({
      title: `「${name}」を「${parent}」の下に入れますか？`, message: `サブカテゴリ ${subs}個も「${parent}」の下に同じ段で並びます。あとから元の区切りには戻せません。`,
      options: ['入れる', 'キャンセル'], cancelButtonIndex: 1,
    }, (i) => { if (i === 0) go(); });
  };
  const moveSubTo = (from, name, to) => run(ops.moveSubcategory(from, name, to), haptic.success);
  const promote = (from, name) => run(ops.promoteSubcategory(from, name), haptic.success);

  // 入れ先。カテゴリを動かすときは動かしているカテゴリ（key）を、サブカテゴリを動かすときは親（own）を入れ先にしない。
  // サブカテゴリのときだけ置き場を使う
  const dropsFor = (own, isSub, onDrop) => ({
    start: () => {
      rects.current = {};
      const measure = (key, ref) => ref?.measureInWindow((x, y, w, h) => { rects.current[key] = { y, h }; });
      for (const [cat, ref] of Object.entries(headers.current)) measure(cat, ref);
      if (isSub) { measure(PROMOTE, zone.current); setSubDragging(true); }
    },
    hit: (y, key) => {
      const z = rects.current[PROMOTE];
      if (isSub && z && y >= z.y && y <= z.y + z.h) return PROMOTE;
      const skip = isSub ? own : key;
      const found = Object.entries(rects.current).find(([cat, r]) => cat !== PROMOTE && cat !== skip && y > r.y + r.h * 0.25 && y < r.y + r.h * 0.75);
      return found ? found[0] : null;
    },
    hover: (over) => setHover((now) => (now === over ? now : over)),
    end: () => { setHover(null); setSubDragging(false); },
    drop: onDrop,
  });
  const order = useReorder(data?.categories ?? [], (names) => run(ops.sortCategories(names)), setScrolling, busy, dropsFor(null, false, (key, into) => nestTo(key, into)));
  const categories = order.keys;
  const menu = (title, items) => {
    const options = [...items.map(([label]) => label), 'キャンセル'];
    ActionSheetIOS.showActionSheetWithOptions({ title, options, cancelButtonIndex: items.length }, (i) => items[i]?.[1]());
  };
  const moveMenu = (cat, sub) => {
    const others = categories.filter((x) => x !== cat);
    if (sub) menu(`「${cat} › ${sub}」を移す`, [['カテゴリにする', () => promote(cat, sub)], ...others.map((x) => [`「${x}」へ移す`, () => moveSubTo(cat, sub, x)])]);
    else menu(`「${cat}」をサブカテゴリにする`, others.map((x) => [`「${x}」の下に入れる`, () => nestTo(cat, x)]));
  };

  const removeCategory = (cat) => ActionSheetIOS.showActionSheetWithOptions({
    title: `「${cat}」を削除しますか？`, message: 'このカテゴリのブックマークは消えず、「未分類」に出ます。サブカテゴリも消えます。',
    options: ['削除', 'キャンセル'], destructiveButtonIndex: 0, cancelButtonIndex: 1,
  }, (i) => { if (i === 0) { haptic.warning(); run(ops.removeCategory(cat)); } });
  const addCategory = () => Alert.prompt('カテゴリを追加', `${LIMITS.category}文字まで`, [
    { text: 'キャンセル', style: 'cancel' },
    { text: '追加', onPress: (name) => run(ops.addCategory((name ?? '').trim())) },
  ], 'plain-text');
  const count = (cat) => data.bookmarks.filter((b) => b.category === cat).length;
  const uncategorized = data ? data.bookmarks.filter((b) => !categories.includes(b.category)).length : 0;

  const fixedRow = (label, n, next) => <Row key={label} title={label} value={String(n)} chevron onPress={() => onPick(next)} />;
  return (
    <View style={s.screen}>
      <Animated.ScrollView {...props} scrollEnabled={scrolling} contentContainerStyle={{ paddingBottom: bottom }}>
        <LargeTitle>カテゴリ</LargeTitle>
        {!data ? <Text style={[s.groupNote, { marginTop: 0 }]}>一覧を読み込めていません。</Text> : (
          <View style={s.group}>
            {!editing ? <>{fixedRow('すべて', data.bookmarks.length, { all: true })}<View style={s.separator} /></> : null}
            {categories.map((cat, i) => {
              const [fg] = tone(toneOf(categories, cat));
              const over = hover === cat;
              return (
                <Animated.View key={cat} onLayout={order.onLayoutFor(cat)} style={[{ backgroundColor: c.surface }, order.styleFor(cat)]}>
                  {i > 0 ? <View style={s.separator} /> : null}
                  {editing ? (
                    <View ref={(r) => { if (r) headers.current[cat] = r; else delete headers.current[cat]; }} collapsable={false}
                      style={[s.row, { paddingVertical: 0, paddingRight: 0 }, over && { backgroundColor: c.accentSoft, borderWidth: 2, borderColor: c.accent, borderRadius: 10 }]}>
                      <DeleteMark label={cat} onPress={() => removeCategory(cat)} />
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: fg }} />
                      <MoveName label={cat} style={t.body} onMenu={() => moveMenu(cat)} />
                      {over ? <Text style={[t.footnote, { color: c.accentInk, fontWeight: '600' }]} numberOfLines={1}>の下に入れる</Text> : null}
                      <Handle label={cat} responder={order.responderFor(cat)} onStep={(by) => !busy && order.step(cat, by)} />
                    </View>
                  ) : (
                    <Row title={cat} dot={fg} value={String(count(cat))} chevron onPress={() => onPick({ category: cat })} />
                  )}
                  <Block cat={cat} data={data} editing={editing} busy={busy} run={run} onPick={onPick} onScrolling={setScrolling} onMenu={moveMenu}
                    drops={dropsFor(cat, true, (sub, into) => (into === PROMOTE ? promote(cat, sub) : moveSubTo(cat, sub, into)))} />
                </Animated.View>
              );
            })}
            <InsertLine y={order.lineY} />
            {!editing && uncategorized > 0 ? <><View style={s.separator} />{fixedRow('未分類', uncategorized, { uncategorized: true })}</> : null}
            {editing ? (
              <>
                <View style={s.separator} />
                <Pressable onPress={addCategory} disabled={busy} style={({ pressed }) => [s.row, pressed && { backgroundColor: c.fill }]} accessibilityRole="button">
                  <Icon name="plus" size={18} />
                  <Text style={[t.body, { color: c.accent }]}>カテゴリを追加</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        )}
        <View style={{ marginHorizontal: 32, marginTop: 8 }}><Status status={status} /></View>
        <Text style={s.groupNote}>「編集」で、並べ替え（つまみをドラッグ）、追加、削除ができます。つまみで動かしてほかのカテゴリの行に重ねると、その下に入ります。名前を押しても移せます。カテゴリを消してもブックマークは消えず「未分類」に出ます。</Text>
      </Animated.ScrollView>
      {/* 「カテゴリにする」の置き場。リストが長くても見えるようタブバーの上に重ねる。測れるように編集中はいつも置き、サブカテゴリを動かす間だけ見せる */}
      {editing && data ? (
        <View ref={zone} collapsable={false} pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + TAB_HEIGHT + 12, minHeight: 56, borderRadius: 10, borderWidth: 2, borderStyle: 'dashed',
          borderColor: hover === PROMOTE ? c.accent : c.tertiary, backgroundColor: hover === PROMOTE ? c.accentSoft : c.surface, alignItems: 'center', justifyContent: 'center', opacity: subDragging ? 1 : 0 }}>
          <Text style={[t.footnote, { color: hover === PROMOTE ? c.accentInk : c.secondary, fontWeight: hover === PROMOTE ? '600' : '400' }]}>ここに置くとカテゴリになります</Text>
        </View>
      ) : null}
      <NavBar title="カテゴリ" scrollY={scrollY} right={data ? <TextBtn title={editing ? '完了' : '編集'} strong={editing} onPress={() => { haptic.select(); setEditing(!editing); }} /> : null} />
    </View>
  );
}
