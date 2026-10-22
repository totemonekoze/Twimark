// Twimark の一覧の画面。データは Worker の API（D1）から読む（shared/store.js）。ログインの前は auth.js の画面を出す。
// 縦長（スマートフォン、縦長の窓）はアプリと同じ下のタブ（一覧・カテゴリ・設定）、横長はサイドバーの画面にする。
// 絞り込み（カテゴリ、サブカテゴリ、未分類、サイト）・検索語・タブは URL のクエリに残す。
// 書き込みは1件ずつ順番に送り、成功したら返ってきた最新のデータで描き直す
import { createStore, describeError, ops, SITES, StoreError, subOf } from './shared/store.js';
import { toneOf as toneIn, textMatches, searchTextOf } from './shared/view.js';
import { signIn } from './auth.js';
import { setupSettings } from './settings.js';
import { setupAdd } from './add.js';
import { icon, paintIcons } from './icons.js';
import { $, WIDE, actionSheet, ask, closeSheet, el, motionOK, openSheet, sheet, tell } from './ui.js';

paintIcons();
paintIcons($('#card-template').content);
const list = $('.cards');
const template = $('#card-template');
const searchInput = $('[data-search]');
const sideLists = [$('[data-side-list]'), $('[data-cat-list]')];
const state = (name) => document.querySelectorAll('[data-state]').forEach((e) => { e.hidden = e.dataset.state !== name; });
const sideMsg = (text) => document.querySelectorAll('[data-side-msg]').forEach((e) => { e.textContent = text; });

// 同じオリジンなので Cookie で認証する
const store = createStore();
let data = { categories: [], subcategories: {}, bookmarks: [] };
let loaded = false;
let loadedAt = 0;
let editing = false;
const expanded = new Set();

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
const refresh = async () => { data = (await store.load().catch(relogin)).data; loaded = true; loadedAt = Date.now(); };
const save = (op) => enqueue(() => store.update(op).catch(relogin)).then((next) => { data = next; return next; });
// 失敗したあとは今の内容で描き直す
const resync = () => enqueue(refresh).then(() => renderAll(false), () => {});

// 画面の内容が変わるときは、使えるブラウザでは View Transitions でカードを動かす
const transition = (fn) => (motionOK() && document.startViewTransition ? document.startViewTransition(fn) : fn());

