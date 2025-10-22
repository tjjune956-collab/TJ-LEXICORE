const CACHE_NAME = 'tj-lexicore-cache-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/admin.html',
  '/memes.html',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  // simple cache-first for same-origin
  if(event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(resp => {
    if(resp) return resp;
    return fetch(event.request).then(networkResp => {
      if(!networkResp || networkResp.status !== 200 || networkResp.type !== 'basic') return networkResp;
      const copy = networkResp.clone();
      caches.open(CACHE_NAME).then(cache => {
        cache.put(event.request, copy).then(()=> trimCache(CACHE_NAME, 120));
      });
      return networkResp;
    }).catch(()=> caches.match('/offline.html'));
  }));
});

function trimCache(cacheName, maxItems){
  caches.open(cacheName).then(cache=>{
    cache.keys().then(keys=>{
      if(keys.length > maxItems){
        cache.delete(keys[0]).then(()=> trimCache(cacheName, maxItems));
      }
    })
  })
}
