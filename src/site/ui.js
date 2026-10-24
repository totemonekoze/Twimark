// 画面で共通に使う部品。シート（縦長では下から出て、下へのスワイプで閉じる）、アクションシート、確認と名前の入力。
// どれも <dialog> で作る。取得した文字列は textContent でだけ描く
import { describeError } from './shared/store.js';
import { icon } from './icons.js';

export const $ = (s, root = document) => root.querySelector(s);
export const WIDE = matchMedia('(min-width: 768px) and (orientation: landscape)');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
export const motionOK = () => !reduce.matches;

export function el(tag, props = {}, ...children) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return e;
}

// 動きを付けて開け閉めする。閉じる動きの途中で開き直したら、閉じない
export function openSheet(dialog) {
  dialog.classList.remove('closing');
  dialog.style.transform = '';
  if (!dialog.open) dialog.showModal();
}
// 閉じ終わったら解決する Promise を返す（dialog の close イベントは描画を待つことがあるので使わない）
export function closeSheet(dialog) {
  if (!dialog.open || dialog.classList.contains('closing')) return Promise.resolve();
  if (!motionOK()) { dialog.close(); return Promise.resolve(); }
  dialog.classList.add('closing');
  return new Promise((resolve) => {
    // 動きの終わり（来なければ時間切れ）で閉じる
    const done = (e) => {
      if (e && e.target !== dialog) return;
      dialog.removeEventListener('animationend', done);
      clearTimeout(timer);
      if (dialog.classList.contains('closing')) { dialog.classList.remove('closing'); dialog.close(); }
      resolve();
    };
    const timer = setTimeout(done, 600);
    dialog.addEventListener('animationend', done);
  });
}

// Esc、外側の押下、キャンセルのボタン、（縦長では）上の帯を下へ送ると閉じる
export function sheet(dialog) {
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(dialog); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeSheet(dialog); });
  dialog.querySelectorAll('[data-sheet-cancel]').forEach((b) => b.addEventListener('click', () => closeSheet(dialog)));
  const bar = $('.sheet-bar', dialog);
  bar?.addEventListener('pointerdown', (e) => {
    if (WIDE.matches || e.button !== 0 || e.target.closest('button, a, input')) return;
    const y0 = e.clientY;
    let dy = 0;
    dialog.classList.add('dragging');
    const move = (ev) => { dy = Math.max(0, ev.clientY - y0); dialog.style.transform = `translateY(${dy}px)`; };
    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      dialog.classList.remove('dragging');
      if (dy < 90) { dialog.style.transform = ''; return; }
      dialog.style.transform = 'translateY(100%)';
      const close = () => { dialog.close(); dialog.style.transform = ''; };
      if (motionOK()) dialog.addEventListener('transitionend', close, { once: true });
      else close();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  });
  return dialog;
}

// アクションシート。actions は [{ label, run, destructive }]。run は押したその場で呼ぶ（新しいタブを開けるように）
const actionDialog = $('dialog[data-action]');
actionDialog.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(actionDialog); });
actionDialog.addEventListener('click', (e) => { if (e.target === actionDialog) closeSheet(actionDialog); });
export function actionSheet({ title = '', message = '', actions }) {
  const group = el('div', { className: 'action-group' });
  if (title || message) {
    group.append(el('div', { className: 'action-head' },
      title && el('p', { className: 'action-title', textContent: title }),
      message && el('p', { className: 'action-message', textContent: message })));
  }
  for (const a of actions) {
    // checked のものは右にチェックを付ける（フィルターの今の項目）
    const b = el('button', { type: 'button', className: `action-btn${a.destructive ? ' danger' : ''}${a.checked ? ' checked' : ''}`, textContent: a.label });
    if (a.checked) { b.append(icon('check')); b.setAttribute('aria-current', 'true'); }
    b.addEventListener('click', () => { closeSheet(actionDialog); a.run(); });
    group.append(b);
  }
  const cancel = el('button', { type: 'button', className: 'action-btn cancel', textContent: 'キャンセル' });
  cancel.addEventListener('click', () => closeSheet(actionDialog));
  actionDialog.replaceChildren(group, el('div', { className: 'action-group' }, cancel));
  openSheet(actionDialog);
  cancel.focus();
}

