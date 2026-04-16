// POST /api/auth/logout — clears the session cookie
import { clearCookie, currentUser } from '../_session.js';
import { recordEvent } from '../_store.js';

export default async function handler(req, res) {
  const u = currentUser(req);
  clearCookie(res);
  try { if (u) await recordEvent('logout', {}, u); } catch {}
  if (req.method === 'GET') {
    res.statusCode = 302;
    res.setHeader('Location', '/');
    return res.end();
  }
  res.status(200).json({ ok: true });
}
