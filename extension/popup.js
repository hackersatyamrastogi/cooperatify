const $ = (s) => document.querySelector(s);
const state = { mode: 'translate', lastInput: '', lastOutput: '' };

document.querySelectorAll('.tab').forEach((t) =>
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('on'));
    t.classList.add('on');
    state.mode = t.dataset.mode;
    $('#go').textContent = state.mode === 'translate' ? 'Translate' : 'Reply';
  })
);

// Auto-detect format from active tab, fall back to saved default
(async () => {
  const { format: savedDefault = 'slack' } = await chrome.storage.sync.get(['format']);
  chrome.runtime.sendMessage({ type: 'cf:detectFormat' }, (resp) => {
    const detected = resp?.format || 'message';
    const isGeneric = detected === 'message' || detected === 'chat';
    const chosen = isGeneric ? savedDefault : detected;
    $('#format').value = chosen;
    if (!isGeneric) {
      const label = detected.charAt(0).toUpperCase() + detected.slice(1);
      $('#detected').textContent = `Detected: ${label}`;
    } else {
      $('#detected').textContent = '';
    }
  });
})();

// Paste from clipboard
$('#paste-clip').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) { $('#input').value = text; $('#input').focus(); }
  } catch {
    // Clipboard permission denied, fall back to page selection
    pasteFromPage();
  }
});

// Paste from page selection
$('#paste-sel').addEventListener('click', pasteFromPage);
async function pasteFromPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() || '',
    });
    if (result) { $('#input').value = result; $('#input').focus(); }
  } catch {}
}

// Copy output to clipboard
$('#copy-out').addEventListener('click', async () => {
  const text = state.lastOutput;
  if (!text) return;
  await navigator.clipboard.writeText(text);
  const btn = $('#copy-out');
  btn.textContent = 'Copied';
  btn.classList.add('copied');
  setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1200);
});

// Enter to submit
$('#input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); translate(); }
});

$('#go').addEventListener('click', translate);
async function translate() {
  const input = $('#input').value.trim();
  if (!input) return;
  const tone = $('#tone').value;
  state.lastInput = input;
  $('#out-wrap').hidden = false;
  $('#out').textContent = 'Thinking...';
  $('#tones').hidden = true;
  chrome.runtime.sendMessage({
    type: 'cf:translate',
    payload: { mode: state.mode, tone, format: $('#format').value, input },
  }, (resp) => {
    if (resp?.ok) {
      state.lastOutput = resp.data.output;
      $('#out').textContent = resp.data.output;
      showTones(tone);
    } else {
      $('#out').textContent = `Error: ${resp?.data?.error || 'unknown'}`;
    }
  });
}

function showTones(active) {
  const el = $('#tones'); el.hidden = false;
  el.querySelectorAll('.tp').forEach((b) => {
    b.classList.toggle('on', b.dataset.t === active);
    b.onclick = () => retone(b.dataset.t);
  });
}

function retone(tone) {
  const input = state.lastInput;
  if (!input) return;
  $('#out').textContent = 'Rewriting...';
  $('#tones').querySelectorAll('.tp').forEach((b) => b.classList.toggle('on', b.dataset.t === tone));
  chrome.runtime.sendMessage({
    type: 'cf:retone',
    payload: { mode: state.mode, tone, format: $('#format').value, input },
  }, (resp) => {
    if (resp?.ok) {
      state.lastOutput = resp.output;
      $('#out').textContent = resp.output;
    } else {
      $('#out').textContent = `Error: ${resp?.error || 'unknown'}`;
    }
  });
}

$('#options').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
