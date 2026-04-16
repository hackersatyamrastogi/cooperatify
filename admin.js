const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  days: 30,
  series: { enabled: { signups: true, chats: true, logins: true, dau: true } },
  auto: false,
  autoTimer: null,
  lastData: null,
};

const COLORS = { signups: '#ffcc00', chats: '#00d4d4', logins: '#8affcf', dau: '#ffb8ff' };

function fmtNum(n) { return (n || 0).toLocaleString(); }
function fmtUSD(n) { return '$' + (n || 0).toFixed(2); }
function fmtDate(ts) { if (!ts) return '-'; return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
function fmtRel(ts) {
  if (!ts) return '-';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}
function escape(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function delta(cur, prev) {
  if (!prev && !cur) return '-';
  if (!prev) return `+${fmtNum(cur)} new`;
  const diff = cur - prev;
  const pct = (diff / prev) * 100;
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(0)}% vs prev`;
}
function deltaClass(cur, prev) {
  if (!prev) return 'neutral';
  return cur >= prev ? 'up' : 'down';
}

async function load() {
  $('#loading').hidden = false;
  $('#error').hidden = true;
  try {
    const r = await fetch(`/api/admin/stats?days=${state.days}`, { credentials: 'same-origin' });
    if (!r.ok) {
      const e = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      if (r.status === 401) return showError('Sign in required. <a href="/">Go to app</a> to sign in first.');
      if (r.status === 403) return showError('Your account is not an admin. Set <code>ADMIN_EMAILS</code> in <code>.env.local</code> (or Vercel env) to your email.');
      return showError(e.error || 'Failed to load stats');
    }
    const data = await r.json();
    state.lastData = data;
    render(data);
    pulse();
  } catch (e) {
    showError(e.message);
  } finally {
    $('#loading').hidden = true;
  }
}

function showError(msg) { const el = $('#error'); el.innerHTML = msg; el.hidden = false; }

function pulse() {
  const p = $('#pulse'); if (!p || !state.auto) return;
  p.hidden = false; p.classList.add('on');
  setTimeout(() => p.classList.remove('on'), 800);
}

function render(d) {
  $$('#overview, #activity, #funnel, #users, #feed').forEach((el) => (el.hidden = false));
  $('#admin-sub').textContent = `Generated ${fmtDate(d.generatedAt)} · range last ${d.range.days}d · ${fmtNum(d.totals.events)} events tracked`;

  // KPIs
  $('#k-users').textContent = fmtNum(d.totals.users);
  setDelta('#k-users-delta', d.totals.inRange.signups, d.prev.users, 'signups');

  $('#k-chats').textContent = fmtNum(d.totals.chatsInRange);
  $('#k-chats-label').textContent = `Chats (${d.range.days}d)`;
  setDelta('#k-chats-delta', d.totals.chatsInRange, d.prev.chats, 'chats');

  $('#k-logins').textContent = fmtNum(d.totals.inRange.logins);
  setDelta('#k-logins-delta', d.totals.inRange.logins, d.prev.logins, 'logins');

  $('#k-dau').textContent = fmtNum(d.totals.activeInRange);
  $('#k-dau-delta').textContent = 'active in range';

  $('#k-tokens').textContent = `${fmtNum(d.totals.inputTokens)} / ${fmtNum(d.totals.outputTokens)}`;
  $('#k-tokens-cost').textContent = `${fmtUSD(d.totals.cost.totalUSD)} est. cost`;

  $('#k-events').textContent = fmtNum(d.totals.events);

  // Sparklines (last 7 days)
  drawSpark('#s-users', d.spark.users, COLORS.signups);
  drawSpark('#s-chats', d.spark.chats, COLORS.chats);
  drawSpark('#s-logins', d.spark.logins, COLORS.logins);
  drawSpark('#s-dau', d.spark.dau, COLORS.dau);

  // Chart + legend toggles
  drawChart(d.series);

  // Breakdowns
  renderBreakdown('#tone-list', d.breakdowns.tone);
  renderBreakdown('#format-list', d.breakdowns.format);

  // Heatmap
  drawHeatmap(d.heatmap);

  // Funnel
  drawFunnel(d.funnel);

  // Tables
  const tbody = $('#users-tbody');
  tbody.innerHTML = '';
  for (const u of d.recent) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><img class="ava" src="${u.avatar || ''}" alt="" onerror="this.style.visibility='hidden'"/></td>
      <td>${escape(u.name || '-')}</td>
      <td><code class="mono-email">${escape(u.email)}</code></td>
      <td><span class="pill pill-${u.provider}">${u.provider}</span></td>
      <td>${u.signInCount}</td>
      <td title="${fmtDate(u.created)}">${fmtRel(u.created)}</td>
      <td title="${fmtDate(u.lastSignIn)}">${fmtRel(u.lastSignIn)}</td>`;
    tbody.appendChild(tr);
  }

  const top = $('#top-tbody'); top.innerHTML = '';
  d.topUsers.forEach((u, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i+1}</td>
      <td><img class="ava sm" src="${u.avatar || ''}" alt="" onerror="this.style.visibility='hidden'"/></td>
      <td>${escape(u.name || '-')}</td>
      <td><code class="mono-email">${escape(u.email)}</code></td>
      <td><strong>${u.count}</strong></td>`;
    top.appendChild(tr);
  });

  // Live feed
  renderFeed(d.feed);
}

function setDelta(sel, cur, prev, label) {
  const el = $(sel);
  el.textContent = delta(cur, prev);
  el.className = `k-delta ${deltaClass(cur, prev)}`;
}

function drawSpark(sel, points, color) {
  const svg = $(sel); if (!svg) return;
  const W = 60, H = 20;
  if (!points.length) { svg.innerHTML = ''; return; }
  const max = Math.max(1, ...points);
  const x = (i) => (i * W) / (points.length - 1 || 1);
  const y = (v) => H - (v / max) * (H - 4) - 2;
  const dPath = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const dArea = `${dPath} L${W},${H} L0,${H} Z`;
  svg.innerHTML = `
    <path d="${dArea}" fill="${color}" fill-opacity="0.15"/>
    <path d="${dPath}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function renderBreakdown(sel, counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const ul = $(sel); ul.innerHTML = '';
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) { ul.innerHTML = '<li class="bd-empty">No data yet</li>'; return; }
  for (const [k, v] of entries) {
    const pct = total > 0 ? (v * 100 / total) : 0;
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="bd-k">${escape(k)}</span>
      <span class="bd-bar"><span class="bd-fill" style="width:${pct.toFixed(1)}%"></span></span>
      <span class="bd-v">${v} <span class="bd-pct">${pct.toFixed(0)}%</span></span>`;
    ul.appendChild(li);
  }
}

function drawChart(series) {
  const svg = $('#chart');
  const W = 900, H = 220, PAD_L = 36, PAD_R = 14, PAD_T = 20, PAD_B = 28;
  const innerW = W - PAD_L - PAD_R, innerH = H - PAD_T - PAD_B;

  // Find max across enabled series
  const visibleKeys = Object.entries(state.series.enabled).filter(([, v]) => v).map(([k]) => k);
  let max = 1;
  for (const p of series) for (const k of visibleKeys) if (p[k] > max) max = p[k];

  const x = (i) => PAD_L + (i * innerW) / Math.max(1, series.length - 1);
  const y = (v) => PAD_T + innerH - (v / max) * innerH;

  // gridlines
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const yy = PAD_T + innerH * (1 - f);
    return `<line x1="${PAD_L}" y1="${yy}" x2="${W - PAD_R}" y2="${yy}" stroke="var(--border)" stroke-dasharray="2 4"/>
            <text x="${PAD_L - 8}" y="${yy + 3}" font-family="Space Mono" font-size="9" fill="var(--faint)" text-anchor="end">${Math.round(max * f)}</text>`;
  }).join('');

  // x labels: every ~step
  const step = Math.max(1, Math.floor(series.length / 10));
  const xLabels = series.map((p, i) => {
    if (i % step !== 0 && i !== series.length - 1) return '';
    return `<text x="${x(i).toFixed(1)}" y="${H - 8}" font-family="Space Mono" font-size="9" fill="var(--faint)" text-anchor="middle">${p.label.slice(5)}</text>`;
  }).join('');

  // series lines with smoothed path + area
  const lines = visibleKeys.map((key) => {
    const color = COLORS[key];
    const pts = series.map((p, i) => ({ x: x(i), y: y(p[key]) }));
    const d = pts.map((pt, i) => `${i ? 'L' : 'M'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
    const dArea = `${d} L${x(series.length-1).toFixed(1)},${PAD_T + innerH} L${x(0).toFixed(1)},${PAD_T + innerH} Z`;
    return `
      <path d="${dArea}" fill="${color}" fill-opacity="0.06"/>
      <path d="${d}" stroke="${color}" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join('');

  // hover hit targets (one per index)
  const hits = series.map((p, i) => `<rect x="${(x(i) - innerW/(series.length*2)).toFixed(1)}" y="${PAD_T}" width="${(innerW/series.length).toFixed(1)}" height="${innerH}" fill="transparent" data-i="${i}"/>`).join('');

  svg.innerHTML = `${grid}${xLabels}${lines}<line id="chart-cross" x1="0" y1="${PAD_T}" x2="0" y2="${PAD_T+innerH}" stroke="var(--yellow)" stroke-width="1" stroke-dasharray="2 3" opacity="0"/>${hits}`;

  const cross = svg.querySelector('#chart-cross');
  const tip = $('#chart-tip');
  svg.querySelectorAll('rect[data-i]').forEach((rect) => {
    rect.addEventListener('mousemove', (e) => {
      const i = Number(rect.dataset.i); const p = series[i];
      const xx = x(i);
      cross.setAttribute('x1', xx); cross.setAttribute('x2', xx); cross.setAttribute('opacity', 1);
      const box = svg.getBoundingClientRect();
      const relX = (xx / W) * box.width;
      tip.hidden = false;
      tip.style.left = `${Math.min(box.width - 180, Math.max(0, relX - 80))}px`;
      tip.innerHTML = `
        <div class="tip-date">${p.label}</div>
        ${visibleKeys.map((k) => `<div class="tip-row"><span class="tip-k"><i style="background:${COLORS[k]}"></i>${k}</span><span class="tip-v">${p[k]}</span></div>`).join('')}`;
    });
    rect.addEventListener('mouseleave', () => { cross.setAttribute('opacity', 0); tip.hidden = true; });
  });
}

function drawHeatmap(h) {
  const host = $('#heatmap'); host.innerHTML = '';
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const max = Math.max(1, h.max);
  // Col headers
  const hdr = document.createElement('div'); hdr.className = 'hm-row hm-hdr';
  hdr.innerHTML = '<span class="hm-day"></span>' + Array.from({length:24}, (_,i)=>`<span class="hm-col">${i}</span>`).join('');
  host.appendChild(hdr);
  for (let r = 0; r < 7; r++) {
    const row = document.createElement('div'); row.className = 'hm-row';
    row.innerHTML = `<span class="hm-day">${DAYS[r]}</span>` +
      h.grid[r].map((v, c) => {
        const op = v === 0 ? 0.08 : 0.2 + 0.8 * (v / max);
        return `<span class="hm-cell" title="${DAYS[r]} ${c}:00 UTC - ${v} events" style="background: color-mix(in srgb, var(--yellow) ${(op * 100).toFixed(0)}%, var(--bg-subtle))"></span>`;
      }).join('');
    host.appendChild(row);
  }
}

function drawFunnel(stages) {
  const host = $('#funnel'); host.innerHTML = '';
  const max = Math.max(1, ...stages.map((s) => s.count));
  const colors = ['var(--yellow)', 'var(--cyan)', 'var(--pink)', '#8affcf'];
  stages.forEach((s, i) => {
    const pct = (s.count / max) * 100;
    const convPct = i > 0 && stages[i-1].count > 0 ? (s.count / stages[i-1].count) * 100 : null;
    const el = document.createElement('div');
    el.className = 'fn-row';
    el.innerHTML = `
      <span class="fn-label">${s.label}</span>
      <span class="fn-bar"><span class="fn-fill" style="width:${pct.toFixed(1)}%; background:${colors[i]}"></span></span>
      <span class="fn-count">${s.count}</span>
      <span class="fn-conv">${convPct !== null ? convPct.toFixed(0) + '%' : '-'}</span>`;
    host.appendChild(el);
  });
}

function renderFeed(events) {
  const ul = $('#feed-list'); ul.innerHTML = '';
  if (!events.length) { ul.innerHTML = '<li class="feed-empty">No events yet</li>'; return; }
  for (const e of events) {
    const li = document.createElement('li');
    li.className = `feed-item feed-${e.type}`;
    const meta = [e.mode, e.format, e.tone, e.provider].filter(Boolean).join(' · ');
    li.innerHTML = `
      <span class="feed-time" title="${fmtDate(e.ts)}">${fmtRel(e.ts)}</span>
      <span class="feed-type">${e.type}</span>
      <span class="feed-email">${escape(e.email || '-')}</span>
      <span class="feed-meta">${escape(meta)}</span>`;
    ul.appendChild(li);
  }
}

// Wiring
$$('.rp').forEach((b) => b.addEventListener('click', () => {
  $$('.rp').forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
  state.days = Number(b.dataset.days);
  load();
}));
$$('#legend .dotleg').forEach((b) => b.addEventListener('click', () => {
  const k = b.dataset.k;
  state.series.enabled[k] = !state.series.enabled[k];
  b.classList.toggle('active', state.series.enabled[k]);
  if (state.lastData) drawChart(state.lastData.series);
}));
$('#refresh').addEventListener('click', load);
$('#auto-refresh').addEventListener('click', () => {
  state.auto = !state.auto;
  $('#ar-label').textContent = 'Live: ' + (state.auto ? 'on' : 'off');
  $('#pulse').hidden = !state.auto;
  if (state.auto) {
    state.autoTimer = setInterval(load, 15000);
  } else if (state.autoTimer) {
    clearInterval(state.autoTimer); state.autoTimer = null;
  }
});

load();
