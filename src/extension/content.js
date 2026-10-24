// X・note・Qiita の共有メニューと共有の並びに「Twimarkに追加」を足す。押すと background.js が追加の画面を開く。
// 見た目を合わせるため、サイトの既存の項目を複製してラベルとアイコンだけを変える。見つからないときは何も足さない。
// ほかの拡張と取り合わないよう、複製の元はメニューの最初の項目（サイトのもの。拡張は後ろに足す）にし、
// 複製からは data-* の印（サイトの状態やほかの拡張の印）を外して、自分の印 data-twimark-item だけを付ける
(() => {
  const LABEL = 'Twimarkに追加';
  const MARK = 'data-twimark-item';
  // 複製に残す data-*（サイトの見た目に使うもの）
  const KEPT_DATA = ['data-slot'];
  const SVG = 'http://www.w3.org/2000/svg';
  const X_STATUS = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})/;
  const NOTE_PAGE = /^\/([A-Za-z0-9_-]{1,64})\/n\/(n[0-9a-z]{6,24})(?:\/|$)/;
  const QIITA_PAGE = /^\/([A-Za-z0-9_-]{1,64})\/items\/([0-9a-f]{20})(?:\/|$)/;
  const DROPPED = ['id', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-expanded', 'aria-haspopup', 'title', 'target', 'rel', 'data-testid', 'data-highlighted'];

  function add(url) {
    try {
      chrome.runtime.sendMessage({ type: 'twimark-add', url }).catch(() => {});
    } catch {
      // 拡張を入れ直した直後は古いスクリプトから送れない。ページを読み込み直せば直る
      alert('Twimark: ページを再読み込みしてから、もう一度押してください。');
    }
  }

  // しおりの形のアイコン。元のアイコンが svg なら大きさのクラスを引き継ぐ
  function icon(old) {
    const svg = document.createElementNS(SVG, 'svg');
    const rect = old.getBoundingClientRect();
    if (old instanceof SVGElement) for (const a of ['class', 'width', 'height']) if (old.getAttribute(a)) svg.setAttribute(a, old.getAttribute(a));
    if (!svg.getAttribute('width')) {
      svg.setAttribute('width', rect.width ? String(rect.width) : '20');
      svg.setAttribute('height', rect.height ? String(rect.height) : '20');
    }
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', 'M6 2.5h12a1 1 0 0 1 1 1V22l-7-4.6L5 22V3.5a1 1 0 0 1 1-1z');
    svg.append(path);
    return svg;
  }

  function makeItem(template, pageUrl, after) {
    const item = template.cloneNode(true);
    for (const el of [item, ...item.querySelectorAll('*')]) {
      const tooltip = el.hasAttribute('data-tooltip');
      DROPPED.forEach((a) => el.removeAttribute(a));
      for (const { name } of [...el.attributes]) if (name.startsWith('data-') && !KEPT_DATA.includes(name)) el.removeAttribute(name);
      if (tooltip) el.setAttribute('data-tooltip', LABEL);
      if (el.tagName === 'A') el.setAttribute('href', '#');
    }
    // svg か img があればそれを、なければ CSS で絵を出している <i>（note の共有の並び）を差し替える
    const glyph = item.querySelector('svg, img') ?? item.querySelector('i');
    if (glyph) glyph.replaceWith(icon(glyph));
    const leaf = [...item.querySelectorAll('*')].reverse().find((n) => !(n instanceof SVGElement) && n.children.length === 0 && n.textContent.trim());
    if (leaf) leaf.textContent = LABEL;
    item.setAttribute(MARK, '');
    const control = item.matches('a, button, [role="menuitem"]') ? item : item.querySelector('a, button, [role="menuitem"]') ?? item;
    control.setAttribute('aria-label', LABEL);
    control.setAttribute('title', LABEL);
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = pageUrl();
      if (url) add(url);
      after?.();
    }, true);
    return item;
  }

  // メニューを閉じる。X はフォーカスのある要素（共有ボタン）への Escape で閉じる。
  // note は Escape では閉じないので、まだ開いていれば共有ボタンをもう一度押す
  const closeMenu = (menu) => {
    const trigger = document.getElementById(menu.getAttribute('aria-labelledby') ?? '');
    for (const el of new Set([document.activeElement, trigger, menu])) {
      el?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
    }
    setTimeout(() => {
      if (menu.isConnected && trigger?.getAttribute('aria-expanded') === 'true') trigger.click();
    }, 50);
  };

  // 複製の元: メニューの中の、自分が足したものでない最初の項目
  const firstItem = (menu, selector) => [...menu.querySelectorAll(selector)].find((el) => !el.closest(`[${MARK}]`));

  // X: 共有ボタンで開いたメニュー。古い画面のメニューは aria-labelledby を持たないので、直前に押した共有ボタンを使う。
  // 共有ボタンは data-engagement-action="share" か、ラベルに「共有」「Share」を含むメニューのボタン（ログインした画面は「ポストを共有」「Share post」）
  let lastShare = null;
  const isShare = (el) => Boolean(el?.matches?.('button[data-engagement-action="share"]') || (el?.matches?.('[aria-haspopup="menu"]') && /共有|Share/i.test(el.getAttribute('aria-label') ?? '')));
  document.addEventListener('pointerdown', (e) => {
    const button = e.target.closest?.('[aria-haspopup="menu"]');
    if (isShare(button)) lastShare = { el: button, at: Date.now() };
  }, true);

  // 共有ボタンから祖先をたどり、最初に見つかるポストのリンク（そのポストの日時か返信のリンク）
  function tweetUrl(from) {
    for (let el = from; el && el !== document.body; el = el.parentElement) {
      for (const a of el.querySelectorAll('a[href*="/status/"]')) {
        const m = a.hostname === location.hostname && a.pathname.match(X_STATUS);
        if (m) return `https://x.com/${m[1]}/status/${m[2]}`;
      }
    }
    const m = location.pathname.match(X_STATUS);
    return m ? `https://x.com/${m[1]}/status/${m[2]}` : null;
  }

  function scanX() {
    for (const menu of document.querySelectorAll('[role="menu"]')) {
      if (menu.querySelector(`[${MARK}]`)) continue;
      const labelled = document.getElementById(menu.getAttribute('aria-labelledby') ?? '');
      const trigger = labelled ?? (lastShare && Date.now() - lastShare.at < 3000 ? lastShare.el : null);
      if (!isShare(trigger)) continue;
      const template = firstItem(menu, '[role="menuitem"]');
      const url = template && tweetUrl(trigger);
      // 元の項目の並びの末尾に足す（ほかの拡張が足した項目があっても、その後ろ）
      if (url) template.parentElement.append(makeItem(template, () => url, () => closeMenu(menu)));
    }
  }

  const pageUrl = (re, format) => () => {
    const m = location.pathname.match(re);
    return m ? format(m) : null;
  };
  const noteUrl = pageUrl(NOTE_PAGE, (m) => `https://note.com/${m[1]}/n/${m[2]}`);
  const qiitaUrl = pageUrl(QIITA_PAGE, (m) => `https://qiita.com/${m[1]}/items/${m[2]}`);

  // note: 記事の共有メニュー（先頭の「リンクをコピー」のグループの末尾）と、記事下の共有の並び
  function scanNote() {
    if (!noteUrl()) return;
    for (const menu of document.querySelectorAll('[role="menu"][id^="shareMenu"]')) {
      const template = firstItem(menu, 'li');
      if (!template || menu.querySelector(`[${MARK}]`)) continue;
      template.parentElement.append(makeItem(template, noteUrl, () => closeMenu(menu)));
    }
    for (const bar of document.querySelectorAll('.o-shareBooster__share')) {
      const template = bar.querySelector('button');
      if (template && !bar.querySelector(`[${MARK}]`)) bar.append(makeItem(template, noteUrl));
    }
  }

  // Qiita: 「Facebookでシェア」を含む共有の並び（左の縦の並びと記事下）。はてなブックマークの後ろに足す
  function scanQiita() {
    if (!qiitaUrl()) return;
    for (const facebook of document.querySelectorAll('button[aria-label="Facebookでシェア"]')) {
      const wrapper = facebook.parentElement;
      const group = wrapper?.parentElement;
      if (!group || group.querySelector(`[${MARK}]`)) continue;
      const last = [...group.children].find((c) => c.querySelector('a[href*="b.hatena.ne.jp"]')) ?? wrapper;
      last.after(makeItem(last, qiitaUrl));
    }
  }

  const host = location.hostname;
  const scan = host === 'qiita.com' ? scanQiita : host === 'note.com' ? scanNote : scanX;
  // 変化のたびには調べず、まとめて調べる（requestAnimationFrame は描画されていないタブで止まるので使わない）
  let timer = 0;
  new MutationObserver(() => {
    if (!timer) timer = setTimeout(() => { timer = 0; scan(); }, 80);
  }).observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
