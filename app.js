// corporatefilter.ai chat — multi-turn with local-only conversations.

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const STORE_KEY = 'corporatefilter:conversations:v1';
const ACTIVE_KEY = 'corporatefilter:activeId';
const LEGACY_STORE_KEY = 'cooperatify:conversations:v1';
const LEGACY_ACTIVE_KEY = 'cooperatify:activeId';
// One-time migration from the old brand's storage keys
try {
  if (!localStorage.getItem(STORE_KEY) && localStorage.getItem(LEGACY_STORE_KEY)) {
    localStorage.setItem(STORE_KEY, localStorage.getItem(LEGACY_STORE_KEY));
    localStorage.removeItem(LEGACY_STORE_KEY);
  }
  if (!localStorage.getItem(ACTIVE_KEY) && localStorage.getItem(LEGACY_ACTIVE_KEY)) {
    localStorage.setItem(ACTIVE_KEY, localStorage.getItem(LEGACY_ACTIVE_KEY));
    localStorage.removeItem(LEGACY_ACTIVE_KEY);
  }
} catch {}

const TONE_HINTS = {
  gentle: 'Soft and empathetic, avoids anything blunt.',
  balanced: 'Professional and natural, the sweet spot.',
  spicy: "Bold and direct — doesn't sugarcoat.",
};

let convs = load();
let activeId = localStorage.getItem(ACTIVE_KEY) || null;
let pendingScreenshot = null; // {dataUrl}

function uid() { return Math.random().toString(36).slice(2, 10); }
function now() { return Date.now(); }
function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; } }
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(convs)); }
function active() { return convs.find((c) => c.id === activeId) || null; }

function newConv() {
  const c = {
    id: uid(),
    title: 'New chat',
    mode: 'translate',
    format: 'slack',
    tone: 'balanced',
    messages: [],
    created: now(),
    updated: now(),
  };
  convs.unshift(c);
  activeId = c.id;
  localStorage.setItem(ACTIVE_KEY, activeId);
  save();
  renderSidebar();
  renderChat();
  $('#input').focus();
}

function deleteConv(id) {
  convs = convs.filter((c) => c.id !== id);
  if (activeId === id) activeId = convs[0]?.id || null;
  if (activeId) localStorage.setItem(ACTIVE_KEY, activeId); else localStorage.removeItem(ACTIVE_KEY);
  save();
  renderSidebar();
  renderChat();
}

function selectConv(id) {
  activeId = id;
  localStorage.setItem(ACTIVE_KEY, activeId);
  renderSidebar();
  renderChat();
}

function fmtRel(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}

function renderSidebar() {
  const list = $('#conv-list');
  const q = ($('#search').value || '').toLowerCase().trim();
  const shown = convs.filter((c) =>
    !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q))
  );
  if (!shown.length) {
    list.innerHTML = `<li class="conv-empty">${q ? 'No matches' : 'No conversations yet'}</li>`;
    return;
  }
  list.innerHTML = shown.map((c) => `
    <li class="${c.id === activeId ? 'active' : ''}" data-id="${c.id}">
      <span class="conv-title">${escapeHtml(c.title)}</span>
      <span class="conv-meta">${c.mode} · ${c.format} · ${c.tone} · ${fmtRel(c.updated)}</span>
    </li>`).join('');
  list.querySelectorAll('li[data-id]').forEach((el) =>
    el.addEventListener('click', () => selectConv(el.dataset.id))
  );
}

