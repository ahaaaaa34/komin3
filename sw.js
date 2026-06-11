// sw.js — Service Worker（家庭基礎クイズ）
const CACHE = 'katei-v1';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './data.js',
  './fulltext.js',
  './icons.js',
  './style.css',
  'https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;500;700;800&display=swap',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
