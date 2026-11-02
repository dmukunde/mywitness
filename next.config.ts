import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const headers = securityHeaders({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  isDev: process.env.NODE_ENV !== "production",
});

const nextConfig: NextConfig = {
  env: {
    // Lets each release install its own service worker (see ServiceWorkerRegister).
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now()),
  },
  // Don't advertise the framework.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers },
      {
        // The service worker must always be re-checked so fixes reach phones quickly.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
