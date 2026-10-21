// 追加の画面。ツールバーのボタンでは開いているタブのURL、右クリックと共有メニューからは ?url= のURLを追加する
import { createStore, ops, SITES } from './shared/store.js';
import { parseUrl, fetchMeta } from './meta.js';

const $ = (s) => document.querySelector(s);
const statusEl = $('[data-status]');
const form = $('[data-form]');
const select = $('[data-category]');
const paste = $('[data-paste]');
const submit = $('[data-submit]');
const fromWindow = new URLSearchParams(location.search).get('url');
if (fromWindow) document.documentElement.classList.add('window');

const status = (text, kind = '') => { statusEl.textContent = text; statusEl.dataset.kind = kind; };
const close = () => window.close();
$('[data-close]').addEventListener('click', close);
$('[data-options]').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

async function targetUrl() {
  if (fromWindow) return fromWindow;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url ?? '';
}

async function main() {
  const { settings, lastCategory } = await chrome.storage.local.get(['settings', 'lastCategory']);
  if (!settings?.token) {
    status('');
    $('[data-setup]').hidden = false;
    return;
  }
  const parsed = parseUrl(await targetUrl());
  if (!parsed) {
    status('このページは追加できません。Xのポスト、noteの記事、Qiitaの記事のページで使ってください（Xのタイムラインでは、ポストの日時のリンクを右クリックします）。', 'error');
    return;
  }

  const store = createStore(settings.token);
  const [loaded, meta] = await Promise.allSettled([store.load(), fetchMeta(parsed)]);
  if (loaded.status === 'rejected') {
    status(loaded.reason?.message ?? '読み込めませんでした。', 'error');
    return;
  }
  const { data } = loaded.value;
  const item = meta.status === 'fulfilled' ? meta.value : null;

  $('[data-site]').textContent = SITES[parsed.site];
  $('[data-author]').textContent = item ? `${item.author.name} @${item.author.handle}` : parsed.handle ? `@${parsed.handle}` : '';
  $('[data-title]').textContent = item?.title ?? '';
  $('[data-text]').textContent = item?.text ?? '';
  $('[data-url]').textContent = item?.url ?? parsed.url ?? '';
  select.replaceChildren(...data.categories.map((c) => Object.assign(document.createElement('option'), { value: c, textContent: c })));
  if (data.categories.includes(lastCategory)) select.value = lastCategory;
  paste.hidden = Boolean(item);
  form.hidden = false;

  if (data.bookmarks.some((b) => b.id === parsed.id)) {
    status('このページはもう保存されています。', 'ok');
    submit.disabled = true;
    return;
  }
  status(item ? '' : '本文を取得できませんでした。貼り付けると保存できます。', item ? '' : 'error');
  select.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const category = select.value;
    const pasted = form.elements.namedItem('text').value.trim();
    if (!item && !pasted) { status('本文を貼り付けてください。', 'error'); return; }
    const bookmark = {
      id: parsed.id,
      site: parsed.site,
      url: item?.url ?? parsed.url ?? `https://x.com/i/status/${parsed.key}`,
      author: item?.author ?? { name: parsed.handle ?? '', handle: parsed.handle ?? '' },
      postedAt: item?.postedAt ?? null,
      title: item?.title ?? '',
      text: item?.text ?? pasted,
      photos: item?.photos ?? [],
      videos: item?.videos ?? [],
      category,
      savedAt: new Date().toISOString(),
    };
    submit.disabled = true;
    status('保存中…');
    try {
      await store.update(ops.add(bookmark), `Add ${bookmark.id}`);
      await chrome.storage.local.set({ lastCategory: category });
      status('追加しました。', 'ok');
      if (fromWindow) setTimeout(close, 900);
    } catch (err) {
      status(err?.message ?? '保存できませんでした。', 'error');
      submit.disabled = err?.code === 'duplicate';
    }
  });
}

main().catch(() => status('読み込めませんでした。', 'error'));
