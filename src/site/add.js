// 追加のシート。URL（入力、貼り付け、?add=）を判定し、Worker の /api/meta で下見を取り、カテゴリを選んで保存する。
// 中身はアプリの「追加」と同じ。取得できなければ本文を貼り付けて保存する。前回選んだ組は localStorage に置く（読めなくても動く）
import { describeError, ops, SITES } from './shared/store.js';
import { parseUrl } from './shared/meta.js';
import { toneOf } from './shared/view.js';
import { $, closeSheet, el, openSheet, sheet } from './ui.js';

const LAST_PLACE = 'twimark.lastPlace';
const readLast = () => { try { return JSON.parse(localStorage.getItem(LAST_PLACE) ?? '[]'); } catch { return []; } };
const writeLast = (place) => { try { localStorage.setItem(LAST_PLACE, JSON.stringify(place)); } catch { /* 残せなくても追加はできる */ } };

export function setupAdd({ store, data, save, added }) {
  const dialog = sheet($('dialog[data-add-sheet]'));
  const urlField = $('[data-add-url]');
  const pasted = $('[data-add-pasted]');
  const submit = $('[data-add-submit]');
  const statusEl = $('[data-add-status]');
  let parsed = null;
  // undefined: 取得中、null: 取得できなかった
  let item = null;
  let category = '';
  let sub = null;
  let saving = false;
  let lookupId = 0;

  const subsOf = (c) => data().subcategories[c] ?? [];
  const saved = () => Boolean(parsed) && data().bookmarks.some((b) => b.id === parsed.id);
  const status = (text, kind = '') => { statusEl.textContent = text; statusEl.dataset.kind = kind; };

  function pickDefault() {
    const categories = data().categories;
    if (categories.includes(category)) return;
    const last = readLast();
    const ok = Array.isArray(last) && categories.includes(last[0]);
    category = ok ? last[0] : categories[0] ?? '';
    sub = ok && last[1] && subsOf(last[0]).includes(last[1]) ? last[1] : null;
  }

  function chip(label, on, tone, onClick) {
    const b = el('button', { type: 'button', className: 'chip' });
    b.setAttribute('aria-pressed', String(on));
    if (tone) {
      const dot = el('span', { className: 'dot' });
      dot.dataset.tone = tone;
      b.append(dot);
    }
    b.append(el('span', { textContent: label }));
    b.addEventListener('click', () => { onClick(); render(); });
    return b;
  }

  function render() {
    const categories = data().categories;
    const isSaved = saved();
    $('[data-add-preview]').hidden = !parsed;
    if (parsed) {
      const who = item ? ` · ${item.author.name} @${item.author.handle}` : parsed.handle ? ` · @${parsed.handle}` : '';
      $('[data-add-meta]').textContent = `${SITES[parsed.site]}${who}`;
      $('[data-add-loading]').hidden = item !== undefined;
      $('[data-add-title]').textContent = item?.title ?? '';
      $('[data-add-text]').textContent = item?.text ?? '';
    }
    pasted.hidden = !(parsed && item === null && !isSaved);
    $('[data-add-places]').hidden = !(parsed && !isSaved);
    $('[data-add-categories]').replaceChildren(...categories.map((c) => chip(c, c === category, toneOf(categories, c), () => { category = c; sub = null; })));
    const subs = subsOf(category);
    $('[data-add-subs-part]').hidden = subs.length === 0;
    $('[data-add-subs]').replaceChildren(...(subs.length ? [chip('なし', sub === null, null, () => { sub = null; }), ...subs.map((s) => chip(s, sub === s, null, () => { sub = s; }))] : []));
    submit.disabled = !parsed || isSaved || saving || item === undefined || !category;
    if (isSaved && statusEl.dataset.kind !== 'ok') status('このページはもう保存されています。', 'ok');
  }

  async function lookup(raw) {
    const id = ++lookupId;
    const text = raw.trim();
    urlField.value = text;
    pasted.value = '';
    status('');
    parsed = parseUrl(text);
    if (!parsed) {
      item = null;
      render();
      if (text) status('追加できるのは X のポストと note・Qiita の記事の URL です。', 'error');
      return;
    }
    item = undefined;
    render();
    let next = null;
    try {
      next = (await store.call('/api/meta', { method: 'POST', body: { url: text } })).item ?? null;
    } catch (err) {
      if (id === lookupId) status(describeError(err, '取得できませんでした。'), 'error');
    }
    if (id !== lookupId) return;
    item = next;
    render();
    if (!item && !saved() && !statusEl.textContent) status('本文を取得できませんでした。貼り付けると保存できます。', 'error');
  }

  // 貼り付けや入力で、追加できる URL になったら読みにいく
  urlField.addEventListener('input', () => {
    const next = parseUrl(urlField.value.trim());
    if (next && next.id !== parsed?.id) lookup(urlField.value);
  });
  $('[data-add-form]').addEventListener('submit', (e) => { e.preventDefault(); lookup(urlField.value); });
  $('[data-add-paste]').addEventListener('click', async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) lookup(text);
      else status('クリップボードが空です。X の「リンクをコピー」でコピーしてください。', 'error');
    } catch {
      status('クリップボードを読めませんでした。上の欄に貼り付けてください。', 'error');
      urlField.focus();
    }
  });

  submit.addEventListener('click', async () => {
    if (submit.disabled) return;
    if (!item && !pasted.value.trim()) { status('本文を貼り付けてください。', 'error'); pasted.focus(); return; }
    const bookmark = {
      id: parsed.id,
      site: parsed.site,
      url: item?.url ?? parsed.url ?? `https://x.com/i/status/${parsed.key}`,
      author: item?.author ?? { name: parsed.handle ?? '', handle: parsed.handle ?? '' },
      postedAt: item?.postedAt ?? null,
      title: item?.title ?? '',
      text: item?.text ?? pasted.value.trim(),
      photos: item?.photos ?? [],
      videos: item?.videos ?? [],
      category,
      subcategory: sub,
    };
    saving = true;
    render();
    status('保存中…');
    try {
      await save(ops.add(bookmark));
      writeLast([category, sub]);
      status('追加しました。', 'ok');
      closeSheet(dialog);
      added();
    } catch (err) {
      status(describeError(err, '保存できませんでした。'), 'error');
    } finally {
      saving = false;
      render();
    }
  });

  return {
    open(url = '') {
      lookupId++;
      parsed = null;
      item = null;
      saving = false;
      urlField.value = '';
      pasted.value = '';
      status('');
      pickDefault();
      render();
      openSheet(dialog);
      if (url) lookup(url);
      else urlField.focus();
    },
  };
}
