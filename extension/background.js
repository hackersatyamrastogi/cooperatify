// corporatefilter.ai MV3 service worker — context menus + API bridge

// Shortened prefix keeps context-menu labels under Chrome's ~60-char soft limit.
// "CF" = corporatefilter.

const MENU = [
  { id: 'coop-rewrite-balanced', title: '✨ CF: Rewrite (Balanced)', tone: 'balanced', mode: 'translate' },
  { id: 'coop-rewrite-gentle',   title: '🌸 CF: Rewrite (Gentle)',   tone: 'gentle',   mode: 'translate' },
  { id: 'coop-rewrite-spicy',    title: '🌶️ CF: Rewrite (Spicy)',    tone: 'spicy',    mode: 'translate' },
  { id: 'coop-reply-balanced',   title: '💬 CF: Reply (Balanced)',   tone: 'balanced', mode: 'reply' },
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    for (const m of MENU) {
      chrome.contextMenus.create({ id: m.id, title: m.title, contexts: ['selection', 'editable'] });
    }
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menu = MENU.find((m) => m.id === info.menuItemId);
  if (!menu || !tab?.id) return;
  const { apiBase = 'https://cooperatify.vercel.app', format = detectFormat(tab.url) } = await chrome.storage.sync.get([
    'apiBase', 'format',
  ]);
  const input = info.selectionText || '';
  if (!input) {
    chrome.tabs.sendMessage(tab.id, { type: 'coop:toast', text: 'Select some text first.' });
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: 'coop:toast', text: 'corporatefilter.aiing…' });
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/translate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: menu.mode, tone: menu.tone, format, input }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    chrome.tabs.sendMessage(tab.id, { type: 'coop:result', output: data.output, tone: menu.tone });
  } catch (err) {
    chrome.tabs.sendMessage(tab.id, { type: 'coop:toast', text: `Error: ${err.message}` });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'coop:translate') {
    (async () => {
      const { apiBase = 'https://cooperatify.vercel.app' } = await chrome.storage.sync.get(['apiBase']);
      try {
        const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/translate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(msg.payload),
        });
        const data = await res.json();
        sendResponse({ ok: res.ok, data });
      } catch (err) {
        sendResponse({ ok: false, data: { error: err.message } });
      }
    })();
    return true; // async
  }
});

function detectFormat(url = '') {
  if (url.includes('mail.google.com')) return 'email';
  if (url.includes('slack.com')) return 'slack';
  if (url.includes('linkedin.com')) return 'linkedin';
  return 'slack';
}
