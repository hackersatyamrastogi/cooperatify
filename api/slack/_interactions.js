// POST /api/slack/interactions — Slack interactivity endpoint (buttons, shortcuts, modals)
import { verifySlackSignature, handleBlockActions } from '../_slack.js';
import querystring from 'node:querystring';

export default async function handler(req, res) {
  const raw = req._rawBody || (typeof req.body === 'string' ? req.body : querystring.stringify(req.body || {}));
  if (!verifySlackSignature(raw, req.headers)) {
    return res.status(401).end('invalid signature');
  }
  const parsed = typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : querystring.parse(raw);
  let payload;
  try { payload = JSON.parse(parsed.payload); } catch { return res.status(400).end('bad payload'); }

  if (payload.type === 'block_actions') {
    const body = await handleBlockActions(payload);
    res.setHeader('content-type', 'application/json');
    return res.status(200).end(JSON.stringify(body || {}));
  }
  // Unhandled types: just 200
  res.status(200).end();
}
