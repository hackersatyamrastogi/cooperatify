// GET /api/admin/export?type=users|events — CSV download for admins
import { currentUser } from '../_session.js';
import { getStore, isAdmin } from '../_store.js';

const CSV = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n');
function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function iso(ts) { return ts ? new Date(ts).toISOString() : ''; }

export default async function handler(req, res) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'sign in required' });
  if (!isAdmin(u)) return res.status(403).json({ error: 'admin only' });

  const url = new URL(req.url, `http://${req.headers.host}`);
  const type = url.searchParams.get('type') || 'users';
  const { users, events } = await getStore();

  let csv = '', filename = 'export.csv';
  if (type === 'users') {
    const header = ['id', 'email', 'name', 'provider', 'created', 'lastSignIn', 'signInCount'];
    const rows = [header, ...users.map((u) => [u.id, u.email, u.name, u.provider, iso(u.created), iso(u.lastSignIn), u.signInCount || 1])];
    csv = CSV(rows);
    filename = `cooperatify-users-${new Date().toISOString().slice(0,10)}.csv`;
  } else if (type === 'events') {
    const header = ['ts', 'type', 'userId', 'email', 'mode', 'format', 'tone', 'provider', 'inputTokens', 'outputTokens'];
    const rows = [header, ...events.slice(-10000).map((e) => [
      iso(e.ts), e.type, e.userId || '', e.email || '',
      e.meta?.mode || '', e.meta?.format || '', e.meta?.tone || '', e.meta?.provider || '',
      e.meta?.inputTokens || '', e.meta?.outputTokens || '',
    ])];
    csv = CSV(rows);
    filename = `cooperatify-events-${new Date().toISOString().slice(0,10)}.csv`;
  } else {
    return res.status(400).json({ error: 'type must be users or events' });
  }

  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="${filename}"`);
  res.setHeader('cache-control', 'no-store');
  res.status(200).end(csv);
}
