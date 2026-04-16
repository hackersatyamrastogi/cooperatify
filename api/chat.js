// Vercel Serverless - POST /api/chat
// Multi-turn conversation with SSE streaming support.
// Body: { mode, format, tone, messages:[{role,content}], screenshot?, stream? }
import { currentUser } from './_session.js';
import { recordEvent } from './_store.js';

const FORMATS = {
  slack: 'Slack message: short, direct, no subject line, plain prose, emoji OK if they help.',
  email: 'Email: first line "Subject: ...", blank line, then body with greeting and sign-off.',
  linkedin: 'LinkedIn post or DM: professional, slightly warm, clear structure, no hashtags unless obvious.',
  teams: 'Microsoft Teams message: concise, professional, plain text, no markdown.',
  discord: 'Discord message: casual-professional, short, basic markdown OK.',
  whatsapp: 'WhatsApp message: brief, conversational, emoji OK sparingly.',
  telegram: 'Telegram message: concise, bold/italic markdown OK.',
  chat: 'Chat message: short, direct, conversational, no formality needed.',
  message: 'Short professional message: clear, direct, context-appropriate.',
};

const TONES = {
  gentle: 'Gentle: soft and empathetic, avoid anything blunt, cushion any critique, lead with appreciation.',
  balanced: 'Balanced: professional and natural, the sweet spot between firm and friendly.',
  spicy: 'Spicy: bold and direct, do not sugarcoat, but remain professional (no insults, no profanity).',
};

function systemPrompt(mode, format, tone) {
  const fmt = FORMATS[format] || FORMATS.slack;
  const tn = TONES[tone] || TONES.balanced;
  const task =
    mode === 'reply'
      ? 'You read the user-provided message (text or screenshot) and draft a response to it.'
      : 'You rewrite the user-provided text into polished professional communication (a rewrite of their own words, not a reply).';
  return [
    'You are corporatefilter.ai, an AI corporate-language translator operating in a chat interface.',
    task,
    'The user may write in English, Hindi, Hinglish, Spanish, Portuguese, French, or Mandarin. Always output in English unless they explicitly request another language.',
    'When the user asks for tweaks ("make it shorter", "sharper tone", "add a follow-up line"), adjust the most recent draft accordingly.',
    `Target format: ${fmt}`,
    `Target tone: ${tn}`,
    'Output ONLY the drafted message. No preamble, no explanations, no options, no markdown code fences. If the user asks a meta-question about their message (e.g., "is this too harsh?"), answer briefly then provide the revised draft.',
    'NEVER use em dash, en dash, or tilde characters in the output. Use commas, periods, or rephrase instead.',
  ].join('\n');
}

const ALLOWED_ORIGINS = [
  'https://www.corporatefilter.ai', 'https://corporatefilter.ai',
  'https://cooperatify.vercel.app', 'http://localhost:3000',
];
function cors(req, res) {
  const origin = req.headers?.origin || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) || origin.startsWith('chrome-extension://');
  res.setHeader('access-control-allow-origin', allowed ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
}

function buildMessages(messages, screenshot) {
  const mapped = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: [{ type: 'text', text: m.content }] }));
  if (screenshot && mapped.length && mapped[mapped.length - 1].role === 'user') {
    const m = /^data:(image\/[^;]+);base64,(.+)$/.exec(screenshot);
    if (m) {
      mapped[mapped.length - 1].content.unshift({
        type: 'image',
        source: { type: 'base64', media_type: m[1], data: m[2] },
      });
    }
  }
  return mapped;
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  try {
    const { mode = 'translate', format = 'slack', tone = 'balanced', messages = [], screenshot = null, stream: wantStream = false } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ error: 'messages required' });

    const mapped = buildMessages(messages, screenshot);
    const apiBody = {
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt(mode, format, tone),
      messages: mapped,
      stream: Boolean(wantStream),
    };

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(apiBody),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err.error?.message || 'Upstream error' });
    }

    // Streaming mode: pipe SSE chunks to client
    if (wantStream) {
      res.setHeader('content-type', 'text/event-stream; charset=utf-8');
      res.setHeader('cache-control', 'no-cache');
      res.setHeader('connection', 'keep-alive');
      res.statusCode = 200;

      let fullText = '';
      let usage = null;
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const evt = JSON.parse(data);
              if (evt.type === 'content_block_delta' && evt.delta?.text) {
                fullText += evt.delta.text;
                res.write(`data: ${JSON.stringify({ type: 'delta', text: evt.delta.text })}\n\n`);
              }
              if (evt.type === 'message_delta' && evt.usage) {
                usage = { ...usage, ...evt.usage };
              }
              if (evt.type === 'message_start' && evt.message?.usage) {
                usage = evt.message.usage;
              }
            } catch {}
          }
        }
      } catch (e) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ type: 'done', output: fullText, usage })}\n\n`);
      res.end();

      try {
        await recordEvent('chat', {
          mode, format, tone, turns: mapped.length,
          hasScreenshot: Boolean(screenshot),
          inputTokens: usage?.input_tokens || 0,
          outputTokens: usage?.output_tokens || 0,
        }, currentUser(req));
      } catch {}
      return;
    }

    // Non-streaming mode (backward compat for extension + Slack)
    const data = await r.json();
    const output = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    const usage = data.usage || null;
    try {
      await recordEvent('chat', {
        mode, format, tone, turns: mapped.length,
        hasScreenshot: Boolean(screenshot),
        inputTokens: usage?.input_tokens || 0,
        outputTokens: usage?.output_tokens || 0,
      }, currentUser(req));
    } catch {}
    res.status(200).json({ output, usage });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
}
