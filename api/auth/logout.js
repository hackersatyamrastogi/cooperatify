// POST /api/auth/logout — clears the session cookie
import { clearCookie } from '../_session.js';

export default function handler(req, res) {
  clearCookie(res);
  if (req.method === 'GET') {
    res.statusCode = 302;
    res.setHeader('Location', '/');
    return res.end();
  }
  res.status(200).json({ ok: true });
}
