/**
 * Airwave service worker.
 *
 * Scope is deliberately narrow: this only makes the static shell (the lobby
 * page, icons, manifest) load instantly and work offline enough to show a
 * "you're offline" state. It never caches /api/* and never touches the
 * LiveKit WebSocket — live audio always needs a real network connection, and
 * pretending otherwise would just hide a real problem from the user.
 */

const CACHE_VERSION = 'airwave-shell-v1';
const SHELL_URLS = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses or anything LiveKit-adjacent — this data is
  // live and must always come from the network.
  if (url.pathname.startsWith('/api/')) return;

  // Network-first for navigations, so a deploy is visible immediately;
  // falls back to the cached shell only when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_VERSION).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Cache-first for static assets (fonts, icons, chunks) — fall back to
  // network and quietly cache the result for next time.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
