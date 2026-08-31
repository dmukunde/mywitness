"use client";

import { useEffect } from "react";

/** Registers the minimal app-shell service worker (public/sw.js). No-ops silently if unsupported. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[MyWitness service worker]", err);
    });
  }, []);

  return null;
}
