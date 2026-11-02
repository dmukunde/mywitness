/**
 * Browser security headers for every response. Kept in one small file with no
 * imports, because `next.config.ts` loads it directly.
 *
 * The Content-Security-Policy says exactly where the app may load things from
 * and send data to, so a script injected by mistake could neither run from
 * elsewhere nor send private notes anywhere. Only your own site and your
 * Supabase project are allowed. OpenAI is called by the server, never by the
 * browser, so it is deliberately absent. Push notifications, the service worker
 * and fonts all come from the app itself.
 *
 * Next.js writes a few small inline scripts to start each page, which is why
 * `script-src` still allows 'unsafe-inline'. A stricter per-request "nonce"
 * policy would force every page to be rendered on demand; that is a possible
 * later upgrade, not needed for this to block outside scripts, framing and
 * unexpected connections.
 */

export interface SecurityHeaderOptions {
  /** The Supabase project URL, e.g. https://abc.supabase.co */
  supabaseUrl?: string | null;
  /** True for `next dev`: allows what the development tools need. */
  isDev?: boolean;
}

function supabaseOrigins(supabaseUrl?: string | null) {
  if (!supabaseUrl) return { http: null, ws: null };
  try {
    const u = new URL(supabaseUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return { http: null, ws: null };
    return {
      http: u.origin,
      ws: `${u.protocol === "https:" ? "wss:" : "ws:"}//${u.host}`,
    };
  } catch {
    return { http: null, ws: null };
  }
}

export function buildCsp({ supabaseUrl, isDev = false }: SecurityHeaderOptions = {}) {
  const sb = supabaseOrigins(supabaseUrl);

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Inline start-up scripts are required by Next.js; 'unsafe-eval' only in dev.
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    // blob: for photo previews picked on the device; Supabase for stored photos.
    "img-src": ["'self'", "data:", "blob:", ...(sb.http ? [sb.http] : [])],
    "font-src": ["'self'", "data:"],
    // Sign-in, data and file storage go to Supabase; nothing else.
    "connect-src": [
      "'self'",
      ...(sb.http ? [sb.http] : []),
      ...(sb.ws ? [sb.ws] : []),
      ...(isDev ? ["ws:", "http://localhost:*"] : []),
    ],
    // Voice-note playback comes from the device (blob:) or the app.
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "frame-src": ["'none'"],
    // Nobody may put MyWitness inside another site's page.
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };

  const parts = Object.entries(directives).map(
    ([name, values]) => `${name} ${values.join(" ")}`
  );
  if (!isDev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function securityHeaders(opts: SecurityHeaderOptions = {}) {
  return [
    { key: "Content-Security-Policy", value: buildCsp(opts) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Older browsers ignore frame-ancestors; this covers them.
    { key: "X-Frame-Options", value: "DENY" },
    // Other sites see only that the visit came from MyWitness, never which
    // person's page it was.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value:
        "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}
