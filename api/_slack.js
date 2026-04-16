// Shared Slack helpers: signature verification, API calls, slash-command + interaction logic.
import crypto from 'node:crypto';
import { recordEvent } from './_store.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export function verifySlackSignature(rawBody, headers, signingSecret = process.env.SLACK_SIGNING_SECRET) {
  if (!signingSecret) return false;
  const ts = headers['x-slack-request-timestamp'];
  const sig = headers['x-slack-signature'];
  if (!ts || !sig) return false;
  // Reject if timestamp is older than 5 minutes (replay protection)
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 60 * 5) return false;
  const base = `v0:${ts}:${rawBody}`;
  const expected = 'v0=' + crypto.createHmac('sha256', signingSecret).update(base).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig)); } catch { return false; }
}

export async function translateWithClaude({ input, mode = 'translate', tone = 'balanced', format = 'slack' }) {
  const system = [
    'You are corporatefilter.ai, an AI corporate-language translator.',
    mode === 'reply'
      ? 'You read the user-provided message and draft a response to it.'
      : 'You rewrite the user-provided text into polished professional communication (a rewrite of their own words).',
    `Target format: Slack message: short, direct, plain prose, emoji only if they help.`,
    `Target tone: ${tone}.`,
    'Output ONLY the final message. No preamble, no options, no markdown code fences.',
    'NEVER use em dash, en dash, or tilde characters in the output. Use commas, periods, or rephrase instead.',
  ].join('\n');
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system,
      messages: [{ role: 'user', content: input }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Claude request failed');
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

// Build a Block Kit response for the ephemeral polished message.
export function resultBlocks({ original, output, tone, format, mode }) {
  return {
    response_type: 'ephemeral',
    text: output,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*corporatefilter.ai · ${mode} · ${tone} · ${format}*` } },
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: output } },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `_Original:_ ${truncate(original, 180)}` }],
      },
      {
        type: 'actions',
        elements: [
          tonePicker('gentle', tone, original, mode, format),
          tonePicker('balanced', tone, original, mode, format),
          tonePicker('spicy', tone, original, mode, format),
        ],
      },
    ],
  };
}

function tonePicker(thisTone, activeTone, original, mode, format) {
  const emoji = { gentle: '🌸', balanced: '⚖️', spicy: '🌶️' }[thisTone];
  return {
    type: 'button',
    text: { type: 'plain_text', text: `${emoji} ${cap(thisTone)}${thisTone === activeTone ? '  ✓' : ''}` },
    style: thisTone === activeTone ? 'primary' : undefined,
    action_id: `retone_${thisTone}`,
    value: JSON.stringify({ tone: thisTone, mode, format, original }),
  };
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);
const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');

// Call a Slack Web API method (requires SLACK_BOT_TOKEN)
export async function slackAPI(method, body = {}) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error('SLACK_BOT_TOKEN not set');
  const r = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`Slack ${method}: ${data.error}`);
  return data;
}

// Handle a DM message to the bot
export async function handleDirectMessage(event) {
  if (event.bot_id || event.subtype) return; // ignore bot messages & system messages
  const text = (event.text || '').trim();
  const channel = event.channel;
  const user = event.user;
  if (!text || !channel) return;

  // Parse optional tone/mode prefix same as slash command
  let tone = 'balanced', mode = 'translate';
  let payload = text;
  const toneMatch = payload.match(/^(gentle|balanced|spicy)[:|]\s*/i);
  if (toneMatch) { tone = toneMatch[1].toLowerCase(); payload = payload.slice(toneMatch[0].length); }
  const modeMatch = payload.match(/^(translate|reply)[:|]\s*/i);
  if (modeMatch) { mode = modeMatch[1].toLowerCase(); payload = payload.slice(modeMatch[0].length); }
  payload = payload.trim();

  if (!payload) {
    await slackAPI('chat.postMessage', {
      channel,
      text: '👋 Just type your unfiltered message and I\'ll rewrite it professionally.\n\nOptional prefixes: `spicy:`, `gentle:`, `reply:`\n\nExample: `spicy: bhai kitni baar samjhaun`',
    });
    return;
  }

  // Show typing indicator
  try { await slackAPI('chat.postMessage', { channel, text: '✨ Rewriting…' }).then((r) => r.ts && slackAPI('chat.delete', { channel, ts: r.ts }).catch(() => {})); } catch {}

  try {
    const output = await translateWithClaude({ input: payload, mode, tone, format: 'slack' });
    const blocks = [
      { type: 'section', text: { type: 'mrkdwn', text: output } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `_${cap(mode)} · ${cap(tone)} · Slack_` }] },
      {
        type: 'actions',
        elements: [
          tonePicker('gentle', tone, payload, mode, 'slack'),
          tonePicker('balanced', tone, payload, mode, 'slack'),
          tonePicker('spicy', tone, payload, mode, 'slack'),
        ],
      },
    ];
    await slackAPI('chat.postMessage', { channel, text: output, blocks });
    try {
      await recordEvent('slack_dm', { mode, tone, format: 'slack' }, { id: `slack:dm:${user}`, email: `${user}@slack`, sub: user });
    } catch {}
  } catch (e) {
    await slackAPI('chat.postMessage', { channel, text: `⚠️ ${e.message}` });
  }
}

// Handle app_home_opened — publish an intro view
export async function handleAppHomeOpened(event) {
  const userId = event.user;
  if (!userId) return;
  await slackAPI('views.publish', {
    user_id: userId,
    view: {
      type: 'home',
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: '🟡 corporatefilter.ai' } },
        { type: 'section', text: { type: 'mrkdwn', text: '*Type the real thing. Send the right thing.*\n\nI rewrite your unfiltered thoughts into polished professional messages.' } },
        { type: 'divider' },
        { type: 'section', text: { type: 'mrkdwn', text: '*How to use:*' } },
        { type: 'section', text: { type: 'mrkdwn', text: '💬 *DM me* just type your raw text and I\'ll rewrite it\n⌨️ *Slash command* `/filter your text here`\n🌶️ *Prefix a tone* `spicy: ye kaam kal tak hona chahiye tha`\n↩️ *Reply mode* `reply: [paste a message you received]`' } },
        { type: 'divider' },
        { type: 'section', text: { type: 'mrkdwn', text: '*Tones:*\n🌸 `gentle:` soft and empathetic\n⚖️ `balanced:` the sweet spot (default)\n🌶️ `spicy:` bold and direct' } },
        { type: 'divider' },
        { type: 'context', elements: [{ type: 'mrkdwn', text: 'Built with Claude · <https://corporatefilter.ai|corporatefilter.ai>' }] },
      ],
    },
  });
}

// Handle app_mention in channels
export async function handleAppMention(event) {
  if (event.bot_id) return;
  const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  const channel = event.channel;
  const ts = event.ts;
  if (!text) {
    await slackAPI('chat.postMessage', { channel, thread_ts: ts, text: 'Tag me with some text and I\'ll rewrite it! Example: `@corporatefilter bhai deadline kal tha`' });
    return;
  }
  try {
    const output = await translateWithClaude({ input: text, mode: 'translate', tone: 'balanced', format: 'slack' });
    await slackAPI('chat.postMessage', { channel, thread_ts: ts, text: output });
  } catch (e) {
    await slackAPI('chat.postMessage', { channel, thread_ts: ts, text: `⚠️ ${e.message}` });
  }
}

// Main slash-command handler. Returns the ephemeral response body.
export async function handleSlashCommand({ text, user_id, team_id, user_name }) {
  const raw = (text || '').trim();
  if (!raw) {
    return {
      response_type: 'ephemeral',
      text: 'Usage: `/filter <your unfiltered message>` and I will rewrite it professionally.',
    };
  }
  // Optional flags: /filter spicy| or /filter reply| can prefix the text
  let tone = 'balanced', mode = 'translate';
  const toneMatch = raw.match(/^(gentle|balanced|spicy)[:|]\s*/i);
  if (toneMatch) { tone = toneMatch[1].toLowerCase(); }
  const modeMatch = raw.replace(toneMatch?.[0] || '', '').match(/^(translate|reply)[:|]\s*/i);
  if (modeMatch) { mode = modeMatch[1].toLowerCase(); }
  const payload = raw.replace(toneMatch?.[0] || '', '').replace(modeMatch?.[0] || '', '').trim();
  if (!payload) {
    return { response_type: 'ephemeral', text: 'Add some text after the options.' };
  }
  try {
    const output = await translateWithClaude({ input: payload, mode, tone, format: 'slack' });
    try {
      await recordEvent('slack_command', { mode, tone, format: 'slack', team_id }, {
        id: `slack:${team_id}:${user_id}`, email: `${user_name}@slack.${team_id}`, sub: user_id,
      });
    } catch {}
    return resultBlocks({ original: payload, output, tone, format: 'slack', mode });
  } catch (e) {
    return { response_type: 'ephemeral', text: `⚠️ ${e.message}` };
  }
}

// Handle retone_* button clicks.
export function handleBlockActions(payload) {
  const action = payload.actions?.[0];
  if (!action || !action.action_id?.startsWith('retone_')) return null;
  const responseUrl = payload.response_url;

  // Ack immediately with loading state, process async
  processRetone(payload, action, responseUrl).catch(console.error);

  // Return immediate ack (replaces message with "Rewriting...")
  return { replace_original: true, text: 'Rewriting in a different tone...' };
}

async function processRetone(payload, action, responseUrl) {
  const ctx = JSON.parse(action.value);
  const tone = ctx.tone;
  try {
    const output = await translateWithClaude({ input: ctx.original, mode: ctx.mode, tone, format: ctx.format });
    try {
      await recordEvent('slack_retone', { mode: ctx.mode, tone, format: ctx.format }, {
        id: `slack:${payload.team?.id}:${payload.user?.id}`, email: `${payload.user?.name}@slack.${payload.team?.id}`, sub: payload.user?.id,
      });
    } catch {}
    const body = { replace_original: true, ...resultBlocks({ original: ctx.original, output, tone, format: ctx.format, mode: ctx.mode }) };
    if (responseUrl) {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
  } catch (e) {
    if (responseUrl) {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ replace_original: false, response_type: 'ephemeral', text: 'Error: ' + e.message }),
      });
    }
  }
}

export function appManifest({ host } = {}) {
  // Slack requires public HTTPS URLs. When running on localhost, fall back to the prod URL.
  // With Socket Mode enabled these request URLs aren't actually called, but Slack still validates the format.
  const isLocal = !host || /^(localhost|127\.|\[::1\])/.test(host);
  const reqUrl = isLocal ? 'https://cooperatify.vercel.app' : `https://${host}`;
  return {
    display_information: {
      name: 'corporatefilter.ai',
      description: 'Type the real thing. Send the right thing. AI corporate-language translator.',
      background_color: '#000000',
    },
    features: {
      app_home: { home_tab_enabled: true, messages_tab_enabled: true, messages_tab_read_only_enabled: false },
      bot_user: { display_name: 'corporatefilter', always_online: true },
      slash_commands: [
        {
          command: '/filter',
          description: 'Rewrite unfiltered text into something you can actually send',
          usage_hint: '[tone:] [mode:] your text',
          should_escape: false,
        },
      ],
    },
    oauth_config: {
      redirect_urls: [`${reqUrl}/api/slack/oauth`],
      scopes: { bot: ['commands', 'chat:write', 'chat:write.public', 'users:read', 'im:history', 'im:read', 'im:write', 'app_mentions:read'] },
    },
    settings: {
      event_subscriptions: {
        request_url: `${reqUrl}/api/slack/events`,
        bot_events: ['message.im', 'app_mention', 'app_home_opened'],
      },
      interactivity: { is_enabled: true, request_url: `${reqUrl}/api/slack/interactions` },
      org_deploy_enabled: false,
      socket_mode_enabled: true,
      token_rotation_enabled: false,
    },
  };
}
