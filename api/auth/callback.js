// GET /api/auth/callback — exchanges code, sets signed session cookie
import { sign, setCookie, readCookie } from '../_session.js';

export default async function handler(req, res) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.status(500).end('auth not configured');

  const url = new URL(req.url, `http://${req.headers.host}`);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = readCookie(req, 'coop_oauth_state');
  if (!code || !state || state !== savedState) return res.status(400).end('invalid oauth state');

  // Exchange code
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenJson.access_token) return res.status(400).end('token exchange failed');

  // Fetch user profile
  const [userRes, emailsRes] = await Promise.all([
    fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${tokenJson.access_token}`, 'User-Agent': 'cooperatify' } }),
    fetch('https://api.github.com/user/emails', { headers: { Authorization: `Bearer ${tokenJson.access_token}`, 'User-Agent': 'cooperatify' } }),
  ]);
  const user = await userRes.json();
  const emails = emailsRes.ok ? await emailsRes.json() : [];
  const primary = emails.find((e) => e.primary && e.verified)?.email || user.email || null;

  const token = sign({
    sub: String(user.id),
    login: user.login,
    name: user.name || user.login,
    avatar: user.avatar_url,
    email: primary,
    provider: 'github',
  });
  setCookie(res, token);

  // Clear the oauth state cookie
  res.setHeader('Set-Cookie', [
    res.getHeader('Set-Cookie'),
    `coop_oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${process.env.NODE_ENV !== 'development' ? '; Secure' : ''}`,
  ].flat());

  res.statusCode = 302;
  res.setHeader('Location', '/');
  res.end();
}
