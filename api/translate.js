// Vercel Serverless Function — POST /api/translate
// Requires env var ANTHROPIC_API_KEY (set via `vercel env add` or .env.local)

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
      ? 'You read the user-provided message (text or screenshot) and craft a response to it.'
      : 'You rewrite the user-provided text into polished professional communication (not a reply, a rewrite of their own words).';
  return [
    'You are corporatefilter.ai, an AI corporate-language translator.',
    task,
    'The user may write in English, Hindi, Hinglish, Spanish, Portuguese, French, or Mandarin. Always output in English unless they explicitly ask otherwise.',
    `Target format: ${fmt}`,
    `Target tone: ${tn}`,
    'Output ONLY the final message. No preamble, no explanations, no options, no markdown fences.',
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

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  try {
    const { mode, format, tone, input, screenshot } = req.body || {};
    if (!input && !screenshot) return res.status(400).json({ error: 'Empty input' });

    const content = [];
    if (screenshot && mode === 'reply') {
      const m = /^data:(image\/[^;]+);base64,(.+)$/.exec(screenshot);
      if (m) content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
    }
    content.push({ type: 'text', text: input || '(see attached screenshot)' });

    const body = {
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: systemPrompt(mode, format, tone),
      messages: [{ role: 'user', content }],
    };

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.error?.message || 'Upstream error' });
    const output = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    res.status(200).json({ output });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
}