function renderChat() {
  const c = active();
  const empty = $('#empty');
  const msgs = $('#messages');
  const del = $('#delete-chat');

  if (!c) {
    // No active conversation — show empty state, hide delete.
    msgs.innerHTML = '';
    msgs.appendChild(empty);
    empty.hidden = false;
    del.hidden = true;
    setMode('translate');
    $('#format').value = 'slack';
    $('#tone').value = 'balanced';
    return;
  }

  del.hidden = false;
  setMode(c.mode);
  $('#format').value = c.format;
  $('#tone').value = c.tone;

  if (!c.messages.length) {
    msgs.innerHTML = '';
    msgs.appendChild(empty);
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  msgs.innerHTML = '';
  for (const m of c.messages) msgs.appendChild(bubble(m));
  msgs.scrollTop = msgs.scrollHeight;
}

function bubble(m) {
  const el = document.createElement('div');
  el.className = `bubble ${m.role}`;
  if (m.thinking) el.classList.add('thinking');
  const label = m.role === 'user' ? 'You' : 'corporatefilter.ai';
  const shot = m.screenshot ? `<img class="shot" src="${m.screenshot}" alt="attachment" />` : '';
  const body = m.thinking ? 'Thinking…' : escapeHtml(m.content);
  const actions = m.role === 'assistant' && !m.thinking
    ? `<div class="bubble-actions">
         <button data-a="copy">Copy</button>
         <button data-a="regen">Regenerate</button>
       </div>` : '';
  el.innerHTML = `<span class="role">${label}</span>${shot}<div class="body">${body}</div>${actions}`;
  if (m.role === 'assistant' && !m.thinking) {
    el.querySelector('[data-a="copy"]').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(m.content); flash(el, 'Copied ✓'); } catch {}
    });
    el.querySelector('[data-a="regen"]').addEventListener('click', () => regenerate(m));
  }
  return el;
}

function flash(el, text) {
  const prev = el.querySelector('[data-a="copy"]').textContent;
  el.querySelector('[data-a="copy"]').textContent = text;
  setTimeout(() => (el.querySelector('[data-a="copy"]').textContent = prev), 1100);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setMode(mode) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
  $('#input').placeholder = mode === 'translate' ? 'What you really want to say...' : 'Paste a message or drop a screenshot...';
  $('#drop-label').hidden = mode !== 'reply';
  $('#send-label').textContent = 'Send';
}

// --- Event wiring ---
$('#new-chat').addEventListener('click', newConv);
$('#delete-chat').addEventListener('click', () => {
  if (activeId && confirm('Delete this conversation?')) deleteConv(activeId);
});
$('#search').addEventListener('input', renderSidebar);

$$('.tab').forEach((t) =>
  t.addEventListener('click', () => {
    const c = active() || ensureConv();
    c.mode = t.dataset.mode;
    c.updated = now();
    save();
    setMode(c.mode);
    renderSidebar();
  })
);
$('#format').addEventListener('change', (e) => { const c = active() || ensureConv(); c.format = e.target.value; c.updated = now(); save(); renderSidebar(); });
$('#tone').addEventListener('change', (e) => { const c = active() || ensureConv(); c.tone = e.target.value; c.updated = now(); save(); renderSidebar(); });

document.addEventListener('click', (e) => {
  if (e.target.matches('.chip')) {
    $('#input').value = e.target.textContent.trim();
    autoGrow($('#input'));
    $('#input').focus();
  }
});

const input = $('#input');
input.addEventListener('input', () => autoGrow(input));
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
function autoGrow(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 220) + 'px'; }

$('#send').addEventListener('click', send);

// Screenshot drop/paste
const drop = $('#drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
drop.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files?.[0];
  if (f && f.type.startsWith('image/')) readImage(f);
});
document.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (item) readImage(item.getAsFile());
});
function readImage(file) {
  const r = new FileReader();
  r.onload = () => {
    pendingScreenshot = r.result;
    $('#thumb-img').src = r.result;
    $('#thumb').hidden = false;
    if (active()?.mode !== 'reply') {
      const c = active() || ensureConv();
      c.mode = 'reply';
      save(); setMode('reply'); renderSidebar();
    }
  };
  r.readAsDataURL(file);
}
$('#thumb-x').addEventListener('click', () => { pendingScreenshot = null; $('#thumb').hidden = true; });

