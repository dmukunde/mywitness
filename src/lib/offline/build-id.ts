/**
 * Identifies this release of the app. The service worker is registered with it,
 * and the screens saved for offline use are stored under it, so both always
 * agree on which release a saved screen belongs to.
 */
export function buildId(): string {
  return process.env.NEXT_PUBLIC_BUILD_ID || "1";
}
