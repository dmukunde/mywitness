/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { SHELL_ROUTES, STATIC_ROUTES } from "@/lib/offline/warm";

/**
 * Loads the real public/sw.js into a sandbox and plays out phone scenarios:
 * signal on, signal off, slow signal, signed out. No browser needed.
 */

const SOURCE = readFileSync(path.resolve(__dirname, "../../../public/sw.js"), "utf-8");
const ORIGIN = "https://app.test";

type Handler = (event: any) => void;

const html = (body = "page", assets: string[] = []) =>
  new Response(
    `<!doctype html><html><body>${body}${assets
      .map((a) => `<script src="${a}"></script>`)
      .join("")}</body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
  );

function createWorker(version = "v1") {
  const handlers: Record<string, Handler[]> = {};
  const stores = new Map<string, Map<string, Response>>();
  const fetched: string[] = [];
  const notifications: any[] = [];
  const opened: string[] = [];
  let network: (url: string) => Promise<Response> = async () => {
    throw new TypeError("Failed to fetch");
  };

  const keyOf = (req: any, ignoreSearch = false) => {
    const url = typeof req === "string" ? new URL(req, ORIGIN).href : req.url;
    return ignoreSearch ? url.split("?")[0] : url;
  };

  const cachesApi = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const map = stores.get(name)!;
      return {
        async match(req: any, opts?: { ignoreSearch?: boolean }) {
          const wanted = keyOf(req, opts?.ignoreSearch);
          for (const [k, v] of map) {
            if (keyOf(k, opts?.ignoreSearch) === wanted) return v.clone();
          }
          return undefined;
        },
        async put(req: any, res: Response) {
          map.set(keyOf(req), res);
        },
        async add(req: any) {
          map.set(keyOf(req), await fakeFetch(req));
        },
        async keys() {
          return [...map.keys()].map((u) => ({ url: u }));
        },
        async delete(req: any) {
          return map.delete(typeof req === "string" ? keyOf(req) : req.url);
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
  };

  const fakeFetch = (input: any) => {
    const url = typeof input === "string" ? new URL(input, ORIGIN).href : input.url;
    fetched.push(url);
    return network(url);
  };

  const self = {
    location: new URL(`${ORIGIN}/sw.js?v=${version}`),
    addEventListener: (type: string, fn: Handler) => {
      (handlers[type] ||= []).push(fn);
    },
    skipWaiting: () => undefined,
    clients: {
      claim: async () => undefined,
      matchAll: async () => [],
      openWindow: async (u: string) => {
        opened.push(u);
      },
    },
    registration: {
      showNotification: async (title: string, options: any) => {
        notifications.push({ title, options });
      },
    },
  };

  vm.runInNewContext(SOURCE, {
    self,
    caches: cachesApi,
    fetch: fakeFetch,
    Response,
    Request,
    URL,
    Headers,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout,
    console,
  });

  function dispatch(type: string, extra: Record<string, unknown> = {}) {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<Response> | null = null;
    const event = {
      ...extra,
      waitUntil: (p: Promise<unknown>) => void waits.push(p),
      respondWith: (p: Promise<Response>) => {
        responded = Promise.resolve(p);
      },
    };
    (handlers[type] || []).forEach((h) => h(event));
    return {
      responded: () => responded,
      settle: async () => {
        await Promise.all(waits);
      },
    };
  }

  const navigate = (p: string) =>
    dispatch("fetch", { request: { url: `${ORIGIN}${p}`, method: "GET", mode: "navigate" } });
  const subresource = (p: string, method = "GET", origin = ORIGIN) =>
    dispatch("fetch", { request: { url: `${origin}${p}`, method, mode: "cors" } });

  return {
    stores,
    fetched,
    notifications,
    opened,
    setNetwork: (fn: (url: string) => Promise<Response>) => {
      network = fn;
    },
    goOffline: () => {
      network = async () => {
        throw new TypeError("Failed to fetch");
      };
    },
    dispatch,
    navigate,
    subresource,
    install: async () => {
      const d = dispatch("install");
      await d.settle();
    },
    cached: (cacheName: string) => [...(stores.get(cacheName)?.keys() ?? [])],
  };
}

afterEach(() => {
  vi.useRealTimers();
});

const text = async (p: Promise<Response> | null) => (await p!).text();

describe("opening screens with no signal", () => {
  async function savedWorker() {
    const w = createWorker();
    w.setNetwork(async (url) => (url.endsWith("/offline.html") ? html("OFFLINE-PAGE") : html("x")));
    await w.install(); // the worker keeps the friendly offline page itself
    const pages = new Map<string, Response>();
    for (const route of [...STATIC_ROUTES, ...SHELL_ROUTES]) {
      pages.set(`${ORIGIN}${route}`, html(`SCREEN:${route}`));
    }
    pages.set(`${ORIGIN}/offline.html`, html("OFFLINE-PAGE"));
    w.stores.set("mw-pages-v1", pages);
    w.stores.set(
      "mw-assets-v1",
      new Map([[`${ORIGIN}/_next/static/chunks/app.js`, new Response("/*code*/", { status: 200 })]])
    );
    w.goOffline();
    return w;
  }

  it("opens a saved screen with no signal", async () => {
    const w = await savedWorker();
    const d = w.navigate("/calendar");
    expect(await text(d.responded())).toContain("SCREEN:/calendar");
  });

  it("opens any person's page with no signal, from the saved placeholder", async () => {
    const w = await savedWorker();
    const d = w.navigate("/people/6f2c1e9a-0000-4000-8000-123456789abc");
    expect(await text(d.responded())).toContain("SCREEN:/people/_");
  });

  it("opens the other kinds of record screens too", async () => {
    const w = await savedWorker();
    expect(await text(w.navigate("/bible-studies/abc/session").responded())).toContain("SCREEN:/bible-studies/_/session");
    expect(await text(w.navigate("/bible-studies/abc/record").responded())).toContain("SCREEN:/bible-studies/_/record");
    expect(await text(w.navigate("/bible-studies/abc").responded())).toContain("SCREEN:/bible-studies/_");
    expect(await text(w.navigate("/return-visits/abc/complete").responded())).toContain("SCREEN:/return-visits/_/complete");
    expect(await text(w.navigate("/toolkit/abc/edit").responded())).toContain("SCREEN:/toolkit/_/edit");
    expect(await text(w.navigate("/notebook/abc").responded())).toContain("SCREEN:/notebook/_");
  });

  it("does not mistake a fixed screen for a person's page", async () => {
    const w = await savedWorker();
    expect(await text(w.navigate("/people/new").responded())).toContain("SCREEN:/people/new");
    expect(await text(w.navigate("/toolkit/new").responded())).toContain("SCREEN:/toolkit/new");
  });

  it("ignores a query string when finding the saved screen", async () => {
    const w = await savedWorker();
    expect(await text(w.navigate("/reminders?reminder=abc").responded())).toContain("SCREEN:/reminders");
  });

  it("opens the Today screen for the app's start address", async () => {
    const w = await savedWorker();
    expect(await text(w.navigate("/").responded())).toContain("SCREEN:/today");
  });

  it("shows a friendly page, not a browser error, for something never saved", async () => {
    const w = await savedWorker();
    expect(await text(w.navigate("/never-seen").responded())).toContain("OFFLINE-PAGE");
  });

  it("keeps the app's code and styles for use with no signal, ignoring release tags in the address", async () => {
    const w = await savedWorker();
    const d = w.subresource("/_next/static/chunks/app.js?dpl=zzz");
    expect(await text(d.responded())).toBe("/*code*/");
    expect(w.cached("mw-assets-v1").some((u) => u.endsWith("/_next/static/chunks/app.js"))).toBe(true);
  });
});

describe("with signal", () => {
  it("lets the network answer and refreshes the saved copy of a fixed screen", async () => {
    const w = createWorker();
    w.setNetwork(async () => html("FRESH"));
    const d = w.navigate("/today");
    expect(await text(d.responded())).toContain("FRESH");
    await d.settle();
    w.goOffline();
    expect(await text(w.navigate("/today").responded())).toContain("FRESH");
  });

  it("does not save a sign-in redirect as if it were the screen", async () => {
    const w = createWorker();
    w.setNetwork(async () => new Response(null, { status: 302, headers: { location: "/login" } }));
    const d = w.navigate("/today");
    const res = await d.responded();
    expect(res!.status).toBe(302);
    await d.settle();
    expect(w.cached("mw-pages-v1").some((u) => u.endsWith("/today"))).toBe(false);
  });

  it("does not save a single person's page (the placeholder serves them all)", async () => {
    const w = createWorker();
    w.setNetwork(async () => html("PERSON"));
    const d = w.navigate("/people/abc-123");
    await d.responded();
    await d.settle();
    expect(w.cached("mw-pages-v1").some((u) => u.includes("abc-123"))).toBe(false);
  });

  it("never saves or serves sign-in screens", async () => {
    const w = createWorker();
    w.setNetwork(async () => html("LOGIN"));
    const online = w.navigate("/login");
    expect(await text(online.responded())).toContain("LOGIN");
    await online.settle();
    expect(w.cached("mw-pages-v1").some((u) => u.endsWith("/login"))).toBe(false);
  });

  it("uses a server error as no answer when a saved copy exists", async () => {
    const w = createWorker();
    w.setNetwork(async () => html("GOOD"));
    const first = w.navigate("/today");
    await first.responded();
    await first.settle();
    w.setNetwork(async () => new Response("oops", { status: 502 }));
    expect(await text(w.navigate("/today").responded())).toContain("GOOD");
  });

  it("passes a server error through when nothing is saved", async () => {
    const w = createWorker();
    w.setNetwork(async () => new Response("oops", { status: 502 }));
    const res = await w.navigate("/calendar").responded();
    expect(res!.status).toBe(502);
  });
});

describe("a weak signal", () => {
  it("falls back to the saved screen when the network is too slow", async () => {
    vi.useFakeTimers();
    const w = createWorker();
    w.setNetwork(async () => html("SAVED"));
    const first = w.navigate("/today");
    await first.responded();
    await first.settle();

    w.setNetwork(() => new Promise<Response>(() => undefined)); // never answers
    const d = w.navigate("/today");
    const pending = d.responded()!.then((r) => r.text());
    await vi.advanceTimersByTimeAsync(4100);
    expect(await pending).toContain("SAVED");
  });

  it("keeps waiting for the network when there is no saved copy to fall back on", async () => {
    vi.useFakeTimers();
    const w = createWorker();
    let answer!: (r: Response) => void;
    w.setNetwork(() => new Promise<Response>((resolve) => (answer = resolve)));
    const d = w.navigate("/calendar");
    const pending = d.responded()!.then((r) => r.text());
    await vi.advanceTimersByTimeAsync(30_000);
    answer(html("LATE-BUT-REAL"));
    expect(await pending).toContain("LATE-BUT-REAL");
  });
});

describe("updating to a new release", () => {
  it("keeps the previous release's screens usable until the new ones are saved", async () => {
    const w = createWorker("v2");
    w.stores.set("mw-pages-v1", new Map([[`${ORIGIN}/today`, html("OLD-BUT-WORKS")]]));
    w.goOffline();
    expect(await text(w.navigate("/today").responded())).toContain("OLD-BUT-WORKS");
  });
});

describe("what it leaves alone", () => {
  it("does not touch data requests, other websites, or anything that changes data", () => {
    const w = createWorker();
    expect(w.subresource("/api/export").responded()).toBeNull();
    expect(w.subresource("/api/transcribe", "POST").responded()).toBeNull();
    expect(w.subresource("/rest/v1/people", "GET", "https://abc.supabase.co").responded()).toBeNull();
    expect(w.subresource("/_next/image?url=x").responded()).toBeNull();
    expect(w.subresource("/people/abc?_rsc=1").responded()).toBeNull();
  });

  it("does not touch a request that is not a plain GET", () => {
    const w = createWorker();
    const d = w.dispatch("fetch", { request: { url: `${ORIGIN}/today`, method: "POST", mode: "navigate" } });
    expect(d.responded()).toBeNull();
  });
});

describe("signing out", () => {
  it("forgets the saved screens but keeps the app's code", async () => {
    const w = createWorker();
    w.setNetwork(async () => html("x"));
    await w.install();
    w.stores.get("mw-pages-v1")!.set(`${ORIGIN}/today`, html("SCREEN"));
    w.stores.set("mw-assets-v1", new Map([[`${ORIGIN}/_next/static/chunks/a.js`, new Response("code")]]));
    await w.dispatch("message", { data: { type: "clear-private-caches" } }).settle();
    const pages = w.cached("mw-pages-v1").map((u) => new URL(u).pathname);
    expect(pages).not.toContain("/today");
    expect(pages).toContain("/offline.html");
    expect(w.cached("mw-assets-v1").length).toBeGreaterThan(0);
  });
});

describe("housekeeping", () => {
  it("removes the previous generation's cache when it takes over", async () => {
    const w = createWorker();
    w.stores.set("mywitness-shell-v1", new Map());
    await w.dispatch("activate").settle();
    expect(w.stores.has("mywitness-shell-v1")).toBe(false);
  });
});

describe("reminder notifications still work", () => {
  it("shows a pushed reminder", async () => {
    const w = createWorker();
    const d = w.dispatch("push", {
      data: { json: () => ({ title: "MyWitness reminder", body: "Remind Mary", tag: "reminder-1", url: "/reminders?reminder=1" }) },
    });
    await d.settle();
    expect(w.notifications).toHaveLength(1);
    expect(w.notifications[0].title).toBe("MyWitness reminder");
    expect(w.notifications[0].options).toMatchObject({ body: "Remind Mary", tag: "reminder-1" });
  });

  it("opens the app when a reminder is tapped", async () => {
    const w = createWorker();
    const d = w.dispatch("notificationclick", {
      notification: { close: () => undefined, data: { url: "/reminders?reminder=1" } },
    });
    await d.settle();
    expect(w.opened).toEqual([`${ORIGIN}/reminders?reminder=1`]);
  });
});
