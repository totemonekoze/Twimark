// Twimark の一覧の画面。データは Worker の API（D1）から読む（shared/store.js）。ログインの前は auth.js の画面を出す。
// 縦長（スマートフォン、縦長の窓）はアプリと同じ作り（上のバーなし、下のボタン1つで開くメニュー、右下の追加）、横長はサイドバーの画面。
// 絞り込み（カテゴリ、サブカテゴリ、未分類、サイト）・検索語・画面は URL のクエリに残す。
// 書き込みは1件ずつ順番に送り、成功したら返ってきた最新のデータで描き直す
import { createStore, describeError, ops, SITES, StoreError, subOf } from './shared/store.js';
import { categoryTone, textMatches, searchTextOf } from './shared/view.js';
import { signIn } from './auth.js';
import { setupSettings } from './settings.js';
import { setupAdd } from './add.js';
import { applyAccent, applyCachedAccent, openColorSheet, paintTone } from './colors.js';
import { icon, paintIcons } from './icons.js';
import { $, WIDE, actionSheet, ask, closeSheet, el, motionOK, openSheet, sheet, tell } from './ui.js';

applyCachedAccent();
paintIcons();
paintIcons($('#bookmark-template').content);
const list = $('[data-list]');
const template = $('#bookmark-template');
const searchInput = $('[data-search]');
const sideLists = [$('[data-side-list]'), $('[data-cat-list]')];
const state = (name) => document.querySelectorAll('[data-state]').forEach((e) => { e.hidden = e.dataset.state !== name; });
const sideMsg = (text) => document.querySelectorAll('[data-side-msg]').forEach((e) => { e.textContent = text; });

// 同じオリジンなので Cookie で認証する
const store = createStore();
let data = { categories: [], subcategories: {}, categoryColors: {}, accent: null, bookmarks: [] };
let loaded = false;
let loadedAt = 0;
let editing = false;

// 書き込みと読み込みは1件ずつ順番に。失敗しても後ろは続ける
let queue = Promise.resolve();
function enqueue(task) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}
// ログインが切れていたら、ログインの画面から出直す
const relogin = (err) => {
  if (err?.code === 'unauthorized') location.reload();
  throw err;
};
// アクセントはデータと一緒に来るので、読むたびに入れる
const take = (next) => { data = next; applyAccent(data.accent); return next; };
const refresh = async () => { take((await store.load().catch(relogin)).data); loaded = true; loadedAt = Date.now(); };
const save = (op) => enqueue(() => store.update(op).catch(relogin)).then(take);
// 失敗したあとは今の内容で描き直す
const resync = () => enqueue(refresh).then(() => renderAll(false), () => {});

// 画面の内容が変わるときは、使えるブラウザでは View Transitions で行を動かす
const transition = (fn) => (motionOK() && document.startViewTransition ? document.startViewTransition(fn) : fn());

