// Twimark の一覧の画面。データは Worker の API（D1）から読む（shared/store.js）。ログインの前は auth.js の画面を出す。
// 絞り込み（カテゴリ、サブカテゴリ、未分類、サイト）と検索語は URL のクエリに残す。書き込みは1件ずつ順番に送り、成功したら返ってきた最新のデータで描き直す
import { createStore, describeError, ops, SITES, subOf } from './shared/store.js';
import { toneOf as toneIn, textMatches, searchTextOf } from './shared/view.js';
import { signIn } from './auth.js';
import { setupSettings } from './settings.js';

const $ = (s, root = document) => root.querySelector(s);
const list = $('.cards');
const template = $('#card-template');
const nav = $('[data-side]');
const sideList = $('[data-side-list]');
const sideMsg = $('[data-side-msg]');
const sideWrap = $('.side-wrap');
const searchInput = $('[data-search]');
const state = (name) => document.querySelectorAll('[data-state]').forEach((el) => { el.hidden = el.dataset.state !== name; });

// 同じオリジンなので Cookie で認証する
const store = createStore();
let data = { categories: [], subcategories: {}, bookmarks: [] };
let loaded = false;
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
const refresh = async () => { data = (await store.load().catch(relogin)).data; loaded = true; };
const save = (op) => enqueue(() => store.update(op).catch(relogin)).then((next) => { data = next; });
// 失敗したあとは今の内容で描き直す
const resync = () => enqueue(refresh).then(() => renderAll(false), () => {});

// 選択中の絞り込み。?category=<名前>（&sub=<名前>）か、一覧にないカテゴリの ?uncategorized。?site= と ?q= は別に保つ
function selection() {
  const p = new URLSearchParams(location.search);
  return { uncategorized: p.has('uncategorized'), category: p.get('category') ?? '', sub: p.get('sub') ?? '', site: p.get('site') ?? '' };
}
function setParams(change) {
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(change)) {
    if (v === null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  history.replaceState(history.state, '', `${url.pathname}${url.search}`);
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

// サイドメニュー
function sideLink(label, change, count, tone) {
  const url = new URL(location.href);
  for (const k of ['category', 'sub', 'uncategorized']) url.searchParams.delete(k);
  if (change.category) url.searchParams.set('category', change.category);
  if (change.sub) url.searchParams.set('sub', change.sub);
  if (change.uncategorized) url.searchParams.set('uncategorized', '');
  const a = Object.assign(document.createElement('a'), { href: `${url.pathname}${url.search}` });
  a.dataset.change = JSON.stringify(change);
  a.append(Object.assign(document.createElement('span'), { className: 'label', textContent: label }));
  const span = Object.assign(document.createElement('span'), { className: 'count', textContent: String(count) });
  if (tone) span.dataset.tone = tone;
  a.append(span);
  const s = selection();
  const current = change.uncategorized ? s.uncategorized : !s.uncategorized && (change.category ?? '') === s.category && (change.sub ?? '') === s.sub;
  if (current) {
    a.setAttribute('aria-current', 'page');
    $('[data-side-current]').textContent = change.sub ? `${change.category} › ${label}` : label;
  }
  return a;
}

function iconButton(className, text, title, onClick) {
  const b = Object.assign(document.createElement('button'), { type: 'button', className, textContent: text, title });
  b.setAttribute('aria-label', title);
  b.addEventListener('click', onClick);
  return b;
}

function renderSide() {
  $('[data-side-current]').textContent = 'すべて';
  $('[data-side-extra]').hidden = !loaded;
  if (!loaded) { sideList.replaceChildren(); return; }
  const all = document.createElement('li');
  all.append(sideLink('すべて', {}, data.bookmarks.length));
  const items = [all];
  for (const c of data.categories) {
    const li = Object.assign(document.createElement('li'), { className: 'side-row' });
    li.dataset.category = c;
    const move = iconButton('side-move', '⠿', `${c}を移動（ドラッグ、または ↑↓ キー）`, () => {});
    move.dataset.move = c;
    move.addEventListener('pointerdown', (e) => startDrag(e, li, categoryRows, (names) => saveOrder(names, c)));
    move.addEventListener('keydown', (e) => moveByKey(e, data.categories, c, (names) => saveOrder(names, c)));
    const count = data.bookmarks.filter((b) => b.category === c).length;
    li.append(
      move,
      sideLink(c, { category: c }, count, toneOf(c)),
      iconButton('side-addsub', '＋', `${c}にサブカテゴリを追加`, () => openCategoryDialog(c)),
      iconButton('side-del', '×', `${c}を削除`, () => askDeleteCategory(c)),
    );
    items.push(li);
    for (const s of subsOf(c)) {
      const sub = Object.assign(document.createElement('li'), { className: 'side-row side-sub' });
      sub.dataset.category = c;
      sub.dataset.sub = s;
      const subMove = iconButton('side-move', '⠿', `${s}を移動（ドラッグ、または ↑↓ キー）`, () => {});
      subMove.dataset.move = `${c}\n${s}`;
      const done = (names) => saveSubOrder(c, names, s);
      subMove.addEventListener('pointerdown', (e) => startDrag(e, sub, () => subRows(c), done));
      subMove.addEventListener('keydown', (e) => moveByKey(e, subsOf(c), s, done));
      const n = data.bookmarks.filter((b) => b.category === c && subOf(data, b) === s).length;
      sub.append(subMove, sideLink(s, { category: c, sub: s }, n), iconButton('side-del', '×', `${s}を削除`, () => askDeleteCategory(c, s)));
      items.push(sub);
    }
  }
  const uncategorized = data.bookmarks.filter((b) => !data.categories.includes(b.category)).length;
  if (uncategorized > 0) {
    const li = document.createElement('li');
    li.append(sideLink('未分類', { uncategorized: true }, uncategorized));
    items.push(li);
  }
  sideList.replaceChildren(...items);
}

const narrow = matchMedia('(max-width: 720px)');
sideWrap.open = !narrow.matches;
narrow.addEventListener('change', () => { sideWrap.open = !narrow.matches; });
nav.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-change]');
  if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  const change = JSON.parse(a.dataset.change);
  setParams({ category: change.category ?? null, sub: change.sub ?? null, uncategorized: change.uncategorized ? '' : null });
  if (narrow.matches) sideWrap.open = false;
  renderSide();
  apply();
});

