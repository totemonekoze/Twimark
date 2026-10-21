// 追加の画面。ツールバーのボタンでは開いているタブのURL、右クリックと共有メニューからは ?url= のURLを追加する。
// 保存先は Twimark の Worker（PUBLIC_URL）で、一覧の画面で発行した端末のトークンで認証する
import { createStore, describeError, ops, SITES, PUBLIC_URL } from './shared/store.js';
import { parseUrl, fetchMeta } from './shared/meta.js';

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
  const { settings, lastPlace } = await chrome.storage.local.get(['settings', 'lastPlace']);
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

  const store = createStore({ base: PUBLIC_URL, token: settings.token });
  const [loaded, meta] = await Promise.allSettled([store.load(), fetchMeta(parsed)]);
  if (loaded.status === 'rejected') {
    status(describeError(loaded.reason, '読み込めませんでした。'), 'error');
    return;
  }
  const { data } = loaded.value;
  const item = meta.status === 'fulfilled' ? meta.value : null;

  $('[data-site]').textContent = SITES[parsed.site];
  $('[data-author]').textContent = item ? `${item.author.name} @${item.author.handle}` : parsed.handle ? `@${parsed.handle}` : '';
  $('[data-title]').textContent = item?.title ?? '';
  $('[data-text]').textContent = item?.text ?? '';
  $('[data-url]').textContent = item?.url ?? parsed.url ?? '';
  // カテゴリごとの <optgroup> に、カテゴリそのものとサブカテゴリを並べる。値は [カテゴリ, サブカテゴリ] の JSON
  const option = (category, sub, label) => Object.assign(document.createElement('option'), { value: JSON.stringify([category, sub]), textContent: label });
  select.replaceChildren(...data.categories.map((c) => {
    const g = Object.assign(document.createElement('optgroup'), { label: c });
    g.append(option(c, null, c), ...(data.subcategories[c] ?? []).map((s) => option(c, s, `${c} › ${s}`)));
    return g;
  }));
  if ([...select.options].some((o) => o.value === lastPlace)) select.value = lastPlace;
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
    const [category, subcategory] = JSON.parse(select.value);
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
      subcategory,
    };
    submit.disabled = true;
    status('保存中…');
    try {
      await store.update(ops.add(bookmark));
      await chrome.storage.local.set({ lastPlace: select.value });
      status('追加しました。', 'ok');
      if (fromWindow) setTimeout(close, 900);
    } catch (err) {
      status(describeError(err, '保存できませんでした。'), 'error');
      submit.disabled = err?.code === 'duplicate';
    }
  });
}

main().catch(() => status('読み込めませんでした。', 'error'));
