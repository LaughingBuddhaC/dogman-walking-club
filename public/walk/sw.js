// Service worker for the installable Walk mode app (/walk/ only). It keeps the page, Leaflet and icons cached so
// the app opens with a weak signal; API calls and map tiles always go to the network.
const CACHE = 'walk-v1';
const SHELL = ['/walk/', '/walk/manifest.json', '/img/brand/mark-emboss-round.png', '/img/brand/icon-192.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    // Newest page when online, the cached one when not.
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('/walk/', copy)); return r; })
      .catch(() => caches.match('/walk/')));
    return;
  }
  if (SHELL.includes(url.href) || SHELL.includes(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});
