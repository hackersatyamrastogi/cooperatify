// Cooperatify content script — toasts + replace selection with output

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'coop:toast') return showToast(msg.text);
  if (msg?.type === 'coop:result') return showResult(msg.output, msg.tone);
});

function showToast(text) {
  let el = document.getElementById('coop-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'coop-toast';
    document.documentElement.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

function showResult(output, tone) {
  // Replace selection if it's in an editable; otherwise show a card.
  const replaced = replaceSelectionInEditable(output);
  if (replaced) {
    showToast(`Rewrote in ${tone} tone ✓`);
    return;
  }
  showCard(output);
}

function replaceSelectionInEditable(text) {
  const ae = document.activeElement;
  if (!ae) return false;
  try {
    if (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && ae.type === 'text')) {
      const start = ae.selectionStart ?? 0;
      const end = ae.selectionEnd ?? 0;
      ae.setRangeText(text, start, end, 'end');
      ae.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    if (ae.isContentEditable || document.queryCommandSupported?.('insertText')) {
      document.execCommand('insertText', false, text);
      return true;
    }
  } catch (_) {}
  return false;
}

function showCard(output) {
  let card = document.getElementById('coop-card');
  if (card) card.remove();
  card = document.createElement('div');
  card.id = 'coop-card';
  card.innerHTML = `
    <div class="coop-card-head">
      <span class="coop-brand"><span class="coop-dot"></span> cooperatify</span>
      <button class="coop-x" title="Close">×</button>
    </div>
    <pre class="coop-body"></pre>
    <div class="coop-actions">
      <button class="coop-copy">Copy</button>
      <button class="coop-insert">Insert</button>
    </div>`;
  card.querySelector('.coop-body').textContent = output;
  document.documentElement.appendChild(card);
  card.querySelector('.coop-x').onclick = () => card.remove();
  card.querySelector('.coop-copy').onclick = async () => {
    await navigator.clipboard.writeText(output);
    showToast('Copied ✓');
  };
  card.querySelector('.coop-insert').onclick = () => {
    if (replaceSelectionInEditable(output)) { showToast('Inserted ✓'); card.remove(); }
    else showToast('Focus an editor first');
  };
}
