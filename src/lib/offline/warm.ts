/**
 * Saves the app's own screens and code on the phone so MyWitness can open with
 * no signal. Runs in the app (not in the background service worker) because
 * phones stop background workers after about half a minute, which is not long
 * enough to save everything on a slow connection. Here it runs in short
 * parallel steps, can be picked up again where it stopped, and reports its
 * progress so the person can see when the app is ready.
 *
 * What is saved: empty page shells and the app's scripts and styles. Never a
 * person's records, API responses, or anything from Supabase. The service
 * worker (public/sw.js) is what later serves these saved files.
 */

/** Screens with a fixed address. Keep in step with STATIC_ROUTES in public/sw.js (a test checks). */
export const STATIC_ROUTES = [
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
] as const;

/** One placeholder per kind of record screen; the screen reads the real id from the address. */
export const SHELL_ROUTES = [
  "/people/_",
  "/bible-studies/_",
  "/bible-studies/_/session",
  "/bible-studies/_/record",
  "/return-visits/_",
  "/return-visits/_/complete",
  "/toolkit/_",
  "/toolkit/_/edit",
  "/notebook/_",
  "/areas/_",
] as const;

export const WARM_ROUTES: readonly string[] = [...STATIC_ROUTES, ...SHELL_ROUTES];

export const ASSETS_CACHE = "mw-assets-v1";
const META_PATH = "/__mw-warm-meta";
/** A completed save is trusted for this long before it is quietly checked again. */
const FRESH_MS = 6 * 60 * 60 * 1000;

export const pagesCacheName = (version: string) => `mw-pages-${version}`;

export interface WarmProgress {
  state: "idle" | "working" | "ready" | "failed";
  done: number;
  total: number;
  /** Why it stopped: no signal, or not signed in (screens are only served to a signed-in person). */
  reason?: "network" | "not-signed-in" | "error";
  /** When the screens were last fully saved (ISO time). */
  savedAt?: string;
}

const ASSET_PATTERN = /\/_next\/static\/[^"'\s<>\\)]+?\.(?:js|css|woff2?)/g;

/** The scripts, styles and fonts a page refers to. */
export function findAssets(html: string): string[] {
  return Array.from(new Set(html.match(ASSET_PATTERN) ?? []));
}

/** A normal, successful page: not a redirect (not signed in), not an error. */
function isCacheablePage(response: Response): boolean {
  if (!response.ok || response.type === "opaqueredirect") return false;
  return (response.headers.get("content-type") ?? "").includes("text/html");
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface WarmOptions {
  /** This release (see build-id.ts). */
  version: string;
  /** Save again even if it was done recently. */
  force?: boolean;
  onProgress?: (progress: WarmProgress) => void;
  fetchFn?: Fetcher;
  cacheStorage?: CacheStorage;
  origin?: string;
  concurrency?: number;
  now?: () => number;
}

/** What is already saved for this release. */
export async function readWarmStatus(
  version: string,
  cacheStorage: CacheStorage = caches,
  origin: string = location.origin
): Promise<WarmProgress> {
  try {
    const cache = await cacheStorage.open(pagesCacheName(version));
    const hit = await cache.match(origin + META_PATH, { ignoreVary: true });
    if (hit) {
      const meta = (await hit.json()) as { version?: string; at?: number; count?: number };
      if (meta.version === version && typeof meta.at === "number") {
        return {
          state: "ready",
          done: meta.count ?? 0,
          total: meta.count ?? 0,
          savedAt: new Date(meta.at).toISOString(),
        };
      }
    }
  } catch {
    // Treated as not saved yet.
  }
  return { state: "idle", done: 0, total: 0 };
}

/** Runs `worker` over `items`, `limit` at a time. */
async function pool<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

export async function warmOfflineCache(options: WarmOptions): Promise<WarmProgress> {
  const {
    version,
    force = false,
    onProgress = () => undefined,
    fetchFn = (input, init) => fetch(input, init),
    cacheStorage = caches,
    origin = location.origin,
    concurrency = 4,
    now = Date.now,
  } = options;

  const before = await readWarmStatus(version, cacheStorage, origin);
  if (
    !force &&
    before.state === "ready" &&
    before.savedAt &&
    now() - Date.parse(before.savedAt) < FRESH_MS
  ) {
    return before;
  }

  const pages = await cacheStorage.open(pagesCacheName(version));
  const assets = await cacheStorage.open(ASSETS_CACHE);

  let done = 0;
  let total = WARM_ROUTES.length;
  let failure: WarmProgress["reason"] | null = null;
  const report = () => onProgress({ state: "working", done, total });
  report();

  // 1. The screens themselves.
  const assetUrls = new Map<string, string>(); // path -> address to download
  await pool(WARM_ROUTES, concurrency, async (route) => {
    if (failure) return;
    let response: Response;
    try {
      response = await fetchFn(route, { credentials: "same-origin", redirect: "manual" });
    } catch {
      failure = "network";
      return;
    }
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      failure = "not-signed-in";
      return;
    }
    if (isCacheablePage(response)) {
      await pages.put(origin + route, response.clone());
      for (const url of findAssets(await response.text())) {
        const path = url.split("?")[0];
        if (!assetUrls.has(path)) {
          assetUrls.set(path, url);
          total++;
        }
      }
    }
    done++;
    report();
  });
  if (failure) {
    const result: WarmProgress = { state: "failed", done, total, reason: failure };
    onProgress(result);
    return result;
  }

  // 2. The code and styles those screens need (only what isn't saved yet).
  await pool([...assetUrls.entries()], concurrency, async ([path, url]) => {
    if (failure) return;
    if (await assets.match(origin + path, { ignoreSearch: true, ignoreVary: true })) {
      done++;
      report();
      return;
    }
    try {
      const response = await fetchFn(url);
      if (!response.ok) throw new Error("bad response");
      await assets.put(origin + path, response);
    } catch {
      failure = "network";
      return;
    }
    done++;
    report();
  });
  if (failure) {
    const result: WarmProgress = { state: "failed", done, total, reason: failure };
    onProgress(result);
    return result;
  }

  // 3. Everything is saved: remember it, then tidy up older releases.
  const at = now();
  await pages.put(
    origin + META_PATH,
    new Response(JSON.stringify({ version, at, count: WARM_ROUTES.length }), {
      headers: { "content-type": "application/json" },
    })
  );
  for (const name of await cacheStorage.keys()) {
    if (name.startsWith("mw-pages-") && name !== pagesCacheName(version)) {
      await cacheStorage.delete(name);
    }
  }
  for (const request of await assets.keys()) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/_next/static/") && !assetUrls.has(path)) await assets.delete(request);
  }

  const result: WarmProgress = {
    state: "ready",
    done: total,
    total,
    savedAt: new Date(at).toISOString(),
  };
  onProgress(result);
  return result;
}
