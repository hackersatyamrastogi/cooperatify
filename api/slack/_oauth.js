// GET /api/slack/oauth - Slack OAuth callback after workspace install
import { recordEvent, recordUser } from '../_store.js';

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.statusCode = 302;
    res.setHeader('Location', '/?slack_error=' + encodeURIComponent(error));
    return res.end();
  }

  if (!code) {
    res.statusCode = 302;
    res.setHeader('Location', '/?slack_error=no_code');
    return res.end();
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.statusCode = 302;
    res.setHeader('Location', '/?slack_error=not_configured');
    return res.end();
  }

  try {
    const r = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret }).toString(),
    });
    const data = await r.json();

    if (!data.ok) {
      res.statusCode = 302;
      res.setHeader('Location', '/?slack_error=' + encodeURIComponent(data.error || 'exchange_failed'));
      return res.end();
    }

    // Record the install
    try {
      await recordEvent('slack_install', {
        team_id: data.team?.id,
        team_name: data.team?.name,
        bot_user_id: data.bot_user_id,
        scope: data.scope,
      }, { id: 'slack:' + (data.team?.id || 'unknown'), email: (data.team?.name || '') + '@slack' });
    } catch {}

    // Redirect to success page
    res.statusCode = 302;
    res.setHeader('Location', '/?slack_installed=' + encodeURIComponent(data.team?.name || 'your workspace'));
    res.end();
  } catch (err) {
    res.statusCode = 302;
    res.setHeader('Location', '/?slack_error=' + encodeURIComponent(err.message));
    res.end();
  }
}
