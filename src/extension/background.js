// 右クリックのメニューと、共有メニューに差し込んだ項目（content.js）から、追加の画面を小さなウィンドウで開く

const TARGETS = [
  'https://x.com/*/status/*', 'https://twitter.com/*/status/*', 'https://mobile.twitter.com/*/status/*',
  'https://note.com/*/n/*', 'https://qiita.com/*/items/*',
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'twimark-link', title: 'Twimarkに追加', contexts: ['link'], targetUrlPatterns: TARGETS });
    chrome.contextMenus.create({ id: 'twimark-page', title: 'このページをTwimarkに追加', contexts: ['page'], documentUrlPatterns: TARGETS });
  });
});

function openAdd(url) {
  if (typeof url !== 'string' || !url) return;
  chrome.windows.create({ url: chrome.runtime.getURL(`popup.html?url=${encodeURIComponent(url)}`), type: 'popup', width: 440, height: 620 });
}

chrome.contextMenus.onClicked.addListener((info) => openAdd(info.menuItemId === 'twimark-link' ? info.linkUrl : info.pageUrl));

chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id === chrome.runtime.id && message?.type === 'twimark-add') openAdd(message.url);
});