// 押した場所に出す小さなメニュー（右クリック）。actions は actionSheet と同じ形。
// popover で一番上に重ね、外を押す・Escape・送りで閉じる。↑↓ で選び Enter で押す。
// 閉じるのは自分で行う（popover="auto" の外押しの判定は、Mac で右ボタンを離したときに開いたばかりのメニューを閉じてしまう）
const contextDialog = el('div', { className: 'context-menu', popover: 'manual', role: 'menu' });
document.body.append(contextDialog);
const contextOpen = () => contextDialog.matches(':popover-open');
const closeContext = () => { if (contextOpen()) contextDialog.hidePopover(); };
addEventListener('scroll', closeContext, { capture: true, passive: true });
addEventListener('pointerdown', (e) => { if (!contextDialog.contains(e.target)) closeContext(); }, true);
addEventListener('blur', closeContext);
contextDialog.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeContext(); return; }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const items = [...contextDialog.querySelectorAll('button')];
  const i = items.indexOf(document.activeElement);
  items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
});
export function contextMenu(x, y, actions) {
  contextDialog.replaceChildren(...actions.map((a) => {
    const b = el('button', { type: 'button', className: `context-item${a.destructive ? ' danger' : ''}`, textContent: a.label });
    b.setAttribute('role', 'menuitem');
    b.addEventListener('click', () => { closeContext(); a.run(); });
    return b;
  }));
  closeContext();
  contextDialog.showPopover();
  // 画面の端からはみ出さないよう、右と下に余りがなければ左・上へ寄せる
  const r = contextDialog.getBoundingClientRect();
  contextDialog.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
  contextDialog.style.top = `${Math.max(8, y + r.height + 8 > innerHeight ? y - r.height : y)}px`;
  contextDialog.querySelector('button')?.focus();
}

// 確認と名前の入力。run(値) が失敗したら、その文を出して開いたままにする。input が false なら確認だけ
const alertDialog = $('dialog[data-alert]');
const alertInput = $('[data-alert-input]');
const alertError = $('[data-alert-error]');
let alertRun = null;
alertDialog.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(alertDialog); });
$('[data-alert-cancel]').addEventListener('click', () => closeSheet(alertDialog));
alertDialog.querySelector('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!alertRun) return;
  const run = alertRun;
  const ok = $('[data-alert-ok]');
  ok.disabled = true;
  alertError.textContent = '';
  try {
    await run(alertInput.value.trim());
    // run の中で次の知らせ（tell）を出したときは、それを閉じない
    if (alertRun === run) closeSheet(alertDialog);
  } catch (err) {
    alertError.textContent = describeError(err, 'できませんでした。');
  } finally {
    ok.disabled = false;
  }
});
export function ask({ title, message = '', input = true, value = '', placeholder = '', maxLength = 40, ok = 'OK', destructive = false, cancel = true, run = async () => {} }) {
  $('[data-alert-title]').textContent = title;
  $('[data-alert-message]').textContent = message;
  $('[data-alert-message]').hidden = !message;
  Object.assign(alertInput, { hidden: !input, value, placeholder, maxLength, required: input });
  alertError.textContent = '';
  const okButton = $('[data-alert-ok]');
  okButton.textContent = ok;
  okButton.classList.toggle('danger', destructive);
  $('[data-alert-cancel]').hidden = !cancel;
  alertRun = run;
  openSheet(alertDialog);
  (input ? alertInput : okButton).focus();
}
export const tell = (title, message = '') => ask({ title, message, input: false, cancel: false });
