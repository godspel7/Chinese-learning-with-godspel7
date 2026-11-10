// Service worker: từ điển & dữ liệu cache-first, giao diện network-first.
const DATA_CACHE = 'data-v1';
const APP_CACHE = 'app-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => ![DATA_CACHE, APP_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = url.origin === self.location.origin;
  const cacheFirst = (sameOrigin && (url.pathname.startsWith('/data/') || url.pathname.startsWith('/assets/'))) ||
    url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.gstatic.com';
  if (cacheFirst) {
    const name = sameOrigin && url.pathname.startsWith('/assets/') ? APP_CACHE : DATA_CACHE;
    e.respondWith(
      caches.open(name).then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) {
          await c.put(e.request, res.clone());
          // xoá bản dữ liệu cũ (cùng đường dẫn, khác phiên bản ?v=)
          if (url.search) for (const k of await c.keys()) {
            const ku = new URL(k.url);
            if (ku.pathname === url.pathname && ku.search !== url.search) c.delete(k);
          }
        }
        return res;
      }),
    );
  } else if (sameOrigin || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.ok) caches.open(APP_CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request).then((r) => r || caches.match('/'))),
    );
  }
});
