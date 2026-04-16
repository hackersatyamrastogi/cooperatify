// corporatefilter.ai content script
// Shadow DOM inline panel + FAB + undo stack + toast

window.__cf_injected = true;

// ===================== UNDO STACK =====================
const undoStack = [];
const MAX_UNDO = 10;
let cfJustReplaced = false;
let cfUndoTimer = null;

function pushUndo(el, original, replaced) {
  undoStack.push({ el, original, replaced, ts: Date.now() });
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  cfJustReplaced = true;
  clearTimeout(cfUndoTimer);
  cfUndoTimer = setTimeout(() => { cfJustReplaced = false; }, 5000);
}

function popUndo() {
  const entry = undoStack.pop();
  if (!entry) return false;
  cfJustReplaced = false;
  try {
    const el = entry.el;
    if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text')) {
      el.value = el.value.replace(entry.replaced, entry.original);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    if (el.isContentEditable) {
      document.execCommand('undo');
      return true;
    }
  } catch {}
  return false;
}

document.addEventListener('keydown', (e) => {
  if (cfJustReplaced && (e.ctrlKey || e.metaKey) && e.key === 'z') {
    if (popUndo()) { e.preventDefault(); showToast('Undone'); }
  }
});

// ===================== REPLACE IN EDITABLE =====================
function replaceSelectionInEditable(text) {
  const ae = document.activeElement;
  if (!ae) return false;
  let original = '';
  try {
    if (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && ae.type === 'text')) {
      const start = ae.selectionStart ?? 0;
      const end = ae.selectionEnd ?? 0;
      original = ae.value.substring(start, end);
      ae.setRangeText(text, start, end, 'end');
      ae.dispatchEvent(new Event('input', { bubbles: true }));
      pushUndo(ae, original, text);
      return true;
    }
    if (ae.isContentEditable || document.queryCommandSupported?.('insertText')) {
      const sel = window.getSelection();
      original = sel?.toString() || '';
      document.execCommand('insertText', false, text);
      pushUndo(ae, original, text);
      return true;
    }
  } catch {}
  return false;
}

// ===================== SHADOW DOM HOST =====================
let shadowHost = null;
let shadow = null;

function getShadow() {
  if (shadow) return shadow;
  shadowHost = document.createElement('div');
  shadowHost.id = 'cf-shadow-host';
  shadowHost.style.cssText = 'all:initial; position:fixed; z-index:2147483647; top:0; left:0; width:0; height:0; pointer-events:none;';
  document.documentElement.appendChild(shadowHost);
  shadow = shadowHost.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = SHADOW_CSS;
  shadow.appendChild(style);
  return shadow;
}

