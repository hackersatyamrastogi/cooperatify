// Catch-all admin handler: /api/admin/stats, /export
import statsHandler from './_stats.js';
import exportHandler from './_export.js';

const routes = {
  stats: statsHandler,
  export: exportHandler,
};

export default function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const segments = url.pathname.replace(/^\/api\/admin\/?/, '').split('/').filter(Boolean);
  const route = segments[0] || 'stats';
  const fn = routes[route];
  if (!fn) return res.status(404).json({ error: 'not found' });
  return fn(req, res);
}
