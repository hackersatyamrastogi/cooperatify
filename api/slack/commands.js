// POST /api/slack/commands — Slack slash command (HTTP mode, used in production)
import { verifySlackSignature, handleSlashCommand } from '../_slack.js';
import querystring from 'node:querystring';

// This endpoint receives x-www-form-urlencoded bodies. Override the dev-server shim by consuming the raw body.
export default async function handler(req, res) {
  // Raw body is not provided by the default shim; in prod Vercel gives us req.body as-parsed.
  // In both cases we need to verify signature against the raw body, so the dev-server passes it via req._rawBody.
  const raw = req._rawBody || (typeof req.body === 'string' ? req.body : querystring.stringify(req.body || {}));
  if (!verifySlackSignature(raw, req.headers)) {
    return res.status(401).end('invalid signature');
  }
  const parsed = typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : querystring.parse(raw);
  const { text, user_id, team_id, user_name, command } = parsed;

  // Ack within 3s: respond immediately with the processed output if fast enough, otherwise use response_url.
  const response = await handleSlashCommand({ text, user_id, team_id, user_name, command });
  res.setHeader('content-type', 'application/json');
  res.status(200).end(JSON.stringify(response));
}
