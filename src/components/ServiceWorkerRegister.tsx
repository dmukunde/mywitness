"use client";

import { useEffect } from "react";

/** Setting this in the browser's storage switches the worker off (an emergency off switch for support). */
const KILL_SWITCH = "mw-no-service-worker";

/**
 * Registers the service worker (public/sw.js), which lets the app open with no
 * signal. Only in the deployed app: while developing it would hold on to old
 * code, so there it is removed instead. The build id in the address makes the
 * phone pick up a new worker whenever a new version of the app is released.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let disabled = false;
    try {
      disabled = localStorage.getItem(KILL_SWITCH) === "1";
    } catch {
      // Storage unavailable: carry on.
    }

    if (process.env.NODE_ENV !== "production" || disabled) {
      void navigator.serviceWorker
        .getRegistrations()
        .then((all) => all.forEach((r) => void r.unregister()))
        .catch(() => undefined);
      if ("caches" in window) {
        void caches
          .keys()
          .then((names) =>
            names.filter((n) => n.startsWith("mw-")).forEach((n) => void caches.delete(n))
          )
          .catch(() => undefined);
      }
      return;
    }

    const version = encodeURIComponent(process.env.NEXT_PUBLIC_BUILD_ID || "1");
    navigator.serviceWorker.register(`/sw.js?v=${version}`).catch((err) => {
      console.error("[MyWitness service worker]", err);
    });
  }, []);

  return null;
}
