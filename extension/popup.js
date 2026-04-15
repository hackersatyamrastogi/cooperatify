const $ = (s) => document.querySelector(s);
const state = { mode: 'translate' };

document.querySelectorAll('.tab').forEach((t) =>
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('on'));
    t.classList.add('on');
    state.mode = t.dataset.mode;
    $('#go').textContent = state.mode === 'translate' ? 'Translate' : 'Reply';
  })
);

$('#paste').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.getSelection()?.toString() || '',
  });
  if (result) $('#input').value = result;
});

$('#go').addEventListener('click', async () => {
  const input = $('#input').value.trim();
  if (!input) return;
  $('#out').hidden = false; $('#out').textContent = 'Thinking…';
  const payload = { mode: state.mode, tone: $('#tone').value, format: $('#format').value, input };
  chrome.runtime.sendMessage({ type: 'coop:translate', payload }, (resp) => {
    if (resp?.ok) $('#out').textContent = resp.data.output || '(empty)';
    else $('#out').textContent = `Error: ${resp?.data?.error || 'unknown'}`;
  });
});

$('#options').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