// 並べ替え。画面を先に並べ替えてから保存を送り、失敗したら今の並びに戻す
const categoryRows = () => [...sideList.querySelectorAll(':scope > li.side-row:not(.side-sub)')];
const subRows = (category) => [...sideList.querySelectorAll(':scope > li.side-sub')].filter((r) => r.dataset.category === category);
function afterSort(focusKey, op) {
  sideMsg.textContent = '';
  renderSide();
  paintAll();
  if (focusKey) sideList.querySelector(`[data-move="${CSS.escape(focusKey)}"]`)?.focus();
  save(op).catch((err) => {
    sideMsg.textContent = `並べ替えを保存できませんでした。${describeError(err)}`;
    resync();
  });
}
function saveOrder(names, focusName) {
  data = { ...data, categories: names };
  afterSort(focusName, ops.sortCategories(names));
}
function saveSubOrder(category, names, focusName) {
  data = { ...data, subcategories: { ...data.subcategories, [category]: names } };
  afterSort(`${category}\n${focusName}`, ops.sortSubcategories(category, names));
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
// rows は並べ替えの対象の行。カテゴリを動かす間は、サブカテゴリの行を隠す（.sorting）
function startDrag(e, li, rows, done) {
  if (e.button !== 0) return;
  e.preventDefault();
  // 移動と離す操作は document で受ける。行を並べ替えるとつまみが DOM から一度外れ、ポインターキャプチャが切れるため
  const pointer = e.pointerId;
  const isSub = li.classList.contains('side-sub');
  if (!isSub) sideList.classList.add('sorting');
  li.classList.add('dragging');
  const key = (r) => (isSub ? r.dataset.sub : r.dataset.category);
  const before = rows().map(key);
  const onMove = (ev) => {
    if (ev.pointerId !== pointer) return;
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
    sideList.classList.remove('sorting');
    const names = rows().map(key);
    if (names.join('\n') !== before.join('\n')) done(names);
    else renderSide();
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onEnd);
  document.addEventListener('pointercancel', onEnd);
}

// カード
// 6行を超えているかは、表示されてから測る（幅が変わったときも測り直す）
const clampObserver = new ResizeObserver((entries) => {
  for (const { target } of entries) {
    const li = target.closest('.card');
    if (!li || expanded.has(li.dataset.id)) continue;
    $('[data-more]', li).hidden = target.scrollHeight <= target.clientHeight + 1;
  }
});

// カテゴリの札と、変更の <select>。選択肢はカテゴリごとの <optgroup> に、カテゴリそのものとサブカテゴリを並べる。
// 一覧にないカテゴリは「（未分類）」として選択肢に残す。値は [カテゴリ, サブカテゴリ] の JSON
function paintCategory(li, b) {
  const badge = $('[data-f="category"]', li);
  badge.textContent = placeLabel(b);
  badge.dataset.tone = toneOf(b.category);
  const select = $('[data-f="category-select"]', li);
  const option = (category, sub, label) => Object.assign(document.createElement('option'), { value: JSON.stringify([category, sub]), textContent: label });
  const groups = data.categories.map((c) => {
    const g = Object.assign(document.createElement('optgroup'), { label: c });
    g.append(option(c, null, c), ...subsOf(c).map((s) => option(c, s, `${c} › ${s}`)));
    return g;
  });
  if (!data.categories.includes(b.category)) groups.unshift(option(b.category, null, `${b.category}（未分類）`));
  select.replaceChildren(...groups);
  select.value = JSON.stringify([b.category, data.categories.includes(b.category) ? subOf(data, b) : null]);
}
const byId = (id) => data.bookmarks.find((b) => b.id === id);
const paintAll = () => [...list.children].forEach((li) => { const b = byId(li.dataset.id); if (b) paintCategory(li, b); });

function renderCard(b) {
  const li = template.content.firstElementChild.cloneNode(true);
  li.dataset.id = b.id;
  const f = (name) => $(`[data-f="${name}"]`, li);
  paintCategory(li, b);
  f('site').textContent = SITES[b.site] ?? b.site;
  f('title').textContent = b.title ?? '';
  f('text').textContent = b.text ?? '';
  f('name').textContent = b.author?.name ?? '';
  f('handle').textContent = b.author?.handle ? `@${b.author.handle}` : '';
  f('date').textContent = day(b.postedAt);
  const url = https(b.url);
  if (url) f('link').href = url;
  else f('link').hidden = true;

  const media = f('media');
  const fallback = () => {
    if (!$('.fallback', media)) media.append(Object.assign(document.createElement('p'), { className: 'fallback', textContent: '画像は元のページで見られます。' }));
  };
  const addImage = (src, badge) => {
    if (!https(src)) return;
    const a = Object.assign(document.createElement('a'), { href: url ?? '#', target: '_blank', rel: 'noopener noreferrer' });
    const img = Object.assign(document.createElement('img'), { src, alt: badge ? '動画のサムネイル' : '添付画像', loading: 'lazy', referrerPolicy: 'no-referrer' });
    img.addEventListener('error', () => { a.remove(); fallback(); });
    a.append(img);
    if (badge) a.append(Object.assign(document.createElement('span'), { className: 'badge', textContent: badge }));
    media.append(a);
  };
  (b.photos ?? []).forEach((p) => addImage(p.url));
  (b.videos ?? []).forEach((v) => addImage(v.thumbnail, '動画'));

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

  const select = f('category-select');
  const saveMsg = f('save');
  select.addEventListener('change', () => {
    const [category, sub] = JSON.parse(select.value);
    select.disabled = true;
    saveMsg.dataset.kind = '';
    saveMsg.textContent = '保存中…';
    save(ops.setCategory(b.id, category, sub)).then(() => {
      renderAll(false);
      const msg = list.querySelector(`[data-id="${CSS.escape(b.id)}"] [data-f="save"]`);
      if (msg) msg.textContent = '保存しました';
    }, (err) => {
      paintCategory(li, b);
      select.disabled = false;
      saveMsg.dataset.kind = 'error';
      saveMsg.textContent = describeError(err, '保存できませんでした');
    });
  });
  $('[data-delete]', li).addEventListener('click', () => askDelete(b));
  return li;
}

// 絞り込みや検索で残った要素を、時間差でもう一度フェードインさせる
function reveal(elements) {
  elements.forEach((el, i) => {
    el.style.setProperty('--i', String(i));
    el.classList.remove('rise');
    void el.offsetWidth;
    el.classList.add('rise');
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

function renderFilters() {
  const site = selection().site;
  document.querySelectorAll('[data-site-filters] button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.site === site)));
}

function renderAll(animate) {
  clampObserver.disconnect();
  const sorted = [...data.bookmarks].sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  list.replaceChildren(...sorted.map(renderCard));
  renderSide();
  renderFilters();
  apply(animate);
}

document.querySelector('[data-site-filters]').addEventListener('click', (e) => {
  const button = e.target.closest('button[data-site]');
  if (!button) return;
  setParams({ site: button.dataset.site || null });
  renderFilters();
  apply();
});

searchInput.value = new URLSearchParams(location.search).get('q') ?? '';
searchInput.addEventListener('input', () => {
  setParams({ q: searchInput.value.trim() ? searchInput.value : null });
  apply();
});

async function load() {
  loaded = false;
  list.replaceChildren();
  renderSide();
  renderFilters();
  state('loading');
  try {
    await enqueue(refresh);
    renderAll(true);
  } catch (err) {
    $('[data-state="error"]').textContent = `読み込めませんでした。${describeError(err)}`;
    state('error');
  }
}

// ブックマークの削除
const confirmDialog = $('dialog.confirm');
const deleteError = $('[data-delete-error]');
let pending = null;
function askDelete(b) {
  pending = b;
  const label = b.title || b.text || b.url;
  $('[data-delete-target]').textContent = `${SITES[b.site] ?? ''}：${label.slice(0, 60)}${label.length > 60 ? '…' : ''}`;
  deleteError.textContent = '';
  confirmDialog.showModal();
}
$('[data-confirm-delete]').addEventListener('click', async () => {
  if (!pending) return;
  const { id } = pending;
  try {
    await save(ops.remove(id));
    expanded.delete(id);
    renderAll(false);
    confirmDialog.close();
  } catch (err) {
    deleteError.textContent = describeError(err, '削除できませんでした。');
  }
});

// カテゴリとサブカテゴリの追加。parent があれば、そのカテゴリのサブカテゴリ
const categoryDialog = $('dialog.category-add');
const categoryForm = $('[data-category-form]');
const categoryError = $('[data-category-error]');
const categorySubmit = $('[data-category-submit]');
let parent = null;
function openCategoryDialog(category = null) {
  parent = category;
  $('#category-add-title').textContent = category ? `「${category}」にサブカテゴリを追加` : 'カテゴリを追加';
  categoryForm.reset();
  categoryError.textContent = '';
  categoryDialog.showModal();
}
$('[data-open-category]').addEventListener('click', () => openCategoryDialog());
$('[data-category-cancel]').addEventListener('click', () => categoryDialog.close());
categoryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = categoryForm.elements.namedItem('name').value.trim();
  categoryError.textContent = '';
  if (!name) { categoryError.textContent = '名前を入れてください。'; return; }
  const existing = parent ? subsOf(parent) : data.categories;
  if (existing.includes(name)) { categoryError.textContent = parent ? 'そのサブカテゴリはもうあります。' : 'そのカテゴリはもうあります。'; return; }
  categorySubmit.disabled = true;
  try {
    await save(parent ? ops.addSubcategory(parent, name) : ops.addCategory(name));
    renderAll(false);
    categoryDialog.close();
  } catch (err) {
    categoryError.textContent = describeError(err, '追加できませんでした。');
  } finally {
    categorySubmit.disabled = false;
  }
});

// カテゴリの削除（ブックマークは消さず「未分類」に出る。サブカテゴリは消える）と、
// サブカテゴリの削除（ブックマークはカテゴリの直下に戻る）
const categoryDeleteDialog = $('dialog.category-delete');
const categoryDeleteError = $('[data-category-delete-error]');
let pendingCategory = null;
function askDeleteCategory(category, sub = null) {
  pendingCategory = { category, sub };
  $('#category-delete-title').textContent = sub ? 'サブカテゴリを削除しますか？' : 'カテゴリを削除しますか？';
  let message;
  if (sub) {
    const affected = data.bookmarks.filter((b) => b.category === category && subOf(data, b) === sub).length;
    message = `「${category} › ${sub}」を削除します。${affected > 0 ? `このサブカテゴリのブックマーク ${affected}件は消えず、「${category}」の直下に戻ります。` : ''}`;
  } else {
    const affected = data.bookmarks.filter((b) => b.category === category).length;
    const subs = subsOf(category).length;
    message = `「${category}」を削除します。${affected > 0 ? `このカテゴリのブックマーク ${affected}件は消えず、「未分類」に表示されます。` : ''}${subs > 0 ? `サブカテゴリ ${subs}個も消えます。` : ''}`;
  }
  $('[data-category-delete-target]').textContent = message;
  categoryDeleteError.textContent = '';
  categoryDeleteDialog.showModal();
}
$('[data-confirm-category-delete]').addEventListener('click', async () => {
  if (pendingCategory === null) return;
  const { category, sub } = pendingCategory;
  try {
    await save(sub ? ops.removeSubcategory(category, sub) : ops.removeCategory(category));
    const s = selection();
    if (s.category === category && (!sub || s.sub === sub)) setParams(sub ? { sub: null } : { category: null, sub: null });
    renderAll(false);
    categoryDeleteDialog.close();
  } catch (err) {
    categoryDeleteError.textContent = describeError(err, '削除できませんでした。');
  }
});

signIn(store).then((login) => {
  $('[data-app]').hidden = false;
  setupSettings(store, login);
  load();
});
