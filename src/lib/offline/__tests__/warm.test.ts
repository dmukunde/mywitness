import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ASSETS_CACHE,
  SHELL_ROUTES,
  STATIC_ROUTES,
  WARM_ROUTES,
  findAssets,
  pagesCacheName,
  readWarmStatus,
  warmOfflineCache,
  type WarmProgress,
} from "@/lib/offline/warm";
import { isMissingCodeError, describeCrash } from "@/lib/offline/errors";

const ORIGIN = "https://app.test";

function fakeCaches(): CacheStorage & { stores: Map<string, Map<string, Response>> } {
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (req: unknown, ignoreSearch = false) => {
    const url = typeof req === "string" ? req : (req as { url: string }).url;
    return ignoreSearch ? url.split("?")[0] : url;
  };
  const api = {
    stores,
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const map = stores.get(name)!;
      return {
        async match(req: unknown, opts?: { ignoreSearch?: boolean }) {
          for (const [k, v] of map) {
            if (keyOf(k, opts?.ignoreSearch) === keyOf(req, opts?.ignoreSearch)) return v.clone();
          }
          return undefined;
        },
        async put(req: unknown, res: Response) {
          map.set(keyOf(req), res);
        },
        async keys() {
          return [...map.keys()].map((url) => ({ url }));
        },
        async delete(req: unknown) {
          return map.delete(keyOf(req));
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
  return api as unknown as CacheStorage & typeof api;
}

const page = (assets: string[] = []) =>
  new Response(`<html>${assets.map((a) => `<script src="${a}"></script>`).join("")}</html>`, {
    status: 200,
    headers: { "content-type": "text/html" },
  });

const signedIn =
  (counter?: { n: number }) =>
  async (input: string) => {
    if (counter) counter.n++;
    if (input.startsWith("/_next/static/") || input.includes("/_next/static/")) {
      return new Response("/*code*/", { status: 200 });
    }
    return page(["/_next/static/chunks/a.js?dpl=1", "/_next/static/chunks/b.js", "/_next/static/css/c.css"]);
  };

const run = (over: Partial<Parameters<typeof warmOfflineCache>[0]> & { cs: ReturnType<typeof fakeCaches> }) =>
  warmOfflineCache({
    version: "v1",
    origin: ORIGIN,
    cacheStorage: over.cs,
    fetchFn: signedIn(),
    ...over,
  });

describe("finding what a page needs", () => {
  it("finds scripts, styles and fonts, once each (without the release tag on the address)", () => {
    const html = `<script src="/_next/static/chunks/a.js?dpl=x"></script>
      <link href="/_next/static/css/b.css" rel="stylesheet"><link rel="preload" href="/_next/static/media/f.woff2">
      <script src="/_next/static/chunks/a.js?dpl=x"></script><img src="/icons/x.png">`;
    expect(findAssets(html)).toEqual([
      "/_next/static/chunks/a.js",
      "/_next/static/css/b.css",
      "/_next/static/media/f.woff2",
    ]);
  });
});

describe("saving the app for use with no signal", () => {
  it("saves every screen and every script they need, and reports progress up to ready", async () => {
    const cs = fakeCaches();
    const steps: WarmProgress[] = [];
    const result = await run({ cs, onProgress: (p) => steps.push(p) });

    expect(result.state).toBe("ready");
    const pages = [...cs.stores.get(pagesCacheName("v1"))!.keys()].map((u) => new URL(u).pathname);
    for (const route of WARM_ROUTES) expect(pages).toContain(route);
    const assets = [...cs.stores.get(ASSETS_CACHE)!.keys()].map((u) => new URL(u).pathname);
    expect(assets.sort()).toEqual([
      "/_next/static/chunks/a.js",
      "/_next/static/chunks/b.js",
      "/_next/static/css/c.css",
    ]);
    expect(steps[0].state).toBe("working");
    expect(steps.some((s) => s.state === "working" && s.done > 0)).toBe(true);
    expect(steps[steps.length - 1]).toMatchObject({ state: "ready" });
    // the progress never goes backwards
    const dones = steps.filter((s) => s.state === "working").map((s) => s.done);
    expect(dones).toEqual([...dones].sort((a, b) => a - b));
  });

  it("is recorded as ready for this release, and only this release", async () => {
    const cs = fakeCaches();
    await run({ cs });
    expect((await readWarmStatus("v1", cs, ORIGIN)).state).toBe("ready");
    expect((await readWarmStatus("v2", cs, ORIGIN)).state).toBe("idle");
  });

  it("does not download everything again within a few hours, but can be told to", async () => {
    const cs = fakeCaches();
    const counter = { n: 0 };
    let t = 1_000_000;
    await run({ cs, fetchFn: signedIn(counter), now: () => t });
    const first = counter.n;
    t += 60 * 60 * 1000;
    await run({ cs, fetchFn: signedIn(counter), now: () => t });
    expect(counter.n).toBe(first);
    t += 7 * 60 * 60 * 1000;
    await run({ cs, fetchFn: signedIn(counter), now: () => t });
    expect(counter.n).toBeGreaterThan(first); // checked again after a while (assets already saved aren't re-downloaded)
    const second = counter.n;
    await run({ cs, fetchFn: signedIn(counter), now: () => t, force: true });
    expect(counter.n).toBeGreaterThan(second);
  });

  it("downloads each script and style once, however many screens use it", async () => {
    const cs = fakeCaches();
    const counter = { n: 0 };
    const seen: string[] = [];
    await run({
      cs,
      fetchFn: async (input) => {
        seen.push(input);
        return signedIn(counter)(input);
      },
    });
    expect(seen.filter((u) => u.includes("/_next/static/"))).toHaveLength(3);
  });

  it("stops without saving anything when the person is not signed in", async () => {
    const cs = fakeCaches();
    const result = await run({
      cs,
      fetchFn: async () => new Response(null, { status: 302, headers: { location: "/login" } }),
    });
    expect(result).toMatchObject({ state: "failed", reason: "not-signed-in" });
    expect((await readWarmStatus("v1", cs, ORIGIN)).state).toBe("idle");
  });

  it("reports a dropped signal as failed, is not marked ready, and finishes the job next time", async () => {
    const cs = fakeCaches();
    let calls = 0;
    const flaky = async (input: string) => {
      if (++calls > 8) throw new TypeError("Failed to fetch");
      return signedIn()(input);
    };
    const failed = await run({ cs, fetchFn: flaky });
    expect(failed).toMatchObject({ state: "failed", reason: "network" });
    expect((await readWarmStatus("v1", cs, ORIGIN)).state).toBe("idle");

    const savedBefore = cs.stores.get(pagesCacheName("v1"))!.size;
    const counter = { n: 0 };
    const again = await run({ cs, fetchFn: signedIn(counter) });
    expect(again.state).toBe("ready");
    expect(cs.stores.get(pagesCacheName("v1"))!.size).toBeGreaterThan(savedBefore);
  });

  it("reports a failed script download as no signal and does not mark it ready", async () => {
    const cs = fakeCaches();
    const result = await run({
      cs,
      fetchFn: async (input) => {
        if (input.includes("/_next/static/chunks/b.js")) throw new TypeError("Failed to fetch");
        return signedIn()(input);
      },
    });
    expect(result).toMatchObject({ state: "failed", reason: "network" });
    expect((await readWarmStatus("v1", cs, ORIGIN)).state).toBe("idle");
  });

  it("tidies up the previous release once the new one is fully saved", async () => {
    const cs = fakeCaches();
    cs.stores.set("mw-pages-old", new Map([[`${ORIGIN}/today`, page()]]));
    cs.stores.set(ASSETS_CACHE, new Map([[`${ORIGIN}/_next/static/chunks/unused.js`, new Response("x")]]));
    await run({ cs });
    expect(cs.stores.has("mw-pages-old")).toBe(false);
    expect([...cs.stores.get(ASSETS_CACHE)!.keys()].some((u) => u.endsWith("unused.js"))).toBe(false);
    expect([...cs.stores.get(ASSETS_CACHE)!.keys()].some((u) => u.endsWith("a.js"))).toBe(true);
  });

  it("keeps the previous release in place if the new one could not be saved", async () => {
    const cs = fakeCaches();
    cs.stores.set("mw-pages-old", new Map([[`${ORIGIN}/today`, page()]]));
    await run({ cs, fetchFn: async () => { throw new TypeError("Failed to fetch"); } });
    expect(cs.stores.has("mw-pages-old")).toBe(true);
  });

  it("never saves records: only the page shells and code it asks for", async () => {
    const cs = fakeCaches();
    const asked: string[] = [];
    await run({
      cs,
      fetchFn: async (input) => {
        asked.push(input);
        return signedIn()(input);
      },
    });
    expect(asked.every((u) => u.startsWith("/_next/static/") || WARM_ROUTES.includes(u))).toBe(true);
    expect(asked.some((u) => u.includes("/api/") || u.includes("supabase"))).toBe(false);
  });
});

describe("the page's list of screens matches the service worker's", () => {
  it("both save and serve the same fixed screens", () => {
    const source = readFileSync(path.resolve(__dirname, "../../../../public/sw.js"), "utf-8");
    const block = source.match(/const STATIC_ROUTES = \[([\s\S]*?)\];/);
    expect(block).not.toBeNull();
    const inWorker = [...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(inWorker).toEqual([...STATIC_ROUTES]);
  });

  it("the placeholder screens are the ones the worker knows how to find", () => {
    const source = readFileSync(path.resolve(__dirname, "../../../../public/sw.js"), "utf-8");
    for (const shell of SHELL_ROUTES) {
      // e.g. "/bible-studies/_/session" is produced by a rule in the worker
      const kind = shell.split("/")[1];
      expect(source).toContain(kind);
    }
  });
});

describe("a screen that could not load its code", () => {
  it("is recognised, so the person is told it isn't saved yet", () => {
    expect(isMissingCodeError(Object.assign(new Error("Loading chunk 123 failed."), { name: "ChunkLoadError" }))).toBe(true);
    expect(isMissingCodeError(new Error("Failed to fetch dynamically imported module: https://x/y.js"))).toBe(true);
    expect(isMissingCodeError(new TypeError("Importing a module script failed."))).toBe(true);
  });

  it("does not mistake an ordinary bug for it", () => {
    expect(isMissingCodeError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isMissingCodeError(null)).toBe(false);
  });

  it("describes a crash briefly and safely for support", () => {
    expect(describeCrash(new TypeError("x is not a function"))).toBe("TypeError: x is not a function");
    expect(describeCrash({ name: "E", message: "a".repeat(500) }).length).toBeLessThanOrEqual(155);
    expect(describeCrash(undefined)).toBe("unknown");
  });
});
