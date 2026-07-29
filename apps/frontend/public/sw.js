/*
 * JESS MOVE service worker.
 *
 * The rule that shapes this file: **nothing personal is ever cached.**
 *
 * A movement app is used on shared devices — a family tablet, a phone
 * handed to a child, a kiosk in a care home. A service worker that caches
 * an API response containing a person's profile, their guardian's summary
 * or a clinical flag leaves that data on disk for whoever opens the browser
 * next, surviving a logout it never hears about.
 *
 * So the split is absolute:
 *   - the app shell, styles, fonts and icons  → cached, served offline
 *   - anything under /api                     → network only, never stored
 *   - anything with an Authorization header   → network only, never stored
 *
 * That costs offline capability for personal screens, which is the correct
 * trade. The marketing site, the policies and the offline page work with no
 * signal; your data does not appear without a network.
 */

const VERSION = 'jm-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = '/offline';

/* Pages worth having without a signal. Deliberately small — precaching the
   whole site would download megabytes on first visit over a mobile
   connection, which is the opposite of helpful. */
const SHELL = [
  '/',
  OFFLINE_URL,
  '/how-it-works',
  '/policies',
  '/privacy',
  '/terms',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll is atomic: one 404 and nothing is cached. Fetch individually
      // so a single missing route cannot break the whole install.
      await Promise.all(
        SHELL.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'reload' });
            if (response.ok) await cache.put(url, response);
          } catch {
            /* offline at install time — the runtime handler will fill it in */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/** True for anything that could carry personal data. Errs towards true. */
function isPersonal(request) {
  const url = new URL(request.url);
  return (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/console') ||
    url.pathname.startsWith('/account') ||
    url.searchParams.has('token') ||
    request.headers.has('authorization') ||
    request.headers.has('cookie')
  );
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never touch anything that is not a plain GET. A cached POST would be
  // meaningless and a replayed one would be dangerous.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin requests are left entirely alone.
  if (url.origin !== self.location.origin) return;

  // Personal surfaces: straight to the network, and nothing is written.
  if (isPersonal(request)) {
    event.respondWith(fetch(request));
    return;
  }

  // Static assets are content-hashed by Next, so cache-first is safe and a
  // stale response is impossible — a changed file has a changed URL.
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(ASSET_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  // Pages: network first, so a visitor always sees current content, with
  // the cache as the fallback when the network is not there.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
          return new Response('Offline', {
            status: 503,
            headers: { 'content-type': 'text/plain' },
          });
        }
      })(),
    );
  }
});

/* The page asks the waiting worker to take over when the person chooses to
   update. Reloading under them mid-task is rude, so it is never automatic. */
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
