// Twimark の一覧の画面。データはこのリポジトリの data/bookmarks.json（shared/store.js）。
// トークンがなければ読むだけで、編集の操作を隠す（<body> の read-only）。
// 絞り込み（カテゴリ、未分類、サイト）と検索語は URL のクエリに残す。書き込みは1件ずつ順番に送り、成功したら返ってきた最新のデータで描き直す
import { createStore, ops, SITES } from './shared/store.js';
import { toneOf as toneIn, textMatches, searchTextOf } from './shared/view.js';

const SETTINGS_KEY = 'twimark:settings';

const $ = (s, root = document) => root.querySelector(s);
const list = $('.cards');
const template = $('#card-template');
const nav = $('[data-side]');
const sideList = $('[data-side-list]');
const sideMsg = $('[data-side-msg]');
const sideWrap = $('.side-wrap');
const searchInput = $('[data-search]');
const state = (name) => document.querySelectorAll('[data-state]').forEach((el) => { el.hidden = el.dataset.state !== name; });

// 設定はトークンだけ（前の形 { owner, repo, token } からも token を読む）
function readToken() {
  try {
    const token = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')?.token;
    return typeof token === 'string' ? token : '';
  } catch {
    return '';
  }
}
let token = readToken();
let store = createStore(token);
let data = { categories: [], bookmarks: [] };
let loaded = false;
const expanded = new Set();

// 書き込みと読み込みは1件ずつ順番に。失敗しても後ろは続ける
let queue = Promise.resolve();
function enqueue(task) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}
const refresh = async () => { data = (await store.load()).data; loaded = true; };
const save = (mutate, message) => enqueue(() => store.update(mutate, message)).then((next) => { data = next; });
// 失敗したあとは GitHub の今の内容で描き直す
const resync = () => enqueue(refresh).then(() => renderAll(false), () => {});

// 選択中の絞り込み。?category=<名前> か、一覧にないカテゴリの ?uncategorized。?site= と ?q= は別に保つ
function selection() {
  const p = new URLSearchParams(location.search);
  return { uncategorized: p.has('uncategorized'), category: p.get('category') ?? '', site: p.get('site') ?? '' };
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
const inCategory = (b) => {
  const s = selection();
  if (s.uncategorized) return !data.categories.includes(b.category);
  return !s.category || b.category === s.category;
};
const matches = (b) => inCategory(b) && (!selection().site || b.site === selection().site) && textMatches(searchTextOf(b), searchInput.value);
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '投稿日不明');
const https = (url) => (typeof url === 'string' && /^https:\/\//.test(url) ? url : null);

// サイドメニュー
function sideLink(label, change, count, tone) {
  const url = new URL(location.href);
  url.searchParams.delete('category');
  url.searchParams.delete('uncategorized');
  if (change.category) url.searchParams.set('category', change.category);
  if (change.uncategorized) url.searchParams.set('uncategorized', '');
  const a = Object.assign(document.createElement('a'), { href: `${url.pathname}${url.search}` });
  a.dataset.change = JSON.stringify(change);
  a.append(Object.assign(document.createElement('span'), { className: 'label', textContent: label }));
  const span = Object.assign(document.createElement('span'), { className: 'count', textContent: String(count) });
  if (tone) span.dataset.tone = tone;
  a.append(span);
  const s = selection();
  const current = change.uncategorized ? s.uncategorized : !s.uncategorized && (change.category ?? '') === s.category;
  if (current) {
    a.setAttribute('aria-current', 'page');
    $('[data-side-current]').textContent = label;
  }
  return a;
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
    const move = Object.assign(document.createElement('button'), { type: 'button', className: 'side-move', textContent: '⠿', title: `${c}を移動（ドラッグ、または ↑↓ キー）` });
    move.dataset.move = c;
    move.setAttribute('aria-label', `${c}を移動`);
    move.addEventListener('pointerdown', (e) => startDrag(e, li));
    move.addEventListener('keydown', (e) => moveByKey(e, c));
    const del = Object.assign(document.createElement('button'), { type: 'button', className: 'side-del', textContent: '×', title: `${c}を削除` });
    del.setAttribute('aria-label', `${c}を削除`);
    del.addEventListener('click', () => askDeleteCategory(c));
    li.append(move, sideLink(c, { category: c }, data.bookmarks.filter((b) => b.category === c).length, toneOf(c)), del);
    items.push(li);
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
  setParams({ category: change.category ?? null, uncategorized: change.uncategorized ? '' : null });
  if (narrow.matches) sideWrap.open = false;
  renderSide();
  apply();
});

