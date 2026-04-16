// Simple file-backed JSON store for dev analytics.
// NOTE: writes to local FS — does NOT persist on Vercel serverless.
// Swap to Vercel KV / Upstash Redis for production.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', '.data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

const EMPTY = { users: [], events: [] };

async function load() {
  try {
    const raw = await readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return { users: parsed.users || [], events: parsed.events || [] };
  } catch {
    return structuredClone(EMPTY);
  }
}

async function save(data) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(data, null, 2));
}

// Record (or upsert) a user on sign-in.
export async function recordUser({ id, email, name, provider, avatar }) {
  if (!id || !email) return;
  const db = await load();
  const now = Date.now();
  const existing = db.users.find((u) => u.id === id);
  if (existing) {
    existing.lastSignIn = now;
    existing.signInCount = (existing.signInCount || 0) + 1;
    existing.name = name || existing.name;
    existing.avatar = avatar || existing.avatar;
  } else {
    db.users.push({ id, email, name, provider, avatar, created: now, lastSignIn: now, signInCount: 1 });
  }
  await save(db);
}

// Record any app event (login, logout, chat, translate, etc.)
export async function recordEvent(type, meta = {}, user = null) {
  const db = await load();
  db.events.push({
    type,
    ts: Date.now(),
    userId: user?.id || user?.sub || null,
    email: user?.email || null,
    meta,
  });
  // Soft cap: keep last 50k events (rolling)
  if (db.events.length > 50000) db.events.splice(0, db.events.length - 50000);
  await save(db);
}

export async function getStore() {
  return load();
}

export function isAdmin(user) {
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!admins.length) return false;
  const email = (user?.email || user?.login || '').toLowerCase();
  return !!email && admins.includes(email);
}
