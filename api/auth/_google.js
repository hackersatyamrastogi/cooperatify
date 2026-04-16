// GET /api/auth/google — kicks off Google OAuth
import crypto from 'node:crypto';

export default function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.statusCode = 302;
    res.setHeader('Location', '/?auth_error=google_not_configured');
    return res.end();
  }

  const state = crypto.randomBytes(16).toString('hex');
  const secureFlag = process.env.NODE_ENV !== 'development' && !process.env.COOP_INSECURE_COOKIES ? '; Secure' : '';
  res.setHeader('Set-Cookie', [`coop_goog_state=${state}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${secureFlag}`]);

  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const isLocal = host.startsWith('localhost') || host.startsWith('127.');
  const baseUrl = isLocal ? ('http://' + host) : (process.env.AUTH_BASE_URL || 'https://www.corporatefilter.ai');
  const redirectUri = baseUrl + '/api/auth/google-callback';

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'select_account');

  res.statusCode = 302;
  res.setHeader('Location', url.toString());
  res.end();
}