const SHADOW_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:host{font-family:'Inter',system-ui,sans-serif;font-size:13.5px;color:#fff;line-height:1.5}

.cf-panel{
  position:fixed;pointer-events:auto;width:380px;
  background:#0a0a0a;border:1px solid #2a2a2a;border-radius:14px;
  box-shadow:0 20px 50px rgba(0,0,0,0.6),0 0 0 1px rgba(255,204,0,0.06);
  overflow:hidden;animation:cf-in .15s ease;
}
@keyframes cf-in{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}
.cf-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #2a2a2a}
.cf-brand{display:inline-flex;align-items:center;gap:7px;font-family:'Space Grotesk',system-ui;font-weight:700;font-size:12.5px;color:#fff}
.cf-dot{width:12px;height:12px;border-radius:50%;background:#ffcc00;animation:cf-blink 1.5s ease-in-out infinite}
@keyframes cf-blink{0%,100%{opacity:.95}50%{opacity:.35}}
.cf-brand .ai{color:#ffcc00}
.cf-close{background:none;border:1px solid #2a2a2a;border-radius:6px;width:24px;height:24px;color:rgba(255,255,255,0.5);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center}
.cf-close:hover{border-color:#ffcc00;color:#ffcc00}

.cf-tones{display:flex;gap:4px;padding:10px 12px;border-bottom:1px solid #2a2a2a}
.cf-tone{flex:1;padding:6px;border-radius:7px;border:1px solid #2a2a2a;background:transparent;color:rgba(255,255,255,0.6);
  font-family:'Space Grotesk',system-ui;font-size:11.5px;font-weight:600;cursor:pointer;text-align:center;transition:all .12s}
.cf-tone:hover{color:#fff;border-color:#444}
.cf-tone.on{background:#ffcc00;color:#000;border-color:#ffcc00}
.cf-tone.loading{opacity:.5;cursor:wait}

.cf-body{padding:12px;max-height:260px;overflow-y:auto;font-family:'Space Grotesk',system-ui;font-size:14px;font-weight:500;line-height:1.65;white-space:pre-wrap;word-wrap:break-word;color:#fff}
.cf-body.thinking{color:rgba(255,255,255,0.4);font-style:italic}

.cf-actions{display:flex;gap:6px;padding:10px 12px;border-top:1px solid #2a2a2a;justify-content:flex-end}
.cf-btn{padding:6px 12px;border-radius:8px;font-family:'Space Mono',monospace;font-size:10px;font-weight:700;
  letter-spacing:1.2px;text-transform:uppercase;cursor:pointer;border:1px solid #2a2a2a;background:transparent;color:rgba(255,255,255,0.7);transition:all .12s}
.cf-btn:hover{border-color:#ffcc00;color:#ffcc00}
.cf-btn.primary{background:#ffcc00;color:#000;border-color:#ffcc00}
.cf-btn.primary:hover{filter:brightness(1.08)}

/* FAB */
.cf-fab{
  position:fixed;pointer-events:auto;width:32px;height:32px;border-radius:50%;
  background:#ffcc00;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;
  box-shadow:0 4px 14px rgba(255,204,0,0.4);animation:cf-fab-in .2s ease;transition:transform .1s;
}
.cf-fab:hover{transform:scale(1.12)}
@keyframes cf-fab-in{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
.cf-fab svg{width:16px;height:16px}

.cf-fab-menu{
  position:fixed;pointer-events:auto;
  background:#0a0a0a;border:1px solid #2a2a2a;border-radius:10px;padding:4px;min-width:180px;
  box-shadow:0 12px 32px rgba(0,0,0,0.5);animation:cf-in .12s ease;
}
.cf-fab-item{display:block;width:100%;padding:8px 12px;border-radius:7px;border:none;background:transparent;
  color:rgba(255,255,255,0.8);font-family:'Space Grotesk',system-ui;font-size:12.5px;font-weight:500;text-align:left;cursor:pointer}
.cf-fab-item:hover{background:#141414;color:#fff}
.cf-fab-item .emoji{margin-right:8px}
.cf-fab-badge{font-family:'Space Mono',monospace;font-size:9px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:1.4px;padding:6px 12px 4px;display:block}

/* Toast */
.cf-toast{
  position:fixed;pointer-events:auto;left:50%;bottom:24px;transform:translateX(-50%) translateY(8px);
  background:#141414;color:#fff;border:1px solid #2a2a2a;padding:8px 14px;border-radius:10px;
  font-family:'Space Grotesk',system-ui;font-size:12.5px;font-weight:500;
  box-shadow:0 8px 24px rgba(0,0,0,0.4);opacity:0;transition:opacity .2s,transform .2s;white-space:nowrap;
}
.cf-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.cf-toast .undo-link{color:#ffcc00;cursor:pointer;margin-left:8px;font-weight:700;text-decoration:underline}
`;

// ===================== TOAST =====================
let toastEl = null;
let toastTimer = null;

function showToast(text, undoable = false) {
  const root = getShadow();
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'cf-toast';
    root.appendChild(toastEl);
  }
  if (undoable) {
    toastEl.innerHTML = `${esc(text)} <span class="undo-link">Undo</span>`;
    toastEl.querySelector('.undo-link').onclick = () => {
      if (popUndo()) showToast('Undone');
    };
  } else {
    toastEl.textContent = text;
  }
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), undoable ? 5000 : 2200);
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

// ===================== INLINE PANEL =====================
let panelEl = null;
let panelState = {};
const toneCache = new Map();

function showPanel({ output, tone, mode, format, selectionRect, originalText }) {
  const root = getShadow();
  removePanel();
  toneCache.clear();
  toneCache.set(tone, output);
  panelState = { mode, format, originalText, currentTone: tone };

  panelEl = document.createElement('div');
  panelEl.className = 'cf-panel';
  panelEl.innerHTML = `
    <div class="cf-head">
      <span class="cf-brand"><span class="cf-dot"></span> corporatefilter<span class="ai">.ai</span></span>
      <button class="cf-close" title="Close">x</button>
    </div>
    <div class="cf-tones">
      <button class="cf-tone" data-t="gentle">Gentle</button>
      <button class="cf-tone" data-t="balanced">Balanced</button>
      <button class="cf-tone" data-t="spicy">Spicy</button>
    </div>
    <div class="cf-body"></div>
    <div class="cf-actions">
      <button class="cf-btn" data-a="undo">Undo</button>
      <button class="cf-btn" data-a="copy">Copy</button>
      <button class="cf-btn primary" data-a="replace">Replace</button>
    </div>`;

  panelEl.querySelector('.cf-body').textContent = output;
  highlightTone(panelEl, tone);

  // Position near selection
  positionPanel(panelEl, selectionRect);
  root.appendChild(panelEl);

  // Event handlers
  panelEl.querySelector('.cf-close').onclick = removePanel;
  panelEl.querySelectorAll('.cf-tone').forEach((btn) => {
    btn.onclick = () => retone(btn.dataset.t);
  });
  panelEl.querySelector('[data-a="copy"]').onclick = async () => {
    const text = panelEl.querySelector('.cf-body').textContent;
    await navigator.clipboard.writeText(text);
    showToast('Copied');
  };
  panelEl.querySelector('[data-a="replace"]').onclick = () => {
    const text = panelEl.querySelector('.cf-body').textContent;
    if (replaceSelectionInEditable(text)) {
      removePanel();
      showToast(`Replaced in ${panelState.currentTone} tone`, true);
    } else {
      showToast('Focus an editor first');
    }
  };
  panelEl.querySelector('[data-a="undo"]').onclick = () => {
    if (popUndo()) { removePanel(); showToast('Undone'); }
  };
}

function positionPanel(el, rect) {
  if (!rect) {
    el.style.top = '80px'; el.style.right = '24px';
    return;
  }
  const pad = 12;
  let top = rect.bottom + 8;
  let left = rect.left + rect.width / 2 - 190;
  if (top + 340 > window.innerHeight) top = rect.top - 340 - 8;
  if (top < pad) top = pad;
  if (left < pad) left = pad;
  if (left + 380 > window.innerWidth - pad) left = window.innerWidth - 380 - pad;
  el.style.top = top + 'px';
  el.style.left = left + 'px';
}

function highlightTone(el, tone) {
  el.querySelectorAll('.cf-tone').forEach((b) => {
    b.classList.toggle('on', b.dataset.t === tone);
    b.classList.remove('loading');
  });
}

async function retone(tone) {
  if (!panelEl || !panelState.originalText) return;
  panelState.currentTone = tone;
  highlightTone(panelEl, tone);

  if (toneCache.has(tone)) {
    panelEl.querySelector('.cf-body').textContent = toneCache.get(tone);
    return;
  }

  const body = panelEl.querySelector('.cf-body');
  const btn = panelEl.querySelector(`[data-t="${tone}"]`);
  body.textContent = 'Rewriting...';
  body.classList.add('thinking');
  if (btn) btn.classList.add('loading');

  chrome.runtime.sendMessage({
    type: 'cf:retone',
    payload: { mode: panelState.mode, tone, format: panelState.format, input: panelState.originalText },
  }, (resp) => {
    body.classList.remove('thinking');
    if (btn) btn.classList.remove('loading');
    if (resp?.ok) {
      toneCache.set(tone, resp.output);
      body.textContent = resp.output;
    } else {
      body.textContent = `Error: ${resp?.error || 'unknown'}`;
    }
  });
}

function removePanel() {
  if (panelEl) { panelEl.remove(); panelEl = null; }
}

function showThinking(selectionRect) {
  const root = getShadow();
  removePanel();
  removeFAB();

  panelEl = document.createElement('div');
  panelEl.className = 'cf-panel';
  panelEl.innerHTML = `
    <div class="cf-head">
      <span class="cf-brand"><span class="cf-dot"></span> corporatefilter<span class="ai">.ai</span></span>
      <button class="cf-close" title="Close">x</button>
    </div>
    <div class="cf-body thinking">Rewriting...</div>`;
  panelEl.querySelector('.cf-close').onclick = removePanel;
  positionPanel(panelEl, selectionRect);
  root.appendChild(panelEl);
}

// ===================== FAB =====================
let fabEl = null;
let fabMenuEl = null;
let fabTimer = null;
let fabScrollY = 0;

function showFAB(rect) {
  const root = getShadow();
  removeFAB();
  fabScrollY = window.scrollY;

  fabEl = document.createElement('button');
  fabEl.className = 'cf-fab';
  fabEl.innerHTML = '<svg viewBox="0 0 24 24" fill="#000"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';

  let top = rect.top - 40;
  let left = rect.right + 6;
  if (top < 8) top = rect.bottom + 6;
  if (left + 38 > window.innerWidth) left = rect.left - 40;
  fabEl.style.top = top + 'px';
  fabEl.style.left = left + 'px';
  root.appendChild(fabEl);

  fabEl.onclick = (e) => { e.stopPropagation(); showFABMenu(rect); };
}

function showFABMenu(rect) {
  const root = getShadow();
  if (fabMenuEl) fabMenuEl.remove();

  const format = detectFormatClient();
  const badge = format.charAt(0).toUpperCase() + format.slice(1);

  fabMenuEl = document.createElement('div');
  fabMenuEl.className = 'cf-fab-menu';
  fabMenuEl.innerHTML = `
    <span class="cf-fab-badge">Format: ${esc(badge)}</span>
    <button class="cf-fab-item" data-m="translate" data-t="gentle"><span class="emoji">🌸</span>Rewrite Gentle</button>
    <button class="cf-fab-item" data-m="translate" data-t="balanced"><span class="emoji">⚖️</span>Rewrite Balanced</button>
    <button class="cf-fab-item" data-m="translate" data-t="spicy"><span class="emoji">🌶️</span>Rewrite Spicy</button>
    <button class="cf-fab-item" data-m="reply" data-t="balanced"><span class="emoji">💬</span>Reply Balanced</button>`;

  let top = rect.bottom + 8;
  let left = rect.left;
  if (top + 200 > window.innerHeight) top = rect.top - 210;
  if (left + 180 > window.innerWidth) left = window.innerWidth - 192;
  fabMenuEl.style.top = top + 'px';
  fabMenuEl.style.left = left + 'px';
  root.appendChild(fabMenuEl);

  fabMenuEl.querySelectorAll('.cf-fab-item').forEach((btn) => {
    btn.onclick = () => {
      const text = window.getSelection()?.toString()?.trim();
      if (!text) { showToast('Selection lost, try again'); removeFAB(); return; }
      removeFAB();
      chrome.runtime.sendMessage({
        type: 'cf:translate',
        payload: { mode: btn.dataset.m, tone: btn.dataset.t, format, input: text },
      }, (resp) => {
        if (resp?.ok) {
          showPanel({
            output: resp.data.output, tone: btn.dataset.t, mode: btn.dataset.m,
            format, selectionRect: rect, originalText: text,
          });
        } else {
          showToast(`Error: ${resp?.data?.error || 'unknown'}`);
        }
      });
      showThinking(rect);
    };
  });
}

function removeFAB() {
  if (fabEl) { fabEl.remove(); fabEl = null; }
  if (fabMenuEl) { fabMenuEl.remove(); fabMenuEl = null; }
}

function detectFormatClient() {
  const u = location.href;
  if (u.includes('mail.google.com') || u.includes('outlook.')) return 'email';
  if (u.includes('slack.com')) return 'slack';
  if (u.includes('linkedin.com')) return 'linkedin';
  if (u.includes('teams.microsoft.com') || u.includes('teams.live.com')) return 'teams';
  if (u.includes('discord.com')) return 'discord';
  if (u.includes('web.whatsapp.com')) return 'whatsapp';
  if (u.includes('telegram.org')) return 'telegram';
  return 'message';
}

// FAB on text selection
let selDebounce = null;
document.addEventListener('mouseup', () => {
  clearTimeout(selDebounce);
  selDebounce = setTimeout(checkSelection, 200);
});
document.addEventListener('keyup', (e) => {
  if (e.shiftKey) { clearTimeout(selDebounce); selDebounce = setTimeout(checkSelection, 200); }
});

async function checkSelection() {
  const sel = window.getSelection();
  const text = sel?.toString()?.trim();
  if (!text || text.length < 4) { removeFAB(); return; }
  // Don't show FAB if panel is open
  if (panelEl) return;
  // Check setting
  const { fabEnabled = true } = await chrome.storage.sync.get(['fabEnabled']);
  if (!fabEnabled) return;
  try {
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { removeFAB(); return; }
    showFAB(rect);
  } catch { removeFAB(); }
}

// Dismiss FAB on scroll or outside click
window.addEventListener('scroll', () => {
  if (fabEl && Math.abs(window.scrollY - fabScrollY) > 50) removeFAB();
}, { passive: true });
document.addEventListener('mousedown', (e) => {
  if (fabMenuEl && !fabMenuEl.contains(e.target) && !fabEl?.contains(e.target)) removeFAB();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { removeFAB(); removePanel(); }
});

// ===================== MESSAGE LISTENER =====================
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'cf:toast') return showToast(msg.text);
  if (msg?.type === 'cf:thinking') return showThinking(msg.selectionRect);
  if (msg?.type === 'cf:result') {
    return showPanel({
      output: msg.output,
      tone: msg.tone,
      mode: msg.mode,
      format: msg.format,
      selectionRect: msg.selectionRect,
      originalText: msg.originalText,
    });
  }
});
