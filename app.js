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
// Clean up stale "thinking" messages left from interrupted sessions
for (const c of convs) {
  const had = c.messages.length;
  c.messages = c.messages.filter((m) => !m.thinking);
  if (c.messages.length !== had) save();
}
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
    formatDD.setValue('slack');
    toneDD.setValue('balanced');
    return;
  }

  del.hidden = false;
  setMode(c.mode);
  formatDD.setValue(c.format);
  toneDD.setValue(c.tone);

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
function confirmDialog({ title, body, okLabel = 'Delete', okClass = 'btn-danger' }) {
  return new Promise((resolve) => {
    const m = $('#confirm-modal');
    $('#confirm-title').textContent = title;
    $('#confirm-body').textContent = body;
    const ok = $('#confirm-ok');
    ok.textContent = okLabel;
    ok.className = okClass;
    m.hidden = false;
    setTimeout(() => ok.focus(), 50);
    const cleanup = (result) => {
      m.hidden = true;
      ok.removeEventListener('click', onOk);
      m.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onBackdrop = (e) => { if (e.target.matches('[data-close]')) cleanup(false); };
    const onKey = (e) => { if (e.key === 'Escape') cleanup(false); if (e.key === 'Enter') cleanup(true); };
    ok.addEventListener('click', onOk);
    m.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}

$('#delete-chat').addEventListener('click', async () => {
  if (!activeId) return;
  const c = active();
  const ok = await confirmDialog({
    title: 'Delete this chat?',
    body: `"${c?.title || 'Untitled'}" and all its messages will be removed from this browser. This can't be undone.`,
    okLabel: 'Delete chat',
  });
  if (ok) deleteConv(activeId);
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
function setupDropdown(wrapId, onChange) {
  const wrap = document.getElementById(wrapId);
  const trigger = wrap.querySelector('.dp-trigger');
  const label = wrap.querySelector('.dp-label');
  const options = [...wrap.querySelectorAll('.dp-option')];

  const close = () => { wrap.classList.remove('open'); trigger.setAttribute('aria-expanded', 'false'); };
  const open = () => {
    document.querySelectorAll('.dp-wrap.open').forEach((w) => w !== wrap && w.classList.remove('open'));
    wrap.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    wrap.classList.contains('open') ? close() : open();
  });
  options.forEach((o) =>
    o.addEventListener('click', (e) => {
      e.stopPropagation();
      const v = o.dataset.value;
      setValue(v);
      onChange(v);
      close();
    })
  );
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  function setValue(v) {
    const opt = options.find((o) => o.dataset.value === v) || options[0];
    label.textContent = opt.querySelector('.dp-opt-title').textContent;
    options.forEach((o) => o.classList.toggle('active', o === opt));
    wrap.dataset.value = v;
    // Sync the trigger icon with the active option (for dropdowns that have .dp-icon-slot)
    const slot = trigger.querySelector('.dp-icon-slot');
    const src = opt.querySelector('.dp-opt-icon, .dp-opt-emoji');
    if (slot && src) slot.innerHTML = src.innerHTML;
  }
  return { setValue, get value() { return wrap.dataset.value; } };
}

const formatDD = setupDropdown('dp-format', (v) => {
  const c = active() || ensureConv(); c.format = v; c.updated = now(); save(); renderSidebar();
});
const toneDD = setupDropdown('dp-tone', (v) => {
  const c = active() || ensureConv(); c.tone = v; c.updated = now(); save(); renderSidebar();
});

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

let sending = false;
async function send() {
  if (sending) return;
  const text = input.value.trim();
  if (!text && !pendingScreenshot) return;
  sending = true;

  try {
    const c = ensureConv();
    const userMsg = { role: 'user', content: text || '(see attached screenshot)', ts: now() };
    if (pendingScreenshot) userMsg.screenshot = pendingScreenshot;
    c.messages.push(userMsg);

    if (c.messages.length === 1) c.title = text.slice(0, 48) || 'Screenshot chat';

    const pending = { role: 'assistant', content: '', ts: now(), thinking: true };
    c.messages.push(pending);

    const screenshotToSend = pendingScreenshot;
    input.value = ''; autoGrow(input); pendingScreenshot = null; $('#thumb').hidden = true;
    c.updated = now(); save(); renderChat(); renderSidebar();

    await stream(c, pending, screenshotToSend);
  } finally {
    sending = false;
  }
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
  const msgs = c.messages
    .filter((m) => m !== pending && !m.thinking)
    .map((m) => ({ role: m.role, content: m.content }));
  const reqBody = { mode: c.mode, format: c.format, tone: c.tone, messages: msgs };
  if (screenshot) reqBody.screenshot = screenshot;

  // Use streaming if browser supports ReadableStream on fetch response
  const canStream = typeof ReadableStream !== 'undefined';
  if (canStream) reqBody.stream = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${res.status})`);
    }

    if (canStream && res.headers.get('content-type')?.includes('text/event-stream')) {
      // SSE streaming: show text word-by-word
      pending.thinking = false;
      pending.content = '';
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const msgEl = $('#messages');
      let bubbleBody = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'delta' && evt.text) {
              pending.content += evt.text;
              if (!bubbleBody) {
                renderChat();
                const bubbles = msgEl.querySelectorAll('.bubble.assistant');
                bubbleBody = bubbles[bubbles.length - 1]?.querySelector('.body');
              }
              if (bubbleBody) {
                bubbleBody.textContent = pending.content;
                msgEl.scrollTop = msgEl.scrollHeight;
              }
            }
            if (evt.type === 'done') {
              pending.content = evt.output || pending.content || '(empty)';
            }
            if (evt.type === 'error') {
              throw new Error(evt.error);
            }
          } catch (e) {
            if (e.message && !e.message.includes('JSON')) throw e;
          }
        }
      }
    } else {
      // Fallback: non-streaming JSON response
      const data = await res.json();
      pending.content = data.output || '(empty)';
      pending.thinking = false;
    }
  } catch (err) {
    pending.content = pending.content || `Error: ${err.message}`;
    pending.thinking = false;
  }
  c.updated = now(); save(); renderChat(); renderSidebar();
}

// Handle ?auth_error=... from a failed OAuth redirect
(function handleAuthError() {
  const p = new URLSearchParams(location.search);
  const err = p.get('auth_error');
  if (!err) return;
  const msgs = {
    github_not_configured: 'GitHub sign-in isn\'t configured yet. Use email sign-in below, or set GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET in .env.local.',
    github_state_invalid: 'Sign-in state mismatch — please try again.',
    github_exchange_failed: 'GitHub rejected the sign-in. Check the OAuth app callback URL matches /api/auth/callback.',
    google_not_configured: 'Google sign-in isn\'t configured yet. Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in .env.local.',
    google_state_invalid: 'Google sign-in state mismatch — please try again.',
    google_exchange_failed: 'Google rejected the sign-in. Check the OAuth client redirect URI matches /api/auth/google-callback.',
    google_id_token_invalid: 'Couldn\'t decode Google ID token.',
    google_audience_mismatch: 'Google ID token audience mismatch.',
    google_email_unverified: 'Your Google email isn\'t verified.',
  };
  sessionStorage.setItem('coop:authError', msgs[err] || `Sign-in failed (${err}).`);
  // Clean the URL
  history.replaceState({}, '', location.pathname);
  // Open modal on next tick
  setTimeout(() => openSigninModal(), 100);
})();

// --- Auth ---
async function openSigninModal() {
  const m = $('#signin-modal'); if (!m) return;
  m.hidden = false;

  // Surface any pending auth error as a banner inside the modal
  const errBanner = m.querySelector('#modal-banner');
  const pending = sessionStorage.getItem('coop:authError');
  if (pending && errBanner) {
    errBanner.textContent = pending;
    errBanner.hidden = false;
    sessionStorage.removeItem('coop:authError');
  } else if (errBanner) {
    errBanner.hidden = true;
    errBanner.textContent = '';
  }

  try {
    const r = await fetch('/api/auth/config');
    const { providers } = await r.json();
    const gh = m.querySelector('.provider-btn.github');
    const gg = m.querySelector('.provider-btn.google');
    const devForm = m.querySelector('#dev-form');
    const divider = m.querySelector('.divider');
    if (gh) gh.style.display = providers.github ? 'flex' : 'none';
    if (gg) gg.style.display = providers.google ? 'flex' : 'none';
    if (devForm) devForm.style.display = providers.dev ? 'flex' : 'none';
    const hasOAuth = providers.github || providers.google;
    if (divider) divider.style.display = hasOAuth && providers.dev ? 'flex' : 'none';
    if (!hasOAuth && !providers.dev) {
      m.querySelector('.modal-sub').innerHTML = '<span style="color:var(--red)">No sign-in provider is configured.</span> Set <code>GITHUB_CLIENT_*</code>, <code>GOOGLE_CLIENT_*</code>, or <code>COOP_DEV_LOGIN=1</code> in <code>.env.local</code>.';
    }
  } catch {}
  setTimeout(() => m.querySelector('input:not([type=hidden])')?.focus(), 50);
}
function closeSigninModal() { const m = $('#signin-modal'); if (m) m.hidden = true; }
document.addEventListener('click', (e) => {
  if (e.target.closest('#signin-btn')) { e.preventDefault(); openSigninModal(); return; }
  if (e.target.matches('[data-close]')) closeSigninModal();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSigninModal(); });

$('#dev-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#dev-email').value.trim();
  const name = $('#dev-name').value.trim();
  const err = $('#dev-err');
  err.hidden = true;
  try {
    const r = await fetch('/api/auth/dev', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email, name }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Sign-in failed');
    location.reload();
  } catch (e2) {
    err.textContent = e2.message;
    err.hidden = false;
  }
});

async function renderAuth() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    const { user } = await r.json();
    const slot = $('#auth-slot');
    if (!user) return; // keep Sign in button
    const isGH = user.provider === 'github';
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
        <a href="/admin" id="admin-link" hidden>Admin dashboard</a>
        ${isGH ? `<a href="https://github.com/${user.login}" target="_blank" rel="noreferrer">View GitHub profile</a>` : ''}
        <button id="signout-btn" type="button">Sign out</button>
      </div>`;
    // Reveal admin link only if server confirms admin (HEAD returns 200 for admins)
    fetch('/api/admin/stats', { method: 'HEAD', credentials: 'same-origin' })
      .then((r) => { if (r.ok) $('#admin-link').hidden = false; })
      .catch(() => {});
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

// PWA: register service worker + detect standalone mode
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isPWAParam = new URLSearchParams(location.search).has('pwa');
const isPWA = isStandalone || isPWAParam;
if (isPWA) {
  document.documentElement.classList.add('pwa');
  if (!active()) newConv();
}

// PWA install prompt (platform-aware)
(function setupInstallBanner() {
  if (isStandalone) return; // already installed
  if (localStorage.getItem('corporatefilter:install-dismissed')) return;

  const banner = $('#install-banner');
  const hint = $('#ib-hint');
  const installBtn = $('#ib-install');
  const closeBtn = $('#ib-close');
  if (!banner) return;

  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|Chrome/.test(ua);
  const isChrome = /Chrome/.test(ua) && !/Edg/.test(ua);

  let deferredPrompt = null;

  if (isIOS && isSafari) {
    // iOS Safari: no native prompt, show manual instructions
    hint.innerHTML = 'Tap <span class="key">&#x2BEA;&#xFE0E;</span> Share, then <strong>Add to Home Screen</strong>';
    installBtn.textContent = 'Got it';
    installBtn.addEventListener('click', () => {
      banner.hidden = true;
      localStorage.setItem('corporatefilter:install-dismissed', '1');
    });
  } else if (isChrome || isAndroid) {
    // Chrome/Android: capture beforeinstallprompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      banner.hidden = false;
    });
    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if (outcome === 'accepted') banner.hidden = true;
      } else {
        hint.textContent = 'Open browser menu, then "Install app" or "Add to Home Screen"';
        installBtn.textContent = 'Got it';
        installBtn.addEventListener('click', () => { banner.hidden = true; }, { once: true });
      }
    });
  } else {
    // Desktop or other: generic instructions
    hint.textContent = 'Open browser menu and select "Install app" for the best experience';
    installBtn.textContent = 'Got it';
    installBtn.addEventListener('click', () => {
      banner.hidden = true;
      localStorage.setItem('corporatefilter:install-dismissed', '1');
    });
  }

  closeBtn.addEventListener('click', () => {
    banner.hidden = true;
    localStorage.setItem('corporatefilter:install-dismissed', '1');
  });

  // Show banner: immediately on iOS (no native prompt), or after 3s on mobile
  if (isIOS && isSafari) {
    setTimeout(() => { banner.hidden = false; }, 1500);
  } else if (isAndroid || isPWAParam) {
    setTimeout(() => { if (!deferredPrompt) banner.hidden = false; }, 2000);
  } else if (isPWAParam) {
    setTimeout(() => { banner.hidden = false; }, 1000);
  }

  // Also listen for appinstalled
  window.addEventListener('appinstalled', () => {
    banner.hidden = true;
    localStorage.setItem('corporatefilter:install-dismissed', '1');
  });
})();
