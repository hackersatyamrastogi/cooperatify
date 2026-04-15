# cooperatify

Clone of https://cooperatify.pro/ — AI corporate-language translator.

**Stack:** static HTML/CSS/JS + Cloudflare Pages Function (`functions/api/translate.js`) calling the Anthropic API.

## Run locally

```bash
npx wrangler pages dev . --compatibility-date=2025-01-01
```

Set `ANTHROPIC_API_KEY` in `.dev.vars`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

## Deploy (Cloudflare Pages, AI_Satyam account)

```bash
npx wrangler pages deploy . --project-name cooperatify
# set prod secret
npx wrangler pages secret put ANTHROPIC_API_KEY --project-name cooperatify
```

## Features wired

- Translate / Reply tabs
- Format: Slack / Email / LinkedIn
- Tone: Gentle / Balanced / Spicy (with live hint)
- Example chips, voice input (Web Speech API), screenshot paste/drop (vision in Reply mode)
- Local history in `localStorage`