// ---- URL ----
const params = () => new URLSearchParams(location.search);
// 選択中の絞り込み。?category=<名前>（&sub=<名前>）か、一覧にないカテゴリの ?uncategorized。?site= と ?q= は別に保つ
function selection() {
  const p = params();
  return { uncategorized: p.has('uncategorized'), category: p.get('category') ?? '', sub: p.get('sub') ?? '', site: p.get('site') ?? '' };
}
// push は画面の移動（戻るボタンで戻る）。絞り込みと検索は置き換える
function setParams(change, push = false) {
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(change)) {
    if (v === null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  history[push ? 'pushState' : 'replaceState'](history.state, '', `${url.pathname}${url.search}`);
}

const toneOf = (category) => categoryTone(data, category);
const subsOf = (category) => data.subcategories[category] ?? [];
const inCategory = (b) => {
  const s = selection();
  if (s.uncategorized) return !data.categories.includes(b.category);
  if (!s.category) return true;
  if (b.category !== s.category) return false;
  return !s.sub || subOf(data, b) === s.sub;
};
const matches = (b) => inCategory(b) && (!selection().site || b.site === selection().site) && textMatches(searchTextOf(b), searchInput.value);
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '投稿日不明');
const https = (url) => (typeof url === 'string' && /^https:\/\//.test(url) ? url : null);
const placeLabel = (b) => {
  if (!data.categories.includes(b.category)) return `${b.category}（未分類）`;
  const sub = subOf(data, b);
  return sub ? `${b.category} › ${sub}` : b.category;
};
const countOf = (category, sub) => data.bookmarks.filter((b) => b.category === category && (sub === undefined || subOf(data, b) === sub)).length;
const uncategorizedCount = () => data.bookmarks.filter((b) => !data.categories.includes(b.category)).length;
const shortLabel = (b) => {
  const label = b.title || b.text || b.url;
  return `${SITES[b.site] ?? ''}：${label.slice(0, 60)}${label.length > 60 ? '…' : ''}`;
};
const dotFor = (tone) => {
  const dot = el('span', { className: 'dot' });
  if (tone) paintTone(dot, tone);
  else dot.classList.add('none');
  return dot;
};

// ---- 画面とメニュー ----
// 横長ではカテゴリの画面はなく、サイドバーが同じ働きをする
function tab() {
  const t = params().get('tab');
  if (t === 'settings') return 'settings';
  return t === 'categories' && !WIDE.matches ? 'categories' : 'list';
}
const TAB_NAMES = { list: '一覧', categories: 'カテゴリ', settings: '設定' };
const scrollOf = {};
let shownTab = null;
let settings = null;
// 出している設定の画面（null は設定の最初）。設定を離れたら undefined
let settingsPage;
function route() {
  const t = tab();
  if (shownTab && shownTab !== t) scrollOf[shownTab] = scrollY;
  document.body.dataset.tab = t;
  document.querySelectorAll('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== t; });
  document.querySelectorAll('[data-tab-link]').forEach((a) => {
    if (a.dataset.tabLink === t) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('[data-menu-label]').textContent = TAB_NAMES[t];
  // 設定は移ってきたときだけ読み直す（窓の向きが変わっただけで、一度だけ出すトークンの値を消さないように）
  const page = params().get('page');
  if (t !== 'settings') settingsPage = undefined;
  else if (settings && settingsPage !== page) { settingsPage = page; settings.show(page); }
  if (shownTab !== t) scrollTo(0, scrollOf[t] ?? 0);
  shownTab = t;
}
// 今の画面をもう一度選ぶと最上部へ送る
function goTab(t, extra = {}) {
  const change = { tab: t === 'list' ? null : t, page: null, ...extra };
  if (t === tab() && !extra.page && !params().get('page')) { scrollTo({ top: 0, behavior: motionOK() ? 'smooth' : 'auto' }); return; }
  setParams(change, true);
  route();
}
const menuSheet = sheet($('dialog[data-menu-sheet]'));
$('[data-menu-open]').addEventListener('click', () => openSheet(menuSheet));
document.querySelectorAll('[data-tab-link]').forEach((a) => a.addEventListener('click', (e) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  const go = () => goTab(a.dataset.tabLink);
  // メニューから選んだときは、閉じてから移る（開いている間と閉じた直後は、画面の送りが止められているので少し待つ）
  if (!menuSheet.open) { go(); return; }
  closeSheet(menuSheet).then(() => setTimeout(go, 50));
}));
addEventListener('popstate', () => { route(); renderNav(); apply(false); });
WIDE.addEventListener('change', route);

// ---- 絞り込みの名前 ----
function selectionLabel() {
  const s = selection();
  if (s.uncategorized) return '未分類';
  if (!s.category) return 'すべて';
  return s.sub ? `${s.category} › ${s.sub}` : s.category;
}
function pick(change) {
  setParams({ category: change.category ?? null, sub: change.sub ?? null, uncategorized: change.uncategorized ? '' : null });
  transition(() => { renderNav(); apply(false); });
}
const isCurrent = (change) => {
  const s = selection();
  return change.uncategorized ? s.uncategorized : !s.uncategorized && (change.category ?? '') === s.category && (change.sub ?? '') === s.sub;
};

// ---- チップ（縦長の一覧） ----
function chip(label, count, change, tone) {
  const b = el('button', { type: 'button', className: 'chip' });
  b.setAttribute('aria-pressed', String(isCurrent(change)));
  if (tone) b.append(dotFor(tone));
  b.append(el('span', { textContent: label }), el('span', { className: 'count', textContent: String(count) }));
  b.addEventListener('click', () => pick(change));
  return b;
}
function renderChips() {
  const s = selection();
  const chips = [chip('すべて', data.bookmarks.length, {}), ...data.categories.map((c) => chip(c, countOf(c), { category: c }, toneOf(c)))];
  if (uncategorizedCount() > 0) chips.push(chip('未分類', uncategorizedCount(), { uncategorized: true }));
  $('[data-chips]').replaceChildren(...chips);
  const subs = s.category && !s.uncategorized ? subsOf(s.category) : [];
  $('[data-sub-chips]').hidden = subs.length === 0;
  $('[data-sub-chips]').replaceChildren(...(subs.length ? [chip(`${s.category}のすべて`, countOf(s.category), { category: s.category }), ...subs.map((x) => chip(x, countOf(s.category, x), { category: s.category, sub: x }))] : []));
  for (const box of [$('[data-chips]'), $('[data-sub-chips]')]) box.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// ---- サイドバーとカテゴリの画面（同じ行を2か所に描く） ----
function sideLink(label, change, count, tone, chevron) {
  const url = new URL(location.href);
  for (const k of ['category', 'sub', 'uncategorized', 'tab', 'page']) url.searchParams.delete(k);
  if (change.category) url.searchParams.set('category', change.category);
  if (change.sub) url.searchParams.set('sub', change.sub);
  if (change.uncategorized) url.searchParams.set('uncategorized', '');
  const a = el('a', { className: 'side-link', href: `${url.pathname}${url.search}` });
  a.dataset.change = JSON.stringify(change);
  a.append(dotFor(tone), el('span', { className: 'label', textContent: label }), el('span', { className: 'count', textContent: String(count) }));
  if (chevron) a.append(icon('chevron'));
  if (isCurrent(change) && tab() === 'list') a.setAttribute('aria-current', 'page');
  return a;
}
function iconButton(className, name, title, onClick) {
  const b = el('button', { type: 'button', className, title });
  b.setAttribute('aria-label', title);
  b.append(icon(name));
  b.addEventListener('click', onClick);
  return b;
}
function textRow(className, label, onClick) {
  const b = el('button', { type: 'button', className: 'side-link add-row' }, icon('plus'), el('span', { className: 'label', textContent: label }));
  b.addEventListener('click', onClick);
  return el('li', { className }, b);
}
// 編集中に出す色の点。押すと色を選ぶシート
function colorButton(c) {
  const b = el('button', { type: 'button', className: 'side-color', title: `${c}の色を変える` });
  b.setAttribute('aria-label', `${c}の色を変える`);
  b.append(dotFor(toneOf(c)));
  b.addEventListener('click', () => openColorSheet({
    kind: 'category',
    title: `「${c}」の色`,
    value: data.categoryColors[c] ?? null,
    auto: toneOf(c),
    onSave: (color) => save(ops.setCategoryColor(c, color)).then(() => renderAll(false)),
  }));
  return b;
}
function renderSide(ul) {
  const rows = ul.classList.contains('rows');
  ul.classList.toggle('editing', editing);
  if (!loaded) { ul.replaceChildren(); return; }
  const items = [el('li', { className: 'side-row fixed' }, sideLink('すべて', {}, data.bookmarks.length, null, rows))];
  for (const c of data.categories) {
    const li = el('li', { className: 'side-row' });
    li.dataset.category = c;
    const move = iconButton('side-move', 'grip', `${c}を移動（ドラッグ、または ↑↓ キー）`, () => {});
    move.dataset.move = c;
    move.addEventListener('pointerdown', (e) => startDrag(e, ul, li, (names) => saveOrder(ul, names, c), (into) => nestTo(c, into)));
    move.addEventListener('keydown', (e) => moveByKey(e, data.categories, c, (names) => saveOrder(ul, names, c)));
    li.append(iconButton('side-del', 'minus', `${c}を削除`, () => askDeleteCategory(c)), colorButton(c), sideLink(c, { category: c }, countOf(c), toneOf(c), rows), move);
    items.push(li);
    for (const s of subsOf(c)) {
      const sub = el('li', { className: 'side-row side-sub' });
      sub.dataset.category = c;
      sub.dataset.sub = s;
      const subMove = iconButton('side-move', 'grip', `${s}を移動（ドラッグ、または ↑↓ キー）`, () => {});
      subMove.dataset.move = `${c}\n${s}`;
      const done = (names) => saveSubOrder(ul, c, names, s);
      subMove.addEventListener('pointerdown', (e) => startDrag(e, ul, sub, done, (into) => (into ? moveSubTo(c, s, into) : promote(c, s))));
      subMove.addEventListener('keydown', (e) => moveByKey(e, subsOf(c), s, done));
      sub.append(iconButton('side-del', 'minus', `${s}を削除`, () => askDeleteCategory(c, s)), sideLink(s, { category: c, sub: s }, countOf(c, s), null, rows), subMove);
      items.push(sub);
    }
    items.push(textRow('side-sub edit-only add-sub', 'サブカテゴリを追加', () => openCategoryAdd(c)));
  }
  if (uncategorizedCount() > 0) items.push(el('li', { className: 'side-row fixed' }, sideLink('未分類', { uncategorized: true }, uncategorizedCount(), null, rows)));
  items.push(textRow('edit-only', 'カテゴリを追加', () => openCategoryAdd()));
  ul.replaceChildren(...items);
}
for (const ul of sideLists) {
  ul.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-change]');
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (editing) { moveMenu(JSON.parse(a.dataset.change)); return; }
    pick(JSON.parse(a.dataset.change));
    if (tab() !== 'list') goTab('list');
  });
}
function setEditing(on) {
  editing = on;
  document.querySelectorAll('[data-edit-toggle]').forEach((b) => { b.textContent = on ? '完了' : '編集'; b.classList.toggle('strong', on); });
  sideMsg('');
  sideLists.forEach(renderSide);
}
document.querySelectorAll('[data-edit-toggle]').forEach((b) => b.addEventListener('click', () => setEditing(!editing)));

function renderNav() {
  sideLists.forEach(renderSide);
  renderChips();
  $('[data-list-title]').textContent = selectionLabel();
  document.title = selection().category || selection().uncategorized ? `${selectionLabel()} - Twimark` : 'Twimark';
}

// 並べ替え。画面を先に並べ替えてから保存を送り、失敗したら今の並びに戻す
function afterSort(ul, focusKey, op) {
  sideMsg('');
  renderNav();
  paintAll();
  if (focusKey) ul.querySelector(`[data-move="${CSS.escape(focusKey)}"]`)?.focus();
  save(op).catch((err) => {
    sideMsg(`並べ替えを保存できませんでした。${describeError(err)}`);
    resync();
  });
}
function saveOrder(ul, names, focusName) {
  data = { ...data, categories: names };
  afterSort(ul, focusName, ops.sortCategories(names));
}
function saveSubOrder(ul, category, names, focusName) {
  data = { ...data, subcategories: { ...data.subcategories, [category]: names } };
  afterSort(ul, `${category}\n${focusName}`, ops.sortSubcategories(category, names));
}
function moveByKey(e, names, name, done) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  const i = names.indexOf(name);
  const j = e.key === 'ArrowUp' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= names.length) return;
  const next = [...names];
  [next[i], next[j]] = [next[j], next[i]];
  done(next);
}
// ---- カテゴリをサブカテゴリにする・戻す・移す ----
// retarget(今の絞り込み) は、絞り込みが動かしたものを指していたら移った先を返す
function moved(op, retarget) {
  sideMsg('');
  save(op).then(() => {
    const next = retarget(selection());
    if (next) setParams({ category: next.category, sub: next.sub ?? null });
    transition(() => renderAll(false));
  }, (err) => {
    sideMsg(`移せませんでした。${describeError(err)}`);
    resync();
  });
}
// 子を持つカテゴリは、区切りが戻せなくなるので確かめてから入れる
function nestTo(name, parent) {
  const subs = subsOf(name).length;
  const run = () => moved(ops.nestCategory(name, parent), (s) => (s.category === name ? { category: parent, sub: s.sub || name } : null));
  if (!subs) { run(); return; }
  actionSheet({
    title: `「${name}」を「${parent}」の下に入れますか？`,
    message: `サブカテゴリ ${subs}個も「${parent}」の下に同じ段で並びます。あとから元の区切りには戻せません。`,
    actions: [{ label: '入れる', run }],
  });
}
const moveSubTo = (from, name, to) => moved(ops.moveSubcategory(from, name, to), (s) => (s.category === from && s.sub === name ? { category: to, sub: name } : null));
const promote = (from, name) => moved(ops.promoteSubcategory(from, name), (s) => (s.category === from && s.sub === name ? { category: name } : null));
// 編集中に名前を押したときの移し先のメニュー（ドラッグしない方法）
function moveMenu(change) {
  if (!change.category) return;
  const others = data.categories.filter((c) => c !== change.category);
  if (change.sub) {
    actionSheet({
      title: `「${change.category} › ${change.sub}」を移す`,
      actions: [{ label: 'カテゴリにする', run: () => promote(change.category, change.sub) }, ...others.map((c) => ({ label: `「${c}」へ移す`, run: () => moveSubTo(change.category, change.sub, c) }))],
    });
    return;
  }
  actionSheet({ title: `「${change.category}」をサブカテゴリにする`, actions: others.map((c) => ({ label: `「${c}」の下に入れる`, run: () => nestTo(change.category, c) })) });
}

