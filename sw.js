const CACHE = 'cf-v1';
const STATIC = ['/', '/styles.css', '/app.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const clone = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, clone)); }
      return r;
    }).catch(() => caches.match(e.request))
  );
});
