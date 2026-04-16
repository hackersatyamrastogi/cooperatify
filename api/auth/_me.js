// GET /api/auth/me — returns the signed-in user, or { user: null }
import { currentUser } from '../_session.js';

export default function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const u = currentUser(req);
  if (!u) return res.status(200).json({ user: null });
  res.status(200).json({
    user: {
      id: u.sub,
      login: u.login,
      name: u.name,
      email: u.email,
      avatar: u.avatar,
      provider: u.provider,
    },
  });
}