// ---- URL ----
const params = () => new URLSearchParams(location.search);
// 選択中の絞り込み。?category=<名前>（&sub=<名前>）か、一覧にないカテゴリの ?uncategorized。?site= と ?q= は別に保つ
function selection() {
  const p = params();
  return { uncategorized: p.has('uncategorized'), category: p.get('category') ?? '', sub: p.get('sub') ?? '', site: p.get('site') ?? '' };
}
// push はタブと画面の移動（戻るボタンで戻る）。絞り込みと検索は置き換える
function setParams(change, push = false) {
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(change)) {
    if (v === null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  history[push ? 'pushState' : 'replaceState'](history.state, '', `${url.pathname}${url.search}`);
}

const toneOf = (category) => toneIn(data.categories, category);
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

// ---- タブ（縦長）と画面 ----
// 横長ではカテゴリのタブはなく、サイドバーが同じ働きをする
function tab() {
  const t = params().get('tab');
  if (t === 'settings') return 'settings';
  return t === 'categories' && !WIDE.matches ? 'categories' : 'list';
}
const scrollOf = {};
let shownTab = null;
let settings = null;
// 出している設定の画面（null は設定の最初）。設定を離れたら undefined
let settingsPage;
function route() {
  const t = tab();
  if (shownTab && shownTab !== t) scrollOf[shownTab] = scrollY;
  document.querySelectorAll('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== t; });
  document.querySelectorAll('[data-tab-link]').forEach((a) => {
    if (a.dataset.tabLink === t) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  // 設定は移ってきたときだけ読み直す（窓の向きが変わっただけで、一度だけ出すトークンの値を消さないように）
  const page = params().get('page');
  if (t !== 'settings') settingsPage = undefined;
  else if (settings && settingsPage !== page) { settingsPage = page; settings.show(page); }
  if (shownTab !== t) scrollTo(0, scrollOf[t] ?? 0);
  shownTab = t;
}
function goTab(t, extra = {}) {
  const change = { tab: t === 'list' ? null : t, page: null, ...extra };
  if (t === tab() && !extra.page && !params().get('page')) { scrollTo({ top: 0, behavior: motionOK() ? 'smooth' : 'auto' }); return; }
  setParams(change, true);
  route();
}
document.querySelectorAll('[data-tab-link]').forEach((a) => a.addEventListener('click', (e) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  goTab(a.dataset.tabLink);
}));
addEventListener('popstate', () => { route(); renderNav(); apply(false); });
WIDE.addEventListener('change', route);

// 大きな見出しが隠れたら、上のバーに小さな見出しと素材を出す（隠した画面の見出しは見ない）
const titleObserver = new IntersectionObserver((entries) => {
  for (const { target, isIntersecting } of entries) {
    if (target.offsetParent !== null) target.closest('.view').querySelector('.nav-bar').classList.toggle('scrolled', !isIntersecting);
  }
}, { rootMargin: '-52px 0px 0px 0px' });
document.querySelectorAll('.large-title').forEach((h) => titleObserver.observe(h));

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
  if (tone) {
    const dot = el('span', { className: 'dot' });
    dot.dataset.tone = tone;
    b.append(dot);
  }
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

// ---- サイドバーとカテゴリのタブ（同じ行を2か所に描く） ----
function sideLink(label, change, count, tone, chevron) {
  const url = new URL(location.href);
  for (const k of ['category', 'sub', 'uncategorized', 'tab', 'page']) url.searchParams.delete(k);
  if (change.category) url.searchParams.set('category', change.category);
  if (change.sub) url.searchParams.set('sub', change.sub);
  if (change.uncategorized) url.searchParams.set('uncategorized', '');
  const a = el('a', { className: 'side-link', href: `${url.pathname}${url.search}` });
  a.dataset.change = JSON.stringify(change);
  const dot = el('span', { className: 'dot' });
  if (tone) dot.dataset.tone = tone;
  else dot.classList.add('none');
  a.append(dot, el('span', { className: 'label', textContent: label }), el('span', { className: 'count', textContent: String(count) }));
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
function renderSide(ul) {
  const rows = ul.classList.contains('rows');
  ul.classList.toggle('editing', editing);
  if (!loaded) { ul.replaceChildren(); return; }
  const categoryRows = () => [...ul.querySelectorAll(':scope > li.side-row:not(.side-sub, .fixed)')];
  const subRows = (category) => [...ul.querySelectorAll(':scope > li.side-sub')].filter((r) => r.dataset.category === category);
  const items = [el('li', { className: 'side-row fixed' }, sideLink('すべて', {}, data.bookmarks.length, null, rows))];
  for (const c of data.categories) {
    const li = el('li', { className: 'side-row' });
    li.dataset.category = c;
    const move = iconButton('side-move', 'grip', `${c}を移動（ドラッグ、または ↑↓ キー）`, () => {});
    move.dataset.move = c;
    move.addEventListener('pointerdown', (e) => startDrag(e, ul, li, categoryRows, (names) => saveOrder(ul, names, c), (into) => nestTo(c, into)));
    move.addEventListener('keydown', (e) => moveByKey(e, data.categories, c, (names) => saveOrder(ul, names, c)));
    li.append(iconButton('side-del', 'minus', `${c}を削除`, () => askDeleteCategory(c)), sideLink(c, { category: c }, countOf(c), toneOf(c), rows), move);
    items.push(li);
    for (const s of subsOf(c)) {
      const sub = el('li', { className: 'side-row side-sub' });
      sub.dataset.category = c;
      sub.dataset.sub = s;
      const subMove = iconButton('side-move', 'grip', `${s}を移動（ドラッグ、または ↑↓ キー）`, () => {});
      subMove.dataset.move = `${c}\n${s}`;
      const done = (names) => saveSubOrder(ul, c, names, s);
      subMove.addEventListener('pointerdown', (e) => startDrag(e, ul, sub, () => subRows(c), done, (into) => (into ? moveSubTo(c, s, into) : promote(c, s))));
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
  $('[data-inline-title]').textContent = selectionLabel();
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

// rows は並べ替えの対象の行。カテゴリを動かす間は、サブカテゴリの行を隠す（.sorting）。
// drop(入れ先のカテゴリ | null): ほかのカテゴリの行の上下の真ん中半分に重ねて離すと、そのカテゴリへ入れる。
// サブカテゴリを動かす間は、リストの一番下に「カテゴリにする」の置き場を出し、そこで離すと drop(null)
function startDrag(e, ul, li, rows, done, drop) {
  if (e.button !== 0) return;
  e.preventDefault();
  // 移動と離す操作は document で受ける。行を並べ替えるとつまみが DOM から一度外れ、ポインターキャプチャが切れるため
  const pointer = e.pointerId;
  const isSub = li.classList.contains('side-sub');
  if (!isSub) ul.classList.add('sorting');
  li.classList.add('dragging');
  const key = (r) => (isSub ? r.dataset.sub : r.dataset.category);
  const before = rows().map(key);
  const own = li.dataset.category;
  const zone = isSub ? el('li', { className: 'promote-zone', textContent: 'ここに置くとカテゴリになります' }) : null;
  if (zone) ul.append(zone);
  let target = null;
  const setTarget = (next) => {
    if (next === target) return;
    if (target) { target.classList.remove('drop-target'); target.removeAttribute('data-drop-label'); }
    target = next;
    if (!target) return;
    target.classList.add('drop-target');
    if (target !== zone) target.dataset.dropLabel = `「${target.dataset.category}」の下に入れる`;
  };
  const inside = (r, y, band) => { const b = r.getBoundingClientRect(); return y > b.top + b.height * band && y < b.bottom - b.height * band; };
  const onMove = (ev) => {
    if (ev.pointerId !== pointer) return;
    // 入れ先に重なっている間は、並べ替えのためにほかの行をずらさない
    const over = zone && inside(zone, ev.clientY, 0) ? zone
      : [...ul.querySelectorAll(':scope > li.side-row:not(.side-sub, .fixed)')].find((r) => r !== li && r.dataset.category !== (isSub ? own : undefined) && inside(r, ev.clientY, 0.25));
    setTarget(over ?? null);
    if (over) return;
    const others = rows().filter((r) => r !== li);
    const next = others.find((r) => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
    if (next) { if (li.nextElementSibling !== next) next.before(li); }
    else if (others.length > 0 && others.at(-1).nextElementSibling !== li) others.at(-1).after(li);
  };
  const onEnd = (ev) => {
    if (ev.pointerId !== pointer) return;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onEnd);
    document.removeEventListener('pointercancel', onEnd);
    li.classList.remove('dragging');
    ul.classList.remove('sorting');
    zone?.remove();
    const into = target;
    setTarget(null);
    if (into) {
      renderNav();
      drop(into === zone ? null : into.dataset.category);
      return;
    }
    const names = rows().map(key);
    if (names.join('\n') !== before.join('\n')) done(names);
    else renderNav();
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onEnd);
  document.addEventListener('pointercancel', onEnd);
}

// ---- カード ----
// 6行を超えているかは、表示されてから測る（幅が変わったときも測り直す）
const clampObserver = new ResizeObserver((entries) => {
  for (const { target } of entries) {
    const li = target.closest('.card');
    if (!li || expanded.has(li.dataset.id)) continue;
    $('[data-more]', li).hidden = target.scrollHeight <= target.clientHeight + 1;
  }
});

function paintCategory(li, b) {
  const badge = $('[data-f="category"]', li);
  badge.textContent = placeLabel(b);
  badge.dataset.tone = toneOf(b.category);
  badge.setAttribute('aria-label', `カテゴリ: ${placeLabel(b)}（押すと変える）`);
}
const byId = (id) => data.bookmarks.find((b) => b.id === id);
const paintAll = () => [...list.children].forEach((li) => { const b = byId(li.dataset.id); if (b) paintCategory(li, b); });
const openOriginal = (b) => { const url = https(b.url); if (url) open(url, '_blank', 'noopener,noreferrer'); };

function renderCard(b) {
  const li = template.content.firstElementChild.cloneNode(true);
  li.dataset.id = b.id;
  li.style.viewTransitionName = `b-${b.id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const f = (name) => $(`[data-f="${name}"]`, li);
  paintCategory(li, b);
  f('site').textContent = SITES[b.site] ?? b.site;
  f('title').textContent = b.title ?? '';
  f('text').textContent = b.text ?? '';
  f('name').textContent = b.author?.name ?? '';
  f('handle').textContent = b.author?.handle ? `@${b.author.handle}` : '';
  f('date').textContent = day(b.postedAt);
  const url = https(b.url);

  const media = f('media');
  const addImage = (src, badge) => {
    if (!https(src)) return;
    const a = el('a', { href: url ?? '#', target: '_blank', rel: 'noopener noreferrer' });
    const img = el('img', { src, alt: badge ? '動画のサムネイル' : '添付画像', loading: 'lazy', referrerPolicy: 'no-referrer' });
    img.addEventListener('error', () => a.remove());
    a.append(img);
    if (badge) a.append(el('span', { className: 'badge', textContent: badge }));
    media.append(a);
  };
  (b.photos ?? []).slice(0, 4).forEach((p) => addImage(p.url));
  (b.videos ?? []).slice(0, 4).forEach((v) => addImage(v.thumbnail, '動画'));
  media.dataset.count = String(media.children.length);

  const text = f('text');
  const more = $('[data-more]', li);
  const setExpanded = (open) => {
    if (open) expanded.add(b.id); else expanded.delete(b.id);
    text.classList.toggle('clamped', !open);
    more.textContent = open ? '閉じる' : '続きを読む';
    more.setAttribute('aria-expanded', String(open));
    if (open) more.hidden = false;
  };
  if (expanded.has(b.id)) setExpanded(true);
  more.addEventListener('click', () => setExpanded(!expanded.has(b.id)));
  clampObserver.observe(text);

  f('category').addEventListener('click', () => openMove(b.id));
  $('[data-menu]', li).addEventListener('click', () => cardMenu(b.id));
  // カードの空いたところを押すと元のページを開く（文字を選んでいるときは開かない）
  li.addEventListener('click', (e) => {
    if (e.target.closest('button, a, select, input') || getSelection()?.toString()) return;
    openOriginal(b);
  });
  return li;
}

function cardMenu(id) {
  const b = byId(id);
  if (!b) return;
  const actions = [{ label: 'カテゴリを変える', run: () => openMove(id) }];
  if (https(b.url)) actions.push({ label: '元のページを開く', run: () => openOriginal(b) });
  actions.push({ label: '削除', destructive: true, run: () => askDelete(id) });
  actionSheet({ title: shortLabel(b), actions });
}

// 絞り込みや検索で残った要素を、時間差でもう一度出す
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
  clampObserver.disconnect();
  const sorted = [...data.bookmarks].sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  list.replaceChildren(...sorted.map(renderCard));
  renderNav();
  renderFilters();
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
// 再読み込み。窓に戻ったときも、1分たっていれば読み直す
async function reload() {
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
      run: () => save(ops.remove(id)).then(() => { expanded.delete(id); transition(() => renderAll(false)); }, (err) => tell('削除できませんでした', describeError(err))),
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
    const dot = el('span', { className: 'dot' });
    dot.dataset.tone = toneOf(category);
    button.append(dot, el('span', { className: 'row-text', textContent: sub ?? category }));
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
  settings = setupSettings(store, session, { goPage: (page) => goTab('settings', page ? { page } : {}) });
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
