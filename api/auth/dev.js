// POST /api/auth/dev — dev-only email sign-in (no password, no OAuth)
// Gated behind COOP_DEV_LOGIN=1 so it's off in prod by default.
import crypto from 'node:crypto';
import { sign, setCookie } from '../_session.js';
import { recordUser, recordEvent } from '../_store.js';

export default async function handler(req, res) {
  if (process.env.COOP_DEV_LOGIN !== '1') {
    return res.status(404).json({ error: 'not found' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { email, name } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'valid email required' });
  }
  const cleanName = String(name || '').trim() || cleanEmail.split('@')[0];

  // Deterministic id from email (stable across sessions)
  const id = crypto.createHash('sha256').update(cleanEmail).digest('hex').slice(0, 16);
  const avatar = `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(cleanEmail)}&backgroundColor=ffcc00,00d4d4,ffb8ff&backgroundType=gradientLinear`;

  const token = sign({
    sub: id,
    login: cleanEmail,
    name: cleanName,
    email: cleanEmail,
    avatar,
    provider: 'dev',
  });
  setCookie(res, token);
  const user = { id, name: cleanName, email: cleanEmail, avatar, provider: 'dev' };
  try {
    await recordUser(user);
    await recordEvent('login', { provider: 'dev' }, user);
  } catch (e) { /* analytics never blocks auth */ }
  res.status(200).json({ ok: true, user });
}
