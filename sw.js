// Bump CACHE when any shell file changes, or clients keep serving the old copy.
const CACHE = 'focus-flow-v2';

// Relative to the service worker's scope, so this works from a GitHub Pages subpath.
const SHELL = [
  './',
  'index.html',
  'style.css',
  'script.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: answer instantly from cache (so the app opens offline and
// with no spinner), but refresh the cached copy in the background on every online
// load. A deployed update is therefore picked up on the next launch automatically,
// without needing the CACHE version bumped for every edit.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(req).then(hit => {
        const network = fetch(req)
          .then(res => {
            if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);

        // Cached copy wins the race; the fetch above still runs and updates the cache.
        if (hit) return hit;

        return network.then(res => {
          if (res) return res;
          // Offline with nothing cached: any page load still gets the app shell.
          if (req.mode === 'navigate') return cache.match('index.html');
          return Response.error();
        });
      })
    )
  );
});
