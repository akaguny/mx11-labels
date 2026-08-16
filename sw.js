/* mx11-labels service worker — cache-first для статики, network-first для навигации */
const VERSION = 'mx11-v2';
const CACHE = VERSION;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './src/vendor/qrcode.js',
  './src/core/ble.js',
  './src/core/i18n.js',
  './src/core/label.js',
  './src/core/protocol.js',
  './src/core/store.js',
  './src/components/mx-actions.js',
  './src/components/mx-app.js',
  './src/components/mx-batch.js',
  './src/components/mx-calibration.js',
  './src/components/mx-catalog.js',
  './src/components/mx-debug.js',
  './src/components/mx-filament.js',
  './src/components/mx-preflight.js',
  './src/components/mx-preview.js',
  './src/components/mx-settings.js',
  './src/components/util.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
