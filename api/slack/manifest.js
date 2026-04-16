// GET /api/slack/manifest — returns the Slack app manifest JSON
import { appManifest } from '../_slack.js';

export default function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.status(200).end(JSON.stringify(appManifest({ host }), null, 2));
}
