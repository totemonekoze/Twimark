// カテゴリのタブ。縦長の Web のカテゴリのタブと同じグループ表示のリスト。行を押すとそのカテゴリで絞った一覧へ移る。
// 「編集」で、削除（⊖）、並べ替え（右のつまみをドラッグ。読み上げでは「上へ」「下へ」）、サブカテゴリとカテゴリの追加。
// カテゴリを消してもブックマークは消えず「未分類」に出る。サブカテゴリを消すと、そのブックマークはカテゴリの直下に戻る
import { useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Animated, LayoutAnimation, PanResponder, Pressable, Text, View } from 'react-native';
import { describeError, ops, LIMITS, subOf } from '../../shared/store.js';
import { toneOf } from '../../shared/view.js';
import { useTheme } from '../theme';
import { haptic, Icon, LargeTitle, motionOK, NavBar, Row, Status, TextBtn, useScroll } from '../parts';

// 並べ替え。つまみを押さえて動かした分だけ行を動かし、ほかの行は空いた所へずらす。
// 離したら新しい並びを先に出して保存する（onDrop は Promise を返す。終わったら保存の結果の並びに戻す）。busy（保存中）の間は持ち上げない
function useReorder(saved, onDrop, setScrolling, busy) {
  const [pending, setPending] = useState(null);
  const keys = pending ?? saved;
  const layouts = useRef({});
  const dy = useRef(new Animated.Value(0)).current;
  const [drag, setDrag] = useState(null); // { key, target }
  const latest = useRef({ keys, onDrop, busy });
  latest.current = { keys, onDrop, busy };
  const responders = useRef({});

  const targetOf = (key, moved) => {
    const { keys: list } = latest.current;
    const me = layouts.current[key];
    if (!me) return list.indexOf(key);
    const mid = me.y + me.height / 2 + moved;
    return list.filter((k) => k !== key && layouts.current[k] && layouts.current[k].y + layouts.current[k].height / 2 < mid).length;
  };
  const finish = (key, moved) => {
    const { keys: list, onDrop: drop } = latest.current;
    const target = targetOf(key, moved);
    dy.setValue(0);
    setDrag(null);
    setScrolling(true);
    const next = list.filter((k) => k !== key);
    next.splice(target, 0, key);
    if (next.join('\n') !== list.join('\n')) commit(next, drop);
  };
  const commit = (next, drop = latest.current.onDrop) => {
    if (motionOK()) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPending(next);
    drop(next).finally(() => setPending(null));
  };
  const responderFor = (key) => {
    responders.current[key] ??= PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.busy,
      onMoveShouldSetPanResponder: () => !latest.current.busy,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => { haptic.light(); setScrolling(false); dy.setValue(0); setDrag({ key, target: latest.current.keys.indexOf(key) }); },
      onPanResponderMove: (_, g) => {
        dy.setValue(g.dy);
        const target = targetOf(key, g.dy);
        setDrag((d) => (d && d.target !== target ? (haptic.select(), { key, target }) : d));
      },
      onPanResponderRelease: (_, g) => finish(key, g.dy),
      onPanResponderTerminate: (_, g) => finish(key, g.dy),
    });
    return responders.current[key];
  };
  // 動かしている行は指に付いて動き、ほかの行は動かす行の高さの分だけずれる
  const styleFor = (key) => {
    if (!drag) return null;
    if (drag.key === key) return { transform: [{ translateY: dy }, { scale: motionOK() ? 1.02 : 1 }], zIndex: 10, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } };
    const from = keys.indexOf(drag.key);
    const i = keys.indexOf(key);
    const h = layouts.current[drag.key]?.height ?? 0;
    if (from < i && i <= drag.target) return { transform: [{ translateY: -h }] };
    if (drag.target <= i && i < from) return { transform: [{ translateY: h }] };
    return null;
  };
  const onLayoutFor = (key) => (e) => { layouts.current[key] = e.nativeEvent.layout; };
  const step = (key, by) => {
    const next = [...keys];
    const i = next.indexOf(key);
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  return { keys, responderFor, styleFor, onLayoutFor, step };
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

// カテゴリ1つ分（カテゴリの行、サブカテゴリの行、編集中は「サブカテゴリを追加」）
function Block({ cat, data, editing, busy, run, onPick, onScrolling }) {
  const { c, t, s } = useTheme();
  const count = (sub) => data.bookmarks.filter((b) => b.category === cat && (sub === undefined || subOf(data, b) === sub)).length;
  const subOrder = useReorder(data.subcategories[cat] ?? [], (names) => run(ops.sortSubcategories(cat, names)), onScrolling, busy);
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
      {subs.map((sub, j) => (
        <Animated.View key={sub} onLayout={subOrder.onLayoutFor(sub)} style={[{ backgroundColor: c.surface }, subOrder.styleFor(sub)]}>
          <View style={[s.separator, { marginLeft: 40 }]} />
          {editing ? (
            <View style={[s.row, { paddingLeft: 16, paddingVertical: 0, paddingRight: 0 }]}>
              <DeleteMark label={sub} onPress={() => removeSub(sub)} />
              <Text style={[t.subhead, { flex: 1, paddingLeft: 12 }]}>{sub}</Text>
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
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(null);
  const [scrolling, setScrolling] = useState(true);
  // 保存の間は操作させない。続けて並べ替えると、保存前の並びから入れ替えて上書きしてしまうため
  const [busy, setBusy] = useState(false);
  const run = (op) => {
    setBusy(true);
    return save(op)
      .then(() => setStatus(null), (err) => { haptic.warning(); setStatus({ text: describeError(err, '保存できませんでした。'), kind: 'error' }); })
      .finally(() => setBusy(false));
  };
  const order = useReorder(data?.categories ?? [], (names) => run(ops.sortCategories(names)), setScrolling, busy);
  const categories = order.keys;

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
              return (
                <Animated.View key={cat} onLayout={order.onLayoutFor(cat)} style={[{ backgroundColor: c.surface }, order.styleFor(cat)]}>
                  {i > 0 ? <View style={s.separator} /> : null}
                  {editing ? (
                    <View style={[s.row, { paddingVertical: 0, paddingRight: 0 }]}>
                      <DeleteMark label={cat} onPress={() => removeCategory(cat)} />
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: fg }} />
                      <Text style={[t.body, { flex: 1 }]}>{cat}</Text>
                      <Handle label={cat} responder={order.responderFor(cat)} onStep={(by) => !busy && order.step(cat, by)} />
                    </View>
                  ) : (
                    <Row title={cat} dot={fg} value={String(count(cat))} chevron onPress={() => onPick({ category: cat })} />
                  )}
                  {<Block cat={cat} data={data} editing={editing} busy={busy} run={run} onPick={onPick} onScrolling={setScrolling} />}
                </Animated.View>
              );
            })}
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
        <Text style={s.groupNote}>「編集」で、並べ替え（つまみをドラッグ）、追加、削除ができます。カテゴリを消してもブックマークは消えず「未分類」に出ます。</Text>
      </Animated.ScrollView>
      <NavBar title="カテゴリ" scrollY={scrollY} right={data ? <TextBtn title={editing ? '完了' : '編集'} strong={editing} onPress={() => { haptic.select(); setEditing(!editing); }} /> : null} />
    </View>
  );
}
