const CACHE = 'holdom-shell-v5';
const FILES = [
  './', './index.html', './style.css?v=5', './app.js?v=5',
  './manifest.webmanifest', './icon-192.png', './icon-512.png', './itivan-sign.svg'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.indexOf('holdom-shell-')===0&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||e.request.headers.has('range')||e.request.destination==='video')return;e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match('./index.html'))))});