// Voice input
const mic = $('#mic');
let rec = null;
mic.addEventListener('click', () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return alert('Voice input not supported in this browser.');
  if (rec) { rec.stop(); rec = null; mic.classList.remove('rec'); return; }
  rec = new SR();
  rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = true;
  rec.onresult = (e) => {
    const text = [...e.results].map((r) => r[0].transcript).join(' ');
    input.value = text; autoGrow(input);
  };
  rec.onend = () => { rec = null; mic.classList.remove('rec'); };
  rec.start(); mic.classList.add('rec');
});

function ensureConv() {
  if (active()) return active();
  newConv();
  return active();
}

async function send() {
  const text = input.value.trim();
  if (!text && !pendingScreenshot) return;

  const c = ensureConv();
  const userMsg = { role: 'user', content: text || '(see attached screenshot)', ts: now() };
  if (pendingScreenshot) userMsg.screenshot = pendingScreenshot;
  c.messages.push(userMsg);

  if (c.messages.length === 1) c.title = text.slice(0, 48) || 'Screenshot chat';

  // Placeholder assistant bubble
  const pending = { role: 'assistant', content: '', ts: now(), thinking: true };
  c.messages.push(pending);

  const screenshotToSend = pendingScreenshot;
  input.value = ''; autoGrow(input); pendingScreenshot = null; $('#thumb').hidden = true;
  c.updated = now(); save(); renderChat(); renderSidebar();

  await stream(c, pending, screenshotToSend);
}

async function regenerate(assistantMsg) {
  const c = active(); if (!c) return;
  const idx = c.messages.indexOf(assistantMsg);
  if (idx < 0) return;
  c.messages.splice(idx); // drop this assistant and any trailing
  const pending = { role: 'assistant', content: '', ts: now(), thinking: true };
  c.messages.push(pending);
  c.updated = now(); save(); renderChat(); renderSidebar();
  await stream(c, pending, null);
}

async function stream(c, pending, screenshot) {
  const payload = {
    mode: c.mode, format: c.format, tone: c.tone,
    messages: c.messages.filter((m) => m !== pending).map((m) => ({ role: m.role, content: m.content })),
    screenshot,
  };
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    pending.content = data.output || '(empty)';
    pending.thinking = false;
  } catch (err) {
    pending.content = `⚠️ ${err.message}`;
    pending.thinking = false;
  }
  c.updated = now(); save(); renderChat(); renderSidebar();
}

// --- Auth ---
async function renderAuth() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    const { user } = await r.json();
    const slot = $('#auth-slot');
    if (!user) return; // keep Sign in button
    slot.innerHTML = `
      <button class="user-chip" id="user-chip" type="button" aria-expanded="false">
        <img src="${user.avatar || ''}" alt="" />
        <span>${user.name || user.login}</span>
      </button>
      <div class="user-menu" id="user-menu" hidden>
        <div class="um-head">
          <div class="um-name">${user.name || user.login}</div>
          <div class="um-sub">${user.email || '@' + user.login}</div>
        </div>
        <a href="https://github.com/${user.login}" target="_blank" rel="noreferrer">View GitHub profile</a>
        <button id="signout-btn" type="button">Sign out</button>
      </div>`;
    $('#user-chip').addEventListener('click', (e) => {
      e.stopPropagation();
      const m = $('#user-menu'); m.hidden = !m.hidden;
    });
    document.addEventListener('click', () => { const m = $('#user-menu'); if (m && !m.hidden) m.hidden = true; });
    $('#signout-btn').addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      location.reload();
    });
  } catch {}
}
renderAuth();

// Theme toggle
const themeBtn = $('#theme-toggle');
const SUN = '<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/><circle cx="12" cy="12" r="5"/>';
const MOON = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
function paintTheme() {
  const t = document.documentElement.dataset.theme || 'dark';
  $('#theme-icon').innerHTML = t === 'dark' ? MOON : SUN;
}
themeBtn?.addEventListener('click', () => {
  const next = (document.documentElement.dataset.theme === 'dark') ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('corporatefilter:theme', next); } catch {}
  paintTheme();
});
paintTheme();

// --- Init ---
renderSidebar();
renderChat();
$('#yr').textContent = new Date().getFullYear();