// カテゴリの並べ替え。画面を先に並べ替えてから保存を送り、失敗したら GitHub の今の並びに戻す
function saveOrder(names, focusName) {
  sideMsg.textContent = '';
  data = { ...data, categories: names };
  renderSide();
  paintAll();
  if (focusName) sideList.querySelector(`[data-move="${CSS.escape(focusName)}"]`)?.focus();
  save(ops.sortCategories(names), 'Sort categories').catch((err) => {
    sideMsg.textContent = `並べ替えを保存できませんでした。${err?.message ?? ''}`;
    resync();
  });
}
function moveByKey(e, name) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  const i = data.categories.indexOf(name);
  const j = e.key === 'ArrowUp' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= data.categories.length) return;
  const names = [...data.categories];
  [names[i], names[j]] = [names[j], names[i]];
  saveOrder(names, name);
}
function startDrag(e, li) {
  if (e.button !== 0) return;
  e.preventDefault();
  // 移動と離す操作は document で受ける。行を並べ替えるとつまみが DOM から一度外れ、ポインターキャプチャが切れるため
  const pointer = e.pointerId;
  li.classList.add('dragging');
  const before = [...data.categories];
  const rows = () => [...sideList.querySelectorAll(':scope > li.side-row')];
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
    const names = rows().map((r) => r.dataset.category);
    if (names.join('\n') !== before.join('\n')) saveOrder(names, li.dataset.category);
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

// カテゴリの札と、変更の <select>。一覧にないカテゴリは「（未分類）」として選択肢に残す
function paintCategory(li, category) {
  const badge = $('[data-f="category"]', li);
  badge.textContent = category;
  badge.dataset.tone = toneOf(category);
  const select = $('[data-f="category-select"]', li);
  const names = data.categories.includes(category) ? data.categories : [category, ...data.categories];
  select.replaceChildren(...names.map((c) => Object.assign(document.createElement('option'), { value: c, textContent: data.categories.includes(c) ? c : `${c}（未分類）` })));
  select.value = category;
}
const byId = (id) => data.bookmarks.find((b) => b.id === id);
const paintAll = () => [...list.children].forEach((li) => { const b = byId(li.dataset.id); if (b) paintCategory(li, b.category); });

function renderCard(b) {
  const li = template.content.firstElementChild.cloneNode(true);
  li.dataset.id = b.id;
  const f = (name) => $(`[data-f="${name}"]`, li);
  paintCategory(li, b.category);
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
    const next = select.value;
    select.disabled = true;
    saveMsg.dataset.kind = '';
    saveMsg.textContent = '保存中…';
    save(ops.setCategory(b.id, next), `Change category of ${b.id}`).then(() => {
      renderAll(false);
      const msg = list.querySelector(`[data-id="${CSS.escape(b.id)}"] [data-f="save"]`);
      if (msg) msg.textContent = '保存しました';
    }, (err) => {
      paintCategory(li, b.category);
      select.disabled = false;
      saveMsg.dataset.kind = 'error';
      saveMsg.textContent = err?.message ?? '保存できませんでした';
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
  document.body.classList.toggle('read-only', !token);
  state('loading');
  try {
    await enqueue(refresh);
    renderAll(true);
  } catch (err) {
    $('[data-state="error"]').textContent = `読み込めませんでした。${err?.message ?? ''}`;
    state('error');
  }
}

// 設定
const settingsDialog = $('dialog.settings');
const settingsForm = $('[data-settings-form]');
const tokenField = settingsForm.elements.namedItem('token');
const useToken = (next) => {
  token = next;
  store = createStore(token);
  settingsDialog.close();
  load();
};
$('[data-open-settings]').addEventListener('click', () => {
  tokenField.value = token;
  settingsDialog.showModal();
});
$('[data-settings-cancel]').addEventListener('click', () => settingsDialog.close());
settingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const next = tokenField.value.trim();
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ token: next })); } catch { /* 保存できなくてもこの表示の間は使う */ }
  useToken(next);
});
$('[data-settings-clear]').addEventListener('click', () => {
  try { localStorage.removeItem(SETTINGS_KEY); } catch { /* 消せないときも画面からは外す */ }
  useToken('');
});

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
    await save(ops.remove(id), `Delete ${id}`);
    expanded.delete(id);
    renderAll(false);
    confirmDialog.close();
  } catch (err) {
    deleteError.textContent = err?.message ?? '削除できませんでした。';
  }
});

// カテゴリの追加
const categoryDialog = $('dialog.category-add');
const categoryForm = $('[data-category-form]');
const categoryError = $('[data-category-error]');
const categorySubmit = $('[data-category-submit]');
$('[data-open-category]').addEventListener('click', () => {
  categoryForm.reset();
  categoryError.textContent = '';
  categoryDialog.showModal();
});
$('[data-category-cancel]').addEventListener('click', () => categoryDialog.close());
categoryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = categoryForm.elements.namedItem('name').value.trim();
  categoryError.textContent = '';
  if (!name) { categoryError.textContent = '名前を入れてください。'; return; }
  if (data.categories.includes(name)) { categoryError.textContent = 'そのカテゴリはもうあります。'; return; }
  categorySubmit.disabled = true;
  try {
    await save(ops.addCategory(name), `Add category ${name}`);
    renderAll(false);
    categoryDialog.close();
  } catch (err) {
    categoryError.textContent = err?.message ?? '追加できませんでした。';
  } finally {
    categorySubmit.disabled = false;
  }
});

// カテゴリの削除。そのカテゴリのブックマークは消さず「未分類」に出る
const categoryDeleteDialog = $('dialog.category-delete');
const categoryDeleteError = $('[data-category-delete-error]');
let pendingCategory = null;
function askDeleteCategory(name) {
  pendingCategory = name;
  const affected = data.bookmarks.filter((b) => b.category === name).length;
  $('[data-category-delete-target]').textContent = `「${name}」を削除します。${affected > 0 ? `このカテゴリのブックマーク ${affected}件は消えず、「未分類」に表示されます。` : ''}`;
  categoryDeleteError.textContent = '';
  categoryDeleteDialog.showModal();
}
$('[data-confirm-category-delete]').addEventListener('click', async () => {
  if (pendingCategory === null) return;
  const name = pendingCategory;
  try {
    await save(ops.removeCategory(name), `Delete category ${name}`);
    if (selection().category === name) setParams({ category: null });
    renderAll(false);
    categoryDeleteDialog.close();
  } catch (err) {
    categoryDeleteError.textContent = err?.message ?? '削除できませんでした。';
  }
});

load();
