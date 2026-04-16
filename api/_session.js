// Tiny signed-cookie session helper — zero deps beyond node:crypto.
import crypto from 'node:crypto';

const COOKIE = 'coop_sess';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

export function sign(payload) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not set');
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + MAX_AGE }));
  const sig = b64url(crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

export function verify(token) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !token) return null;
  const [h, b, s] = token.split('.');
  if (!h || !b || !s) return null;
  const expect = b64url(crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest());
  if (!crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(s))) return null;
  try {
    const payload = JSON.parse(fromB64url(b).toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function readCookie(req, name = COOKIE) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

export function setCookie(res, value, { maxAge = MAX_AGE, path = '/' } = {}) {
  const attrs = [
    `${COOKIE}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (!process.env.COOP_INSECURE_COOKIES) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${process.env.NODE_ENV !== 'development' ? '; Secure' : ''}`);
}

export function currentUser(req) {
  return verify(readCookie(req));
}
