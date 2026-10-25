const CACHE = 'haut-compass-pages-v2';
const BASE = new URL('./', self.location.href);
const DATA_URL = new URL('./data/snapshot.json', BASE).href;
const ASSETS = ['./', './style.css', './app.js', './icons.svg', './vendor/fuse.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png', './data/snapshot.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((asset) => new URL(asset, BASE).href))));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('haut-compass-pages-') && key !== CACHE).map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  event.respondWith(fetch(event.request).then((response) => {
    const isData = url.href === DATA_URL;
    const validType = !isData || response.headers.get('content-type')?.includes('application/json');
    if (response.ok && validType) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => {
    const cached = (await caches.match(event.request))
      || (event.request.mode === 'navigate' ? await caches.match(BASE.href) : undefined);
    if (cached && url.href === DATA_URL) {
      const headers = new Headers(cached.headers);
      headers.set('X-Compass-Offline', '1');
      return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
    }
    return cached || new Response('离线时暂无此内容', { status: 503 });
  }));
});
