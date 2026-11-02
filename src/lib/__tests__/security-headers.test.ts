import { describe, expect, it } from "vitest";
import { buildCsp, securityHeaders } from "@/lib/security-headers";

const SUPABASE = "https://abcdefgh.supabase.co";

const directive = (csp: string, name: string) =>
  csp
    .split("; ")
    .find((d) => d.startsWith(`${name} `))
    ?.slice(name.length + 1)
    .split(" ") ?? [];

describe("Content-Security-Policy", () => {
  const csp = buildCsp({ supabaseUrl: SUPABASE });

  it("only allows connections to the app itself and the Supabase project", () => {
    expect(directive(csp, "connect-src")).toEqual([
      "'self'",
      SUPABASE,
      "wss://abcdefgh.supabase.co",
    ]);
  });

  it("allows stored photos from Supabase and previews from the device", () => {
    const img = directive(csp, "img-src");
    expect(img).toContain(SUPABASE);
    expect(img).toContain("blob:");
  });

  it("does not let the browser talk to OpenAI or any other third party", () => {
    expect(csp).not.toMatch(/openai/i);
    expect(csp).not.toMatch(/https:(?!\/\/)/); // no bare "https:" wildcard
    expect(csp).not.toContain(" *");
  });

  it("blocks framing, plugins and base-tag tricks", () => {
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "frame-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
    expect(directive(csp, "form-action")).toEqual(["'self'"]);
  });

  it("does not allow eval or an outside script source in production", () => {
    const scripts = directive(csp, "script-src");
    expect(scripts).not.toContain("'unsafe-eval'");
    expect(scripts.every((s) => s.startsWith("'") )).toBe(true);
  });

  it("forces HTTPS in production but not in development", () => {
    expect(csp).toContain("upgrade-insecure-requests");
    const dev = buildCsp({ supabaseUrl: SUPABASE, isDev: true });
    expect(dev).not.toContain("upgrade-insecure-requests");
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
  });

  it("still produces a safe policy if the Supabase address is missing or invalid", () => {
    for (const bad of [undefined, null, "", "not a url", "javascript:alert(1)"]) {
      const c = buildCsp({ supabaseUrl: bad });
      expect(directive(c, "connect-src")).toEqual(["'self'"]);
    }
  });
});

describe("securityHeaders", () => {
  const headers = Object.fromEntries(
    securityHeaders({ supabaseUrl: SUPABASE }).map((h) => [h.key, h.value])
  );

  it("sets the standard protective headers", () => {
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
  });

  it("keeps the microphone and location available to the app but nothing else", () => {
    const p = headers["Permissions-Policy"];
    expect(p).toContain("microphone=(self)");
    expect(p).toContain("geolocation=(self)");
    expect(p).toContain("payment=()");
  });
});
