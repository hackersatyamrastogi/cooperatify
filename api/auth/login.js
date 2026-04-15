// GET /api/auth/login — kicks off GitHub OAuth
import crypto from 'node:crypto';
import { setCookie } from '../_session.js';

export default function handler(req, res) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'GITHUB_CLIENT_ID not set' });

  const state = crypto.randomBytes(16).toString('hex');
  // Store state in a short-lived cookie — verified in callback.
  res.setHeader('Set-Cookie', [
    `coop_oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${process.env.NODE_ENV !== 'development' ? '; Secure' : ''}`,
  ]);

  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = `${proto}://${host}/api/auth/callback`;

  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'read:user user:email');
  url.searchParams.set('state', state);
  url.searchParams.set('allow_signup', 'true');

  res.statusCode = 302;
  res.setHeader('Location', url.toString());
  res.end();
}
