// GET /api/slack/oauth - Slack OAuth callback after workspace install
import { recordEvent } from '../_store.js';

const HOME = process.env.AUTH_BASE_URL || 'https://www.corporatefilter.ai';

function redirect(res, path) {
  res.statusCode = 302;
  res.setHeader('Location', HOME + path);
  res.end();
}

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) return redirect(res, '/?slack_error=' + encodeURIComponent(error));
  if (!code) return redirect(res, '/?slack_error=no_code');

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) return redirect(res, '/?slack_error=not_configured');

  try {
    const r = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret }).toString(),
    });
    const data = await r.json();

    if (!data.ok) return redirect(res, '/?slack_error=' + encodeURIComponent(data.error || 'exchange_failed'));

    try {
      await recordEvent('slack_install', {
        team_id: data.team?.id,
        team_name: data.team?.name,
        bot_user_id: data.bot_user_id,
        scope: data.scope,
      }, { id: 'slack:' + (data.team?.id || 'unknown'), email: (data.team?.name || '') + '@slack' });
    } catch {}

    redirect(res, '/?slack_installed=' + encodeURIComponent(data.team?.name || 'your workspace'));
  } catch (err) {
    redirect(res, '/?slack_error=' + encodeURIComponent(err.message));
  }
}
