import { describe, expect, it } from "vitest";
import { PUBLIC_PAGES, classifyRoute } from "@/lib/route-access";

describe("classifyRoute", () => {
  it("lets the four information pages be read without signing in", () => {
    for (const page of PUBLIC_PAGES) {
      expect(classifyRoute(page)).toBe("public");
      expect(classifyRoute(`${page}/`)).toBe("public");
    }
  });

  it("does not make anything under or near a public page public", () => {
    expect(classifyRoute("/privacy/admin")).toBe("app");
    expect(classifyRoute("/privacy-settings")).toBe("app");
    expect(classifyRoute("/terms.json")).toBe("app");
  });

  it("keeps every app screen behind sign-in, including paths that contain a dot", () => {
    for (const p of [
      "/",
      "/today",
      "/people",
      "/people/123",
      "/people/123.json",
      "/settings",
      "/calendar",
      "/toolkit/new",
      "/some.page",
    ]) {
      expect(classifyRoute(p)).toBe("app");
    }
  });

  it("treats only real sign-in paths as auth screens", () => {
    expect(classifyRoute("/login")).toBe("auth");
    expect(classifyRoute("/auth/callback")).toBe("auth");
    expect(classifyRoute("/auth/reset-password")).toBe("auth");
    expect(classifyRoute("/loginfoo")).toBe("app");
    expect(classifyRoute("/authority")).toBe("app");
  });

  it("only lets the scheduler's own path skip the login check, and requires login for other APIs", () => {
    expect(classifyRoute("/api/reminders/dispatch")).toBe("scheduler");
    expect(classifyRoute("/api/reminders/dispatch/extra")).toBe("api");
    for (const p of [
      "/api/export",
      "/api/delete-account",
      "/api/transcribe",
      "/api/extract",
      "/api/push/subscribe",
      "/api",
    ]) {
      expect(classifyRoute(p)).toBe("api");
    }
  });

  it("allows only the browser files needed before sign-in", () => {
    expect(classifyRoute("/sw.js")).toBe("file");
    expect(classifyRoute("/manifest.webmanifest")).toBe("file");
    expect(classifyRoute("/.well-known/assetlinks.json")).toBe("file");
    expect(classifyRoute("/_next/static/chunks/app.js")).toBe("file");
    expect(classifyRoute("/_next/webpack-hmr")).toBe("file");
    expect(classifyRoute("/other.js")).toBe("app");
    expect(classifyRoute("/_nextfoo")).toBe("app");
  });
});
