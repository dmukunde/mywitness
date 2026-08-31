// MyWitness service worker — RC1 minimal version.
//
// Purpose: satisfy PWA installability and let the static app shell (icons,
// manifest) survive brief network blips. It deliberately does NOT cache
// HTML navigations, Next.js build output, /api/* routes, or anything on
// supabase.co — all private ministry data always goes straight to the
// network. There is no offline data sync in RC1.

const CACHE_NAME = "mywitness-shell-v1";
const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only ever handle same-origin GET requests for the precached static
  // shell files above. Everything else (pages, API routes, Supabase calls,
  // build chunks) is left untouched and goes straight to the network.
  const isShellAsset =
    request.method === "GET" &&
    url.origin === self.location.origin &&
    PRECACHE_URLS.includes(url.pathname);

  if (!isShellAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
