// Zero-dep local dev server — serves static files + /api/translate
// Usage: node dev-server.mjs  (loads .env.local automatically)

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

// Load .env.local
const envPath = path.join(__dirname, '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Lazy-import Vercel-style handlers from /api/*.js and shim req/res.
const handlerCache = new Map();
async function loadHandler(name) {
  if (handlerCache.has(name)) return handlerCache.get(name);
  try {
    const mod = await import(`./api/${name}.js`);
    handlerCache.set(name, mod.default);
    return mod.default;
  } catch { return null; }
}
async function callApi(name, req, res, body) {
  const h = await loadHandler(name);
  if (!h) { res.writeHead(404).end('api handler not found'); return; }
  let parsed = {};
  try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = {}; }
  const shimReq = Object.assign(req, { body: parsed });
  const shimRes = Object.assign(res, {
    status(code) { this.statusCode = code; return this; },
    json(obj) {
      this.setHeader('content-type', 'application/json; charset=utf-8');
      this.end(JSON.stringify(obj));
      return this;
    },
  });
  return h(shimReq, shimRes);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  const apiMatch = url.pathname.match(/^\/api\/([A-Za-z0-9_\-/]+)$/);
  if (apiMatch) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    return callApi(apiMatch[1], req, res, Buffer.concat(chunks).toString('utf8'));
  }

  let filePath = path.join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(__dirname)) return res.writeHead(403).end('forbidden');
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
});

server.listen(PORT, () => {
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  console.log(`corporatefilter.ai dev → http://localhost:${PORT}  (ANTHROPIC_API_KEY: ${hasKey ? 'ok' : 'MISSING'})`);
});
