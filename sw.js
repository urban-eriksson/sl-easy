/**
 * Service Worker: cache-first for static assets, network-only for API calls.
 */

const CACHE_NAME = 'sl-easy-v5';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/api.js',
  './js/ui.js',
  './js/utils.js',
  './js/storage.js',
  './manifest.json',
  './icons/favicon.svg',
];

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for static, network-only for API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-only for API calls
  if (url.hostname.includes('sl.se') || url.hostname.includes('integration.sl.se')) {
    return;
  }

  // Cache-first for same-origin requests
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
