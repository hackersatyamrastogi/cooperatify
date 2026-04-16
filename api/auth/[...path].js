// Catch-all auth handler: /api/auth/login, /callback, /google, /google-callback, /me, /config, /dev, /logout
// Consolidated to stay under Vercel Hobby's 12-function limit.

import loginHandler from './_login.js';
import callbackHandler from './_callback.js';
import googleHandler from './_google.js';
import googleCallbackHandler from './_google-callback.js';
import meHandler from './_me.js';
import configHandler from './_config.js';
import devHandler from './_dev.js';
import logoutHandler from './_logout.js';

const routes = {
  login: loginHandler,
  callback: callbackHandler,
  google: googleHandler,
  'google-callback': googleCallbackHandler,
  me: meHandler,
  config: configHandler,
  dev: devHandler,
  logout: logoutHandler,
};

export default function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const segments = url.pathname.replace(/^\/api\/auth\/?/, '').split('/').filter(Boolean);
  const route = segments[0] || 'me';
  const fn = routes[route];
  if (!fn) return res.status(404).json({ error: 'not found' });
  return fn(req, res);
}
