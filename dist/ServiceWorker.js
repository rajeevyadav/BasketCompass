// Offline app-shell cache. It caches only the local, first-party files listed
// below — never third-party prices, images, maps, or retailer pages — so offline
// use can never show a stale or redirected price. A network-first strategy keeps
// the shell fresh when online and falls back to the cache when offline.
const CACHE = 'basketcompass-shell-v1';
const ASSETS = [
  './', './index.html', './Style.css', './App.js', './Engine.js', './Provider.js',
  './manifest.webmanifest', './Icon.svg', './Icon-192.png', './Icon-512.png',
].map((path) => new URL(path, self.registration.scope).href);

self.addEventListener('install', (event) => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(ASSETS);
  await self.skipWaiting();
})()));

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  // Only the known shell assets are handled; everything else (prices, images,
  // maps) goes straight to the network and is never cached here.
  if (event.request.method !== 'GET' || !ASSETS.includes(event.request.url)) return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((cached) =>
        cached || new Response('Offline asset unavailable', {status: 503})))
  );
});
