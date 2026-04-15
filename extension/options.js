const $ = (s) => document.querySelector(s);
const DEFAULTS = { apiBase: 'https://cooperatify.vercel.app', format: 'slack' };

chrome.storage.sync.get(DEFAULTS, (v) => {
  $('#apiBase').value = v.apiBase;
  $('#format').value = v.format;
});

$('#save').addEventListener('click', () => {
  const apiBase = $('#apiBase').value.trim() || DEFAULTS.apiBase;
  const format = $('#format').value;
  chrome.storage.sync.set({ apiBase, format }, () => {
    $('#ok').textContent = 'Saved ✓';
    setTimeout(() => ($('#ok').textContent = ''), 1500);
  });
});
