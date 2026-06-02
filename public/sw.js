const CACHE = 'runlytics-v2';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

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
  // Never cache API calls — always go to network
  if (e.request.url.includes('/api/')) return;

  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        // Check TTL on cached response
        if (cached) {
          const cachedAt = cached.headers.get('sw-cached-at');
          if (cachedAt && Date.now() - Number(cachedAt) < CACHE_TTL_MS) {
            // Serve from cache but refresh in background
            fetch(e.request).then(res => {
              if (res.ok) putWithTimestamp(cache, e.request, res);
            }).catch(() => {});
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
