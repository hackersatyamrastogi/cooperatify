// GET /api/auth/google-callback — exchanges Google code, sets signed session cookie
import { sign, setCookie, readCookie } from '../_session.js';
import { recordUser, recordEvent } from '../_store.js';

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}

export default async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.statusCode = 302;
    res.setHeader('Location', '/?auth_error=google_not_configured');
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = readCookie(req, 'coop_goog_state');
  if (!code || !state || state !== savedState) {
    res.statusCode = 302;
    res.setHeader('Location', '/?auth_error=google_state_invalid');
    return res.end();
  }

  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = `${proto}://${host}/api/auth/google-callback`;

  const body = new URLSearchParams({
    code, client_id: clientId, client_secret: clientSecret,
    redirect_uri: redirectUri, grant_type: 'authorization_code',
  });
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.id_token) {
    res.statusCode = 302;
    res.setHeader('Location', '/?auth_error=google_exchange_failed');
    return res.end();
  }

  // Decode the ID token payload (signature verification skipped — this runs over TLS from Google directly,
  // and the token was just issued to our registered client_id. For defense in depth, verify via jwks_uri later.)
  let claims = {};
  try {
    const payload = tokenJson.id_token.split('.')[1];
    claims = JSON.parse(b64urlDecode(payload));
  } catch {
    res.statusCode = 302;
    res.setHeader('Location', '/?auth_error=google_id_token_invalid');
    return res.end();
  }

  if (claims.aud !== clientId) {
    res.statusCode = 302;
    res.setHeader('Location', '/?auth_error=google_audience_mismatch');
    return res.end();
  }
  if (!claims.email_verified) {
    res.statusCode = 302;
    res.setHeader('Location', '/?auth_error=google_email_unverified');
    return res.end();
  }

  const sessionUser = {
    sub: `google:${claims.sub}`,
    id: `google:${claims.sub}`,
    login: claims.email,
    name: claims.name || claims.email,
    avatar: claims.picture || '',
    email: claims.email,
    provider: 'google',
  };
  const token = sign(sessionUser);
  setCookie(res, token);
  try {
    await recordUser(sessionUser);
    await recordEvent('login', { provider: 'google' }, sessionUser);
  } catch {}

  const secureFlag = process.env.NODE_ENV !== 'development' && !process.env.COOP_INSECURE_COOKIES ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    res.getHeader('Set-Cookie'),
    `coop_goog_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureFlag}`,
  ].flat());

  res.statusCode = 302;
  res.setHeader('Location', '/');
  res.end();
}
