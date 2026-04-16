// corporatefilter.ai MV3 service worker
// Grouped context menus + programmatic injection + keyboard shortcut + API bridge

const DEFAULT_API = 'https://corporatefilter.ai';

const PARENT_ID = 'cf-parent';
const MENU = [
  { id: 'cf-rewrite-balanced', title: 'Rewrite (Balanced)',  tone: 'balanced', mode: 'translate' },
  { id: 'cf-rewrite-gentle',   title: 'Rewrite (Gentle)',    tone: 'gentle',   mode: 'translate' },
  { id: 'cf-rewrite-spicy',    title: 'Rewrite (Spicy)',     tone: 'spicy',    mode: 'translate' },
  { id: 'cf-reply-balanced',   title: 'Reply (Balanced)',    tone: 'balanced', mode: 'reply' },
  { id: 'cf-reply-gentle',     title: 'Reply (Gentle)',      tone: 'gentle',   mode: 'reply' },
  { id: 'cf-reply-spicy',      title: 'Reply (Spicy)',       tone: 'spicy',    mode: 'reply' },
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: PARENT_ID,
      title: 'corporatefilter.ai',
      contexts: ['selection', 'editable'],
    });
    for (const m of MENU) {
      chrome.contextMenus.create({
        id: m.id, parentId: PARENT_ID,
        title: m.title, contexts: ['selection', 'editable'],
      });
    }
  });
});

// Ensure content script + CSS are injected into the tab before messaging it
async function ensureInjected(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__cf_injected || false,
    });
    if (result) return;
  } catch { /* tab may not allow scripting, proceed anyway */ }
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  } catch { /* silently fail on restricted pages */ }
}

// Capture selection rect + text from the tab (before API call so position is preserved)
async function captureSelection(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const sel = window.getSelection();
        if (!sel || !sel.toString().trim()) return null;
        const range = sel.getRangeAt(0);
        const r = range.getBoundingClientRect();
        return {
          text: sel.toString(),
          rect: { top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height },
        };
      },
    });
    return result;
  } catch { return null; }
}

// Expanded format detection
function detectFormat(url = '') {
  if (url.includes('mail.google.com')) return 'email';
  if (url.includes('outlook.office.com') || url.includes('outlook.live.com')) return 'email';
  if (url.includes('slack.com')) return 'slack';
  if (url.includes('linkedin.com')) return 'linkedin';
  if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) return 'teams';
  if (url.includes('discord.com') || url.includes('discordapp.com')) return 'discord';
  if (url.includes('web.whatsapp.com')) return 'whatsapp';
  if (url.includes('web.telegram.org') || url.includes('telegram.org')) return 'telegram';
  if (url.includes('chat.google.com')) return 'chat';
  if (url.includes('messenger.com')) return 'chat';
  if (url.includes('signal.')) return 'chat';
  return 'message';
}

async function getApiBase() {
  const { apiBase = DEFAULT_API } = await chrome.storage.sync.get(['apiBase']);
  return apiBase.replace(/\/$/, '');
}

async function callTranslate({ mode, tone, format, input }) {
  const base = await getApiBase();
  const res = await fetch(`${base}/api/translate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode, tone, format, input }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data.output;
}

async function handleRewrite(tab, mode, tone) {
  if (!tab?.id) return;
  await ensureInjected(tab.id);

  const sel = await captureSelection(tab.id);
  const input = sel?.text?.trim();
  if (!input) {
    chrome.tabs.sendMessage(tab.id, { type: 'cf:toast', text: 'Select some text first.' });
    return;
  }

  const format = detectFormat(tab.url);
  chrome.tabs.sendMessage(tab.id, { type: 'cf:thinking', selectionRect: sel?.rect, originalText: input });

  try {
    const output = await callTranslate({ mode, tone, format, input });
    chrome.tabs.sendMessage(tab.id, {
      type: 'cf:result',
      output, tone, mode, format,
      selectionRect: sel?.rect,
      originalText: input,
    });
  } catch (err) {
    chrome.tabs.sendMessage(tab.id, { type: 'cf:toast', text: `Error: ${err.message}` });
  }
}

// Context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const m = MENU.find((x) => x.id === info.menuItemId);
  if (!m) return;
  await handleRewrite(tab, m.mode, m.tone);
});

// Keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'trigger-rewrite') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) await handleRewrite(tab, 'translate', 'balanced');
});

// Message bridge (popup + content script requests)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'cf:translate') {
    (async () => {
      try {
        const output = await callTranslate(msg.payload);
        sendResponse({ ok: true, data: { output } });
      } catch (err) {
        sendResponse({ ok: false, data: { error: err.message } });
      }
    })();
    return true;
  }
  if (msg?.type === 'cf:retone') {
    (async () => {
      try {
        const output = await callTranslate(msg.payload);
        sendResponse({ ok: true, output });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
  if (msg?.type === 'cf:detectFormat') {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      sendResponse({ format: detectFormat(tab?.url) });
    })();
    return true;
  }
});
