// POST /api/slack/events — Slack Events API (URL verification + event dispatch for HTTP mode)
import { verifySlackSignature, handleDirectMessage, handleAppHomeOpened, handleAppMention } from '../_slack.js';

export default async function handler(req, res) {
  // URL verification challenge (Slack sends this when you first save the events URL)
  if (req.body?.type === 'url_verification') {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // Signature verification for real events
  const raw = req._rawBody || JSON.stringify(req.body || {});
  if (!verifySlackSignature(raw, req.headers)) {
    return res.status(401).end('invalid signature');
  }

  const event = req.body?.event;
  if (!event) return res.status(200).end();

  // Ack immediately, handle async
  res.status(200).end();

  try {
    if (event.type === 'message' && event.channel_type === 'im') {
      await handleDirectMessage(event);
    } else if (event.type === 'app_home_opened') {
      await handleAppHomeOpened(event);
    } else if (event.type === 'app_mention') {
      await handleAppMention(event);
    }
  } catch (e) {
    console.error('[slack] event handler error:', e.message);
  }
}
