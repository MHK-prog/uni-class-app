// Keep in sync with APP_VERSION in app.js.
const APP_VERSION = '1.14.3';
const CACHE_PREFIX = 'class-schedule-static-';
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;
const ASSETS = [
  './index.html', './styles.css', './app.js', './manifest.webmanifest', './icon.svg',
  './icon-192.png', './icon-512.png', './fonts/Vazirmatn.woff2',
  './assets/icons/add.webp', './assets/icons/back.webp', './assets/icons/check.svg',
  './assets/icons/close.svg', './assets/icons/delete.webp', './assets/icons/download.webp',
  './assets/icons/edit.webp', './assets/icons/menu.svg', './assets/icons/profile.svg', './assets/icons/reload.webp'
];


self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch (error) {
      if (event.request.mode === 'navigate') return cache.match('./index.html');
      throw error;
    }
  }));
});