// ---- ドラッグ ----
// 動かす行（カテゴリならそのサブカテゴリの行も一緒に）が指に付いて動き、ほかの行はずらさず、入る位置に線を出す。
// 動かす行が、ほかのカテゴリの行と、その行の高さの半分以上重なったら入れ先にする（重なりの大きいほう）。
// サブカテゴリを動かす間は、画面の下に「カテゴリにする」の置き場を出し、重なったら入れ先にする。
// 離したとき: 入れ先があれば drop(入れ先のカテゴリ | null＝置き場)、なければ並びが変わっていれば done(新しい並び)
function startDrag(e, ul, li, done, drop) {
  if (e.button !== 0) return;
  e.preventDefault();
  // 移動と離す操作は document で受ける（つまみの上から指が外れても続ける）
  const pointer = e.pointerId;
  const y0 = e.clientY;
  const isSub = li.classList.contains('side-sub');
  const own = li.dataset.category;
  const heads = [...ul.querySelectorAll(':scope > li.side-row:not(.side-sub, .fixed)')];
  // カテゴリの塊（カテゴリの行と、続くサブカテゴリの行・「サブカテゴリを追加」）
  const blockOf = (head) => {
    const out = [head];
    for (let n = head.nextElementSibling; n?.classList.contains('side-sub'); n = n.nextElementSibling) out.push(n);
    return out;
  };
  const units = isSub ? [...ul.querySelectorAll(':scope > li.side-sub[data-sub]')].filter((r) => r.dataset.category === own) : heads;
  const span = (els) => ({ top: els[0].getBoundingClientRect().top, bottom: els.at(-1).getBoundingClientRect().bottom });
  // ドラッグの間は行をずらさず、送りもしないので、位置は最初に測ったままでよい
  const unitRect = new Map(units.map((u) => [u, span(isSub ? [u] : blockOf(u))]));
  const headRect = new Map(heads.map((h) => [h, h.getBoundingClientRect()]));
  const me = li.getBoundingClientRect();
  const ulTop = ul.getBoundingClientRect().top;
  const moving = isSub ? [li] : blockOf(li);
  const from = units.indexOf(li);
  const others = units.filter((u) => u !== li);
  const line = el('li', { className: 'drop-line', hidden: true });
  line.setAttribute('aria-hidden', 'true');
  ul.append(line);
  const zone = isSub ? el('li', { className: 'promote-zone', textContent: 'ここに置くとカテゴリになります' }) : null;
  if (zone) ul.append(zone);
  moving.forEach((m) => m.classList.add('dragging'));
  li.classList.add('drag-head');
  let target = null;
  let index = from;
  const setTarget = (next) => {
    if (next === target) return;
    if (target) target.classList.remove('drop-target');
    target = next;
    // 入れ先の行は動かしている行の下に隠れるので、「〇〇の下に入れる」は動かしている行に出す
    li.classList.toggle('nesting', Boolean(target));
    if (!target) return;
    target.classList.add('drop-target');
    li.dataset.dropLabel = target === zone ? 'カテゴリにする' : `「${target.dataset.category}」の下に入れる`;
  };
  const onMove = (ev) => {
    if (ev.pointerId !== pointer) return;
    const dy = ev.clientY - y0;
    moving.forEach((m) => { m.style.transform = `translateY(${dy}px)`; });
    const top = me.top + dy;
    const bottom = me.bottom + dy;
    const overlap = (r) => Math.max(0, Math.min(bottom, r.bottom) - Math.max(top, r.top));
    let best = null;
    let most = 0;
    for (const [h, r] of headRect) {
      if (h === li || (isSub && h.dataset.category === own)) continue;
      const share = overlap(r) / r.height;
      if (share >= 0.5 && share > most) { best = h; most = share; }
    }
    if (zone) {
      const r = zone.getBoundingClientRect();
      if (overlap(r) / Math.min(me.height, r.height) >= 0.5) best = zone;
    }
    setTarget(best);
    // 入れ先に重なっている間は線を出さない（並べ替えにしない）
    if (best) { line.hidden = true; index = from; return; }
    const mid = (top + bottom) / 2;
    index = others.filter((u) => { const r = unitRect.get(u); return (r.top + r.bottom) / 2 < mid; }).length;
    line.hidden = index === from;
    if (line.hidden) return;
    const y = index < others.length ? unitRect.get(others[index]).top : unitRect.get(others.at(-1)).bottom;
    line.style.top = `${y - ulTop}px`;
  };
  const onEnd = (ev) => {
    if (ev.pointerId !== pointer) return;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onEnd);
    document.removeEventListener('pointercancel', onEnd);
    moving.forEach((m) => { m.classList.remove('dragging'); m.style.transform = ''; });
    li.classList.remove('drag-head', 'nesting');
    line.remove();
    zone?.remove();
    const into = target;
    setTarget(null);
    if (into) {
      renderNav();
      drop(into === zone ? null : into.dataset.category);
      return;
    }
    if (index === from) return;
    const key = (r) => (isSub ? r.dataset.sub : r.dataset.category);
    const names = others.map(key);
    names.splice(index, 0, key(li));
    done(names);
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onEnd);
  document.addEventListener('pointercancel', onEnd);
}

