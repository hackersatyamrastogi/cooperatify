// Catch-all slack handler: /api/slack/commands, /events, /interactions, /manifest
import commandsHandler from './_commands.js';
import eventsHandler from './_events.js';
import interactionsHandler from './_interactions.js';
import manifestHandler from './_manifest.js';
import oauthHandler from './_oauth.js';

const routes = {
  commands: commandsHandler,
  events: eventsHandler,
  interactions: interactionsHandler,
  manifest: manifestHandler,
  oauth: oauthHandler,
};

export default function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const segments = url.pathname.replace(/^\/api\/slack\/?/, '').split('/').filter(Boolean);
  const route = segments[0] || '';
  const fn = routes[route];
  if (!fn) return res.status(404).json({ error: 'not found' });
  return fn(req, res);
}
