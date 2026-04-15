const $ = (s) => document.querySelector(s);

const state = {
  mode: 'translate', // 'translate' | 'reply'
  format: 'slack',
  tone: 'balanced',
  screenshot: null, // data URL for reply mode
};

const TONE_HINTS = {
  gentle:   { name: 'Gentle',   desc: 'Soft and empathetic, avoids anything blunt.' },
  balanced: { name: 'Balanced', desc: 'Professional and natural, the sweet spot.' },
  spicy:    { name: 'Spicy',    desc: "Bold and direct — doesn't sugarcoat." },
};

// --- Tabs
document.querySelectorAll('.tab').forEach((el) => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    el.classList.add('active');
    state.mode = el.dataset.mode;
    $('#go-label').textContent = state.mode === 'translate' ? 'Translate' : 'Reply';
    $('#input').placeholder =
      state.mode === 'translate' ? 'What you really want to say...' : 'Paste text or drop a screenshot...';
    $('#drop-label').hidden = state.mode !== 'reply';
  });
});

// --- Controls
$('#format').addEventListener('change', (e) => (state.format = e.target.value));
$('#tone').addEventListener('change', (e) => {
  state.tone = e.target.value;
  const t = TONE_HINTS[state.tone];
  $('#tone-hint').innerHTML = `<strong>${t.name}</strong> — ${t.desc}`;
});

// --- Chips
document.querySelectorAll('.chip').forEach((c) =>
  c.addEventListener('click', () => { $('#input').value = c.textContent.trim(); $('#input').focus(); })
);

// --- Screenshot drop / paste (reply mode)
const drop = $('#drop');
['dragenter', 'dragover'].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); })
);
['dragleave', 'drop'].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); })
);
drop.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files?.[0];
  if (file && file.type.startsWith('image/')) readImage(file);
});
document.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (item) readImage(item.getAsFile());
});
function readImage(file) {
  const r = new FileReader();
  r.onload = () => {
    state.screenshot = r.result;
    $('#input').value = (($('#input').value || '') + '\n[screenshot attached]').trim();
  };
  r.readAsDataURL(file);
}

// --- Voice input (Web Speech API, progressive enhancement)
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
    $('#input').value = text;
  };
  rec.onend = () => { rec = null; mic.classList.remove('rec'); };
  rec.start(); mic.classList.add('rec');
});

// --- Translate / Reply
$('#go').addEventListener('click', run);
async function run() {
  const input = $('#input').value.trim();
  if (!input && !state.screenshot) return;
  const btn = $('#go'); btn.disabled = true; btn.querySelector('#go-label').textContent = '…';
  $('#output').hidden = false;
  $('#output-body').textContent = 'Thinking…';
  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: state.mode, format: state.format, tone: state.tone,
        input, screenshot: state.mode === 'reply' ? state.screenshot : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    $('#output-body').textContent = data.output || '(empty)';
    saveHistory(input, data.output);
  } catch (err) {
    $('#output-body').textContent = `Error: ${err.message}\n\nDeploy the /api/translate function (Cloudflare Pages) and set ANTHROPIC_API_KEY.`;
  } finally {
    btn.disabled = false; btn.querySelector('#go-label').textContent = state.mode === 'translate' ? 'Translate' : 'Reply';
  }
}

$('#copy').addEventListener('click', async () => {
  const t = $('#output-body').textContent;
  try { await navigator.clipboard.writeText(t); $('#copy').textContent = 'Copied'; setTimeout(() => ($('#copy').textContent = 'Copy'), 1200); } catch {}
});

// --- Local history
function saveHistory(input, output) {
  try {
    const key = 'cooperatify:history';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    arr.unshift({ t: Date.now(), input, output, mode: state.mode, format: state.format, tone: state.tone });
    localStorage.setItem(key, JSON.stringify(arr.slice(0, 100)));
  } catch {}
}

$('#yr').textContent = new Date().getFullYear();
