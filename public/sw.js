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

// ---- Push notifications (reminders) ----------------------------------------
//
// The server sends a small JSON payload: { title, body, tag, url }. Showing it
// is all this does — no data is stored here. The same `tag` means a repeat of
// the same reminder replaces the one already showing instead of stacking.

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "MyWitness reminder";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      tag: payload.tag || "mywitness-reminder",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/reminders" },
      // Stays until the person deals with it (where the device allows).
      requireInteraction: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/reminders",
    self.location.origin
  ).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // Reuse the open app if there is one, otherwise open it.
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.navigate(target).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
