// GET /api/admin/stats?days=30 — aggregated analytics for admins
import { currentUser } from '../_session.js';
import { getStore, isAdmin } from '../_store.js';

const DAY = 86400 * 1000;

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'sign in required' });
  if (!isAdmin(u)) return res.status(403).json({ error: 'admin only' });
  if (req.method === 'HEAD') return res.status(200).end();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 30, 1), 365);

  const { users, events } = await getStore();
  const now = Date.now();

  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const base = todayStart.getTime() - (days - 1) * DAY;
  const rangeStart = base;
  const prevStart = base - days * DAY;
  const prevEnd = base;

  // Day series
  const series = [];
  for (let i = 0; i < days; i++) {
    const start = base + i * DAY;
    series.push({
      label: new Date(start).toISOString().slice(0, 10),
      start, end: start + DAY,
      signups: 0, logins: 0, chats: 0, activeUsers: new Set(),
    });
  }
  const dayBucket = (ts) => {
    const idx = Math.floor((ts - base) / DAY);
    return idx >= 0 && idx < series.length ? series[idx] : null;
  };

  for (const u2 of users) {
    const b = dayBucket(u2.created);
    if (b) b.signups += 1;
  }
  for (const e of events) {
    const b = dayBucket(e.ts);
    if (!b) continue;
    if (e.type === 'login') b.logins += 1;
    if (e.type === 'chat') b.chats += 1;
    if (e.userId) b.activeUsers.add(e.userId);
  }
  const seriesOut = series.map((d) => ({
    label: d.label, signups: d.signups, logins: d.logins, chats: d.chats, dau: d.activeUsers.size,
  }));

  // Activity heatmap: 7 rows (Sun-Sat) × 24 cols (hours UTC)
  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
  let heatMax = 0;
  for (const e of events) {
    if (e.ts < rangeStart) continue;
    const d = new Date(e.ts);
    heatmap[d.getUTCDay()][d.getUTCHours()] += 1;
    if (heatmap[d.getUTCDay()][d.getUTCHours()] > heatMax) heatMax = heatmap[d.getUTCDay()][d.getUTCHours()];
  }

  // Breakdowns + totals in range
  const toneCounts = {}, formatCounts = {}, modeCounts = {};
  let chatInputTokens = 0, chatOutputTokens = 0, chatCount = 0;
  const userChatCount = new Map();
  const activeUsersInRange = new Set();
  for (const e of events) {
    if (e.ts < rangeStart) continue;
    if (e.userId) activeUsersInRange.add(e.userId);
    if (e.type !== 'chat') continue;
    chatCount++;
    chatInputTokens += e.meta?.inputTokens || 0;
    chatOutputTokens += e.meta?.outputTokens || 0;
    if (e.meta?.tone) toneCounts[e.meta.tone] = (toneCounts[e.meta.tone] || 0) + 1;
    if (e.meta?.format) formatCounts[e.meta.format] = (formatCounts[e.meta.format] || 0) + 1;
    if (e.meta?.mode) modeCounts[e.meta.mode] = (modeCounts[e.meta.mode] || 0) + 1;
    if (e.userId) userChatCount.set(e.userId, (userChatCount.get(e.userId) || 0) + 1);
  }

  // Previous-period totals for deltas
  const prev = { users: 0, logins: 0, chats: 0 };
  for (const u2 of users) if (u2.created >= prevStart && u2.created < prevEnd) prev.users++;
  for (const e of events) {
    if (e.ts < prevStart || e.ts >= prevEnd) continue;
    if (e.type === 'login') prev.logins++;
    if (e.type === 'chat') prev.chats++;
  }

  // Funnel: users whose first signup was in range
  const newUsersInRange = users.filter((u2) => u2.created >= rangeStart);
  const newUserIds = new Set(newUsersInRange.map((u2) => u2.id));
  const chatsByNewUser = new Map();
  for (const e of events) {
    if (e.type !== 'chat' || !e.userId || !newUserIds.has(e.userId)) continue;
    chatsByNewUser.set(e.userId, (chatsByNewUser.get(e.userId) || 0) + 1);
  }
  const funnel = [
    { label: 'Signed up', count: newUsersInRange.length },
    { label: '1+ chat', count: [...chatsByNewUser.values()].filter((n) => n >= 1).length },
    { label: '5+ chats', count: [...chatsByNewUser.values()].filter((n) => n >= 5).length },
    { label: '20+ chats', count: [...chatsByNewUser.values()].filter((n) => n >= 20).length },
  ];

  // Top users by chats in range
  const topUsers = [...userChatCount.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([id, count]) => {
      const u2 = users.find((x) => x.id === id);
      return { id, email: u2?.email || id, name: u2?.name || '', avatar: u2?.avatar || '', count };
    });

  // Recent signups
  const recent = [...users].sort((a, b) => b.created - a.created).slice(0, 25).map((u2) => ({
    id: u2.id, email: u2.email, name: u2.name, provider: u2.provider, avatar: u2.avatar,
    created: u2.created, lastSignIn: u2.lastSignIn, signInCount: u2.signInCount || 1,
  }));

  // Last 50 events (live feed)
  const feed = events.slice(-50).reverse().map((e) => ({
    ts: e.ts, type: e.type, email: e.email || null,
    tone: e.meta?.tone || null, format: e.meta?.format || null, mode: e.meta?.mode || null,
    provider: e.meta?.provider || null,
  }));

  // 7d sparkline for KPIs (always last 7 days regardless of range)
  const sparkStart = todayStart.getTime() - 6 * DAY;
  const spark = { users: Array(7).fill(0), logins: Array(7).fill(0), chats: Array(7).fill(0), dau: [] };
  const sparkActive = Array.from({ length: 7 }, () => new Set());
  for (const u2 of users) {
    const idx = Math.floor((u2.created - sparkStart) / DAY);
    if (idx >= 0 && idx < 7) spark.users[idx]++;
  }
  for (const e of events) {
    const idx = Math.floor((e.ts - sparkStart) / DAY);
    if (idx < 0 || idx >= 7) continue;
    if (e.type === 'login') spark.logins[idx]++;
    if (e.type === 'chat') spark.chats[idx]++;
    if (e.userId) sparkActive[idx].add(e.userId);
  }
  spark.dau = sparkActive.map((s) => s.size);

  // Cost estimate (Sonnet: $3/M input, $15/M output — update when pricing changes)
  const cost = { inputUSD: (chatInputTokens / 1_000_000) * 3, outputUSD: (chatOutputTokens / 1_000_000) * 15 };
  cost.totalUSD = cost.inputUSD + cost.outputUSD;

  res.status(200).json({
    range: { days, rangeStart, now },
    totals: {
      users: users.length,
      events: events.length,
      chatsInRange: chatCount,
      inputTokens: chatInputTokens,
      outputTokens: chatOutputTokens,
      cost,
      activeInRange: activeUsersInRange.size,
      last24h: {
        signups: users.filter((u2) => u2.created > now - DAY).length,
        logins: events.filter((e) => e.type === 'login' && e.ts > now - DAY).length,
        chats: events.filter((e) => e.type === 'chat' && e.ts > now - DAY).length,
      },
      inRange: {
        signups: users.filter((u2) => u2.created >= rangeStart).length,
        logins: events.filter((e) => e.type === 'login' && e.ts >= rangeStart).length,
        chats: chatCount,
      },
    },
    prev,
    series: seriesOut,
    spark,
    heatmap: { grid: heatmap, max: heatMax },
    breakdowns: { tone: toneCounts, format: formatCounts, mode: modeCounts },
    funnel,
    topUsers,
    recent,
    feed,
    generatedAt: now,
  });
}
