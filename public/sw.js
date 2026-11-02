// MyWitness service worker.
//
// It does two jobs:
//
//  1. OPENS THE APP WITH NO SIGNAL. It serves the app's own screens and code
//     from the phone when there is no signal. The app saves them there itself
//     after sign-in (src/lib/offline/warm.ts), because a background worker is
//     stopped by the phone after about half a minute, too soon for the job.
//     What is kept: empty page shells (they contain no one's records), the
//     app's scripts and styles, and its icons. The person's own records are
//     kept separately, by the app itself, in the phone's database.
//     What is never touched: API calls, Supabase, anything with a login.
//
//  2. SHOWS REMINDER NOTIFICATIONS (push), further down.
//
// Every handler is written so that a failure here falls back to the normal
// network behaviour; this file must never be the reason the app can't open.

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const PAGES_CACHE = "mw-pages-" + VERSION;
const ASSETS_CACHE = "mw-assets-v1";
const FALLBACK_URL = "/offline.html";
// With a saved copy of a page, wait this long for the network before using it.
const NETWORK_TIMEOUT_MS = 4000;

// Screens with a fixed address. Saved ahead of time, refreshed whenever opened.
const STATIC_ROUTES = [
  "/today",
  "/calendar",
  "/people",
  "/people/new",
  "/bible-studies",
  "/bible-studies/new",
  "/return-visits",
  "/activity",
  "/activity/report",
  "/areas",
  "/notebook",
  "/notebook/new",
  "/reminders",
  "/settings",
  "/toolkit",
  "/toolkit/new",
  "/conversations/new",
  "/conversations/record",
];

// Screens for one person / study / visit are served from one saved placeholder
// each (see SHELL_RULES below); the app saves them (src/lib/offline/warm.ts).

const SHELL_RULES = [
  [/^\/bible-studies\/[^/]+\/(session|record)$/, (m) => "/bible-studies/_/" + m[1]],
  [/^\/return-visits\/[^/]+\/complete$/, () => "/return-visits/_/complete"],
  [/^\/toolkit\/[^/]+\/edit$/, () => "/toolkit/_/edit"],
  [
    /^\/(people|bible-studies|return-visits|toolkit|notebook|areas)\/[^/]+$/,
    (m) => "/" + m[1] + "/_",
  ],
];

/** "/people/abc" -> "/people/_" (the saved placeholder), or null if there isn't one. */
function shellFor(pathname) {
  for (const [pattern, build] of SHELL_RULES) {
    const m = pathname.match(pattern);
    if (m) return build(m);
  }
  return null;
}

function normalise(pathname) {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function isSignInPath(pathname) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/")
  );
}

/** A normal, successful page: not a redirect (not signed in), not an error. */
function isCacheablePage(response) {
  if (!response || !response.ok || response.type === "opaqueredirect") return false;
  const type = response.headers.get("content-type") || "";
  return type.indexOf("text/html") !== -1;
}

const pageKey = (pathname) => self.location.origin + pathname;

async function matchPage(pathname) {
  const wanted = [pathname];
  if (pathname === "/") wanted.push("/today");
  const shell = shellFor(pathname);
  if (shell) wanted.push(shell);

  // This version's saved pages first, then any older version still kept (so an
  // update with no signal doesn't leave the app without pages).
  const names = (await caches.keys()).filter((n) => n.indexOf("mw-pages-") === 0);
  names.sort((a, b) => (a === PAGES_CACHE ? -1 : b === PAGES_CACHE ? 1 : 0));
  for (const key of wanted) {
    for (const name of names) {
      const cache = await caches.open(name);
      const hit = await cache.match(pageKey(key));
      if (hit) return hit;
    }
  }
  return null;
}

async function offlinePage() {
  const names = (await caches.keys()).filter((n) => n.indexOf("mw-pages-") === 0);
  for (const name of names) {
    const hit = await (await caches.open(name)).match(pageKey(FALLBACK_URL));
    if (hit) return hit;
  }
  return new Response("You're offline.", {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function timeoutAfter(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function handleNavigation(event) {
  const request = event.request;
  const path = normalise(new URL(request.url).pathname);

  // Sign-in screens are never saved (and can't work with no signal anyway).
  if (isSignInPath(path)) {
    try {
      return await fetch(request);
    } catch {
      return offlinePage();
    }
  }

  const saved = await matchPage(path);
  const network = fetch(request).then((response) => {
    // Refresh the saved copy of fixed screens when the network answers with a
    // real page (not a sign-in redirect). Per-person pages are not saved.
    if (STATIC_ROUTES.indexOf(path) !== -1 && isCacheablePage(response)) {
      const copy = response.clone();
      event.waitUntil(
        caches.open(PAGES_CACHE).then((cache) => cache.put(pageKey(path), copy)).catch(() => undefined)
      );
    }
    return response;
  });
  network.catch(() => undefined); // a late failure after we gave up waiting is fine

  if (!saved) {
    try {
      return await network;
    } catch {
      return offlinePage();
    }
  }
  try {
    const answer = await Promise.race([network, timeoutAfter(NETWORK_TIMEOUT_MS)]);
    // A server error is no better than no answer: the saved copy opens fine.
    return answer.status >= 500 ? saved : answer;
  } catch {
    return saved;
  }
}

/** The app's scripts and styles never change under the same name, so keep the first copy. */
async function handleStaticAsset(request) {
  const cache = await caches.open(ASSETS_CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    const key = request.url.split("?")[0];
    cache.put(key, response.clone()).catch(() => undefined);
  }
  return response;
}

/** Icons and the manifest: show the saved one at once, refresh it in the background. */
async function handleSoftAsset(event) {
  const request = event.request;
  const cache = await caches.open(ASSETS_CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request.url.split("?")[0], response.clone()).catch(() => undefined);
      return response;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  return (await refresh) || fetch(request);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES_CACHE)
      .then((cache) => cache.add(FALLBACK_URL))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      // Remove the previous generation's cache (older name); keep the current
      // and any earlier saved pages until this version has saved its own.
      .then((names) =>
        Promise.all(
          names.filter((n) => n.indexOf("mywitness-shell") === 0).map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  try {
    if (request.mode === "navigate") {
      event.respondWith(handleNavigation(event));
    } else if (url.pathname.indexOf("/_next/static/") === 0) {
      event.respondWith(handleStaticAsset(request).catch(() => fetch(request)));
    } else if (url.pathname.indexOf("/icons/") === 0 || url.pathname === "/manifest.webmanifest") {
      event.respondWith(handleSoftAsset(event).catch(() => fetch(request)));
    }
    // Everything else (API calls, data, images) goes straight to the network.
  } catch {
    // Never block a request because of a problem here.
  }
});

/** On sign-out: forget the saved screens (they hold no records, but the phone may be shared). */
async function clearSavedPages() {
  for (const name of await caches.keys()) {
    if (name.indexOf("mw-pages-") === 0) await caches.delete(name);
  }
  try {
    await (await caches.open(PAGES_CACHE)).add(FALLBACK_URL);
  } catch {
    // The offline notice is rebuilt next time the app is opened.
  }
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "clear-private-caches") event.waitUntil(clearSavedPages());
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