// ---- 一覧の行 ----
const byId = (id) => data.bookmarks.find((b) => b.id === id);
const openOriginal = (b) => { const url = https(b.url); if (url) open(url, '_blank', 'noopener,noreferrer'); };
// 画像（写真、動画のサムネイル）の URL。https だけ
const imagesOf = (b) => [...(b.photos ?? []).map((p) => ({ src: p.url })), ...(b.videos ?? []).map((v) => ({ src: v.thumbnail, video: true }))].filter((m) => https(m.src));
const LETTERS = { x: 'X', note: 'n', qiita: 'Q' };

function paintCategory(li, b) {
  const button = $('[data-f="category"]', li);
  $('[data-f="category-label"]', li).textContent = placeLabel(b);
  paintTone(button, toneOf(b.category));
  paintTone($('[data-f="thumb"]', li), toneOf(b.category));
  button.setAttribute('aria-label', `カテゴリ: ${placeLabel(b)}（押すと変える）`);
}
const paintAll = () => [...list.children].forEach((li) => { const b = byId(li.dataset.id); if (b) paintCategory(li, b); });

// 画像のないとき（と読めなかったとき）は、カテゴリの色の四角にサイトの頭文字
function letterTile(thumb, b) {
  thumb.classList.add('letter');
  thumb.replaceChildren(el('span', { textContent: LETTERS[b.site] ?? '・' }));
}
function renderRow(b) {
  const li = template.content.firstElementChild.cloneNode(true);
  li.dataset.id = b.id;
  li.style.viewTransitionName = `b-${b.id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const f = (name) => $(`[data-f="${name}"]`, li);
  paintCategory(li, b);
  f('site').textContent = SITES[b.site] ?? b.site;
  f('title').textContent = b.title ?? '';
  f('text').textContent = b.text ?? '';
  // タイトルのないもの（X のポスト）は、本文を見出しの太さで長めに出す
  li.classList.toggle('no-title', !b.title);
  f('name').textContent = b.author?.name || (b.author?.handle ? `@${b.author.handle}` : '');
  f('date').textContent = day(b.postedAt);

  const thumb = f('thumb');
  const images = imagesOf(b);
  if (images.length) {
    const img = el('img', { src: images[0].src, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' });
    img.addEventListener('error', () => letterTile(thumb, b));
    thumb.append(img);
    if (images[0].video) thumb.append(el('span', { className: 'play', textContent: '▶' }));
    if (images.length > 1) thumb.append(el('span', { className: 'more-count', textContent: `+${images.length - 1}` }));
  } else letterTile(thumb, b);

  f('category').addEventListener('click', () => openMove(b.id));
  $('[data-menu]', li).addEventListener('click', () => rowMenu(b.id));
  // 行を押すと元のページを開く（文字を選んでいるときは開かない）
  li.addEventListener('click', (e) => {
    if (e.target.closest('button, a, select, input') || getSelection()?.toString()) return;
    openOriginal(b);
  });
  return li;
}

function rowMenu(id) {
  const b = byId(id);
  if (!b) return;
  const actions = [{ label: '全文を読む', run: () => openRead(id) }, { label: 'カテゴリを変える', run: () => openMove(id) }];
  if (https(b.url)) actions.push({ label: '元のページを開く', run: () => openOriginal(b) });
  actions.push({ label: '削除', destructive: true, run: () => askDelete(id) });
  actionSheet({ title: shortLabel(b), actions });
}

// ---- 全文のシート ----
const readSheet = sheet($('dialog[data-read-sheet]'));
let reading = null;
function openRead(id) {
  const b = byId(id);
  if (!b) return;
  reading = b;
  $('[data-read-head]').textContent = `${placeLabel(b)} · ${SITES[b.site] ?? b.site}`;
  $('[data-read-media]').replaceChildren(...imagesOf(b).map((m) => el('img', { src: m.src, alt: m.video ? '動画のサムネイル' : '添付画像', loading: 'lazy', referrerPolicy: 'no-referrer' })));
  $('[data-read-heading]').textContent = b.title ?? '';
  $('[data-read-text]').textContent = b.text ?? '';
  $('[data-read-meta]').textContent = `${b.author?.name ?? ''}${b.author?.handle ? ` @${b.author.handle}` : ''} · ${day(b.postedAt)}`;
  $('[data-read-open]').hidden = !https(b.url);
  openSheet(readSheet);
}
$('[data-read-open]').addEventListener('click', () => { if (reading) openOriginal(reading); });

// 絞り込みや検索で残った行を、時間差でもう一度出す
function reveal(elements) {
  elements.slice(0, 30).forEach((e, i) => {
    e.style.setProperty('--i', String(i));
    e.classList.remove('rise');
    void e.offsetWidth;
    e.classList.add('rise');
  });
}

function apply(animate = true) {
  if (!loaded) return;
  const shown = [];
  for (const li of list.children) {
    const b = byId(li.dataset.id);
    li.hidden = !b || !matches(b);
    if (!li.hidden) shown.push(li);
  }
  state(shown.length > 0 ? 'none' : data.bookmarks.length > 0 ? 'nomatch' : 'empty');
  if (animate) reveal(shown);
}

// セグメントの選んだ側は、つまみ（::before）を --i の位置へ動かす
function renderFilters() {
  const site = selection().site;
  const buttons = [...document.querySelectorAll('[data-site-filters] button')];
  buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.site === site)));
  $('[data-site-filters]').style.setProperty('--i', String(Math.max(0, buttons.findIndex((b) => b.dataset.site === site))));
}

function renderAll(animate) {
  const sorted = [...data.bookmarks].sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  list.replaceChildren(...sorted.map(renderRow));
  renderNav();
  renderFilters();
  settings?.refreshAccent();
  apply(animate);
}

$('[data-site-filters]').addEventListener('click', (e) => {
  const button = e.target.closest('button[data-site]');
  if (!button) return;
  setParams({ site: button.dataset.site || null });
  renderFilters();
  transition(() => apply(false));
});

searchInput.value = params().get('q') ?? '';
searchInput.addEventListener('input', () => {
  setParams({ q: searchInput.value.trim() ? searchInput.value : null });
  apply(false);
});

async function load() {
  loaded = false;
  list.replaceChildren();
  renderNav();
  renderFilters();
  state('loading');
  try {
    await enqueue(refresh);
    renderAll(true);
  } catch (err) {
    $('[data-error-text]').textContent = describeError(err);
    state('error');
  }
}
// 再読み込み（メニューとサイドバー）。窓に戻ったときも、1分たっていれば読み直す
async function reload() {
  if (menuSheet.open) closeSheet(menuSheet);
  const buttons = document.querySelectorAll('[data-reload]');
  buttons.forEach((b) => b.classList.add('spinning'));
  try {
    if (!loaded) { await load(); return; }
    await enqueue(refresh);
    transition(() => renderAll(false));
  } catch (err) {
    tell('読み込めませんでした', describeError(err));
  } finally {
    buttons.forEach((b) => b.classList.remove('spinning'));
  }
}
document.querySelectorAll('[data-reload]').forEach((b) => b.addEventListener('click', reload));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && loaded && Date.now() - loadedAt > 60_000 && !document.querySelector('dialog[open]')) reload();
});

// ---- ブックマークの削除 ----
function askDelete(id) {
  const b = byId(id);
  if (!b) return;
  actionSheet({
    title: 'このブックマークを削除しますか？',
    message: shortLabel(b),
    actions: [{
      label: '削除',
      destructive: true,
      run: () => save(ops.remove(id)).then(() => transition(() => renderAll(false)), (err) => tell('削除できませんでした', describeError(err))),
    }],
  });
}

// ---- カテゴリの変更（シート） ----
const moveSheet = sheet($('dialog[data-move-sheet]'));
function openMove(id) {
  const b = byId(id);
  if (!b) return;
  $('[data-move-target]').textContent = shortLabel(b);
  $('[data-move-error]').textContent = '';
  const current = [b.category, data.categories.includes(b.category) ? subOf(data, b) : null];
  const row = (category, sub) => {
    const on = current[0] === category && current[1] === sub;
    const button = el('button', { type: 'button', className: `row action${sub ? ' indent' : ''}` });
    button.append(dotFor(toneOf(category)), el('span', { className: 'row-text', textContent: sub ?? category }));
    if (on) { button.append(icon('check')); button.setAttribute('aria-current', 'true'); }
    button.addEventListener('click', async () => {
      if (on) { closeSheet(moveSheet); return; }
      $('[data-move-list]').inert = true;
      try {
        await save(ops.setCategory(id, category, sub));
        closeSheet(moveSheet);
        transition(() => renderAll(false));
      } catch (err) {
        $('[data-move-error]').textContent = describeError(err, '保存できませんでした。');
      } finally {
        $('[data-move-list]').inert = false;
      }
    });
    return el('li', {}, button);
  };
  $('[data-move-list]').replaceChildren(...data.categories.flatMap((c) => [row(c, null), ...subsOf(c).map((s) => row(c, s))]));
  openSheet(moveSheet);
}

// ---- カテゴリとサブカテゴリの追加・削除 ----
function openCategoryAdd(parent = null) {
  ask({
    title: parent ? `「${parent}」にサブカテゴリを追加` : 'カテゴリを追加',
    placeholder: '名前（20文字まで）',
    maxLength: 20,
    ok: '追加',
    run: async (name) => {
      if (!name) throw new StoreError('invalid_name', '名前を入れてください。');
      if ((parent ? subsOf(parent) : data.categories).includes(name)) throw new StoreError('duplicate', parent ? 'そのサブカテゴリはもうあります。' : 'そのカテゴリはもうあります。');
      await save(parent ? ops.addSubcategory(parent, name) : ops.addCategory(name));
      renderAll(false);
    },
  });
}
// カテゴリの削除（ブックマークは消さず「未分類」に出る。サブカテゴリは消える）と、
// サブカテゴリの削除（ブックマークはカテゴリの直下に戻る）
function askDeleteCategory(category, sub = null) {
  let message;
  if (sub) {
    const affected = countOf(category, sub);
    message = `「${category} › ${sub}」を削除します。${affected > 0 ? `このサブカテゴリのブックマーク ${affected}件は消えず、「${category}」の直下に戻ります。` : ''}`;
  } else {
    const affected = countOf(category);
    const subs = subsOf(category).length;
    message = `「${category}」を削除します。${affected > 0 ? `このカテゴリのブックマーク ${affected}件は消えず、「未分類」に表示されます。` : ''}${subs > 0 ? `サブカテゴリ ${subs}個も消えます。` : ''}`;
  }
  actionSheet({
    title: sub ? 'サブカテゴリを削除しますか？' : 'カテゴリを削除しますか？',
    message,
    actions: [{
      label: '削除',
      destructive: true,
      run: () => save(sub ? ops.removeSubcategory(category, sub) : ops.removeCategory(category)).then(() => {
        const s = selection();
        if (s.category === category && (!sub || s.sub === sub)) setParams(sub ? { sub: null } : { category: null, sub: null });
        renderAll(false);
      }, (err) => tell('削除できませんでした', describeError(err))),
    }],
  });
}

// ---- 追加 ----
const add = setupAdd({
  store,
  data: () => data,
  save,
  added: () => {
    if (tab() !== 'list') goTab('list');
    scrollTo({ top: 0, behavior: motionOK() ? 'smooth' : 'auto' });
    transition(() => renderAll(false));
  },
});
document.querySelectorAll('[data-open-add]').forEach((b) => b.addEventListener('click', () => add.open()));

signIn(store).then(async (session) => {
  $('[data-app]').hidden = false;
  settings = setupSettings(store, session, {
    goPage: (page) => goTab('settings', page ? { page } : {}),
    accent: () => data.accent,
    saveAccent: (color) => save(ops.setAccent(color)),
  });
  // アプリの「パスキーを追加」から来たときは設定を開く
  if (params().get('passkey') === 'add') setParams({ tab: 'settings' });
  route();
  await load();
  // /?add=<URL> で開いたときは、その URL で追加のシートを開く（保存は「追加」を押したときだけ）
  const shared = params().get('add');
  if (shared) {
    setParams({ add: null });
    add.open(shared);
  }
});
