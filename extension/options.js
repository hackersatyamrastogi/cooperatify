const $ = (s) => document.querySelector(s);
const DEFAULTS = { apiBase: 'https://corporatefilter.ai', format: 'slack', fabEnabled: true };

chrome.storage.sync.get(DEFAULTS, (v) => {
  $('#apiBase').value = v.apiBase;
  $('#format').value = v.format;
  $('#fabEnabled').checked = v.fabEnabled;
});

$('#save').addEventListener('click', () => {
  const apiBase = $('#apiBase').value.trim() || DEFAULTS.apiBase;
  const format = $('#format').value;
  const fabEnabled = $('#fabEnabled').checked;
  chrome.storage.sync.set({ apiBase, format, fabEnabled }, () => {
    $('#ok').textContent = 'Saved';
    setTimeout(() => ($('#ok').textContent = ''), 1500);
  });
});
