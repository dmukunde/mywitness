"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/**
 * The part of the address after "#", without the "#". It is empty on the
 * server and on the first paint, then filled in by the browser, which is why
 * pages that read it show a short "Loading" first.
 */
export function useHash(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash.replace(/^#/, ""),
    () => null
  );
}
