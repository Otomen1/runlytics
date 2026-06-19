const CACHE = 'runlytics-v4';
const HTML_TTL_MS  = 60 * 60 * 1000;        // 1 hour for HTML (catches new deploys quickly)
const ASSET_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for hashed JS/CSS bundles

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.add('/')).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(self.location.origin)) return;
  if (e.request.url.includes('/api/')) return;

  // HTML: network-first so new deployments are picked up within 1 hour
  const isHtml = e.request.headers.get('accept')?.includes('text/html') ||
                 e.request.url === self.location.origin + '/';

  if (isHtml) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            caches.open(CACHE).then(c => putWithTimestamp(c, e.request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.open(CACHE).then(c => c.match(e.request)))
    );
    return;
  }

  // Assets (JS/CSS/images): stale-while-revalidate with longer TTL
  const ttl = e.request.url.match(/\.[a-f0-9]{8}\.(js|css)/) ? ASSET_TTL_MS : HTML_TTL_MS;

  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        if (cached) {
          const cachedAt = cached.headers.get('sw-cached-at');
          if (cachedAt && Date.now() - Number(cachedAt) < ttl) {
            const bg = fetch(e.request).then(res => {
              if (res.ok) putWithTimestamp(cache, e.request, res);
            }).catch(() => {});
            e.waitUntil(bg); // keep SW alive until background update completes
            return cached;
          }
        }
        return fetch(e.request).then(res => {
          if (res.ok) putWithTimestamp(cache, e.request, res.clone());
          return res;
        }).catch(() => cached);
      })
    )
  );
});

function putWithTimestamp(cache, request, response) {
  const headers = new Headers(response.headers);
  headers.set('sw-cached-at', String(Date.now()));
  const stamped = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  cache.put(request, stamped);
}
