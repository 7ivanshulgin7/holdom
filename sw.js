const CACHE = 'holdom-shell-v18';
const FILES = [
  './', './index.html', './style.css?v=18', './app.js?v=18', './calendar.js?v=18', './voice-turn.js?v=18',
  './manifest.webmanifest', './icon-192.png', './icon-512.png'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.indexOf('holdom-shell-')===0&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin ||
      request.headers.has('range') || request.destination === 'video') return;
  event.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).catch(function (error) {
        if (request.mode === 'navigate') return cache.match('./index.html');
        throw error;
      });
    });
  }));
});
