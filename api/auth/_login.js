// GET /api/auth/login — kicks off GitHub OAuth
import crypto from 'node:crypto';
import { setCookie } from '../_session.js';

export default function handler(req, res) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    // Graceful fallback: redirect to the app with a banner so the user never sees a raw 500.
    res.statusCode = 302;
    res.setHeader('Location', '/?auth_error=github_not_configured');
    return res.end();
  }

  const state = crypto.randomBytes(16).toString('hex');
  // Store state in a short-lived cookie — verified in callback.
  res.setHeader('Set-Cookie', [
    `coop_oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${process.env.NODE_ENV !== 'development' && !process.env.COOP_INSECURE_COOKIES ? '; Secure' : ''}`,
  ]);

  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const isLocal = host.startsWith('localhost') || host.startsWith('127.');
  const baseUrl = isLocal ? ('http://' + host) : (process.env.AUTH_BASE_URL || 'https://www.corporatefilter.ai');
  const redirectUri = baseUrl + '/api/auth/callback';

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
