/**
 * Which paths can be opened without signing in. One small, tested list instead
 * of rules scattered through the middleware, so a new public page is a
 * deliberate, reviewed change and nothing becomes public by accident.
 */

/** Information pages anyone may read, signed in or not. */
export const PUBLIC_PAGES = [
  "/privacy",
  "/terms",
  "/support",
  "/delete-account-info",
] as const;

/** Files the browser needs before anyone has signed in. */
const PUBLIC_FILES = new Set([
  "/sw.js",
  "/manifest.webmanifest",
  "/robots.txt",
]);

/** The one API route called by the scheduler, not by a person. */
export const SCHEDULER_PATH = "/api/reminders/dispatch";

export type RouteAccess =
  /** Anyone: privacy, terms, support, deletion information. */
  | "public"
  /** Browser files: service worker, manifest. */
  | "file"
  /** Sign-in, sign-up and password-reset screens and callbacks. */
  | "auth"
  /** Called by the scheduler; the route itself requires the secret. */
  | "scheduler"
  /** Any other API route: needs a signed-in user. */
  | "api"
  /** The app itself: needs a signed-in user (or demo mode, for screens only). */
  | "app";

function isSegmentPath(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function classifyRoute(rawPathname: string): RouteAccess {
  // "/privacy/" and "/privacy" are the same page.
  const pathname =
    rawPathname.length > 1 && rawPathname.endsWith("/")
      ? rawPathname.slice(0, -1)
      : rawPathname;

  if ((PUBLIC_PAGES as readonly string[]).includes(pathname)) return "public";
  if (PUBLIC_FILES.has(pathname)) return "file";
  // Needed later for app-store domain verification files.
  if (isSegmentPath(pathname, "/.well-known")) return "file";
  // Next.js's own build output (and the dev server's reload channel).
  if (isSegmentPath(pathname, "/_next")) return "file";
  if (isSegmentPath(pathname, "/login") || isSegmentPath(pathname, "/auth")) {
    return "auth";
  }
  if (pathname === SCHEDULER_PATH) return "scheduler";
  if (isSegmentPath(pathname, "/api")) return "api";
  return "app";
}
