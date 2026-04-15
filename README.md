# corporatefilter.ai

AI-powered corporate language translator — type the real thing, send the right thing.
Turns unfiltered thoughts (in 7 languages) into polished Slack, Email, or LinkedIn messages.

**Stack:** static HTML/CSS/JS + Vercel serverless functions (`/api/chat`, `/api/translate`, `/api/auth/*`) calling Claude Sonnet 4.6.

## Run locally

```bash
node dev-server.mjs
# or: npm run dev (uses Vercel CLI)
```

Loads `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
SESSION_SECRET=<random 48+ bytes>
GITHUB_CLIENT_ID=<github oauth app>
GITHUB_CLIENT_SECRET=<github oauth app>
COOP_INSECURE_COOKIES=1   # dev only — drops Secure on cookies over http
```

## Deploy

Pushes to `main` auto-deploy via the Vercel GitHub integration.
Production is https://cooperatify.vercel.app (custom domain pending).

## Features

- **Chat** — multi-turn, tone/format per-conversation, local-first storage
- **Translate / Reply** modes (Reply supports screenshots via Claude vision)
- **Tone**: Gentle · Balanced · Spicy
- **Format**: Slack · Email · LinkedIn
- **Voice input** (Web Speech API) · drag/paste screenshots · Enter-to-send
- **Sign in with GitHub** (HMAC-signed cookie session)
- **Dark / light theme** toggle
- **Chrome MV3 extension** at `extension/` — right-click rewrite in Gmail, Slack, LinkedIn
