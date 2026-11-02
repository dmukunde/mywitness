"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/lib/app-context";

/**
 * Once someone is signed in and their records have loaded, asks the service
 * worker to save the app's screens on the phone so MyWitness can open with no
 * signal. Done after sign-in because the screens are only served to a signed-in
 * person. It is quick after the first time, and does nothing if it already ran.
 */
export function OfflineReady() {
  const { user, demoMode, online, loadState } = useApp();
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current || demoMode || !user || !online || loadState !== "ready") return;
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    asked.current = true;
    void navigator.serviceWorker.ready
      .then((registration) => registration.active?.postMessage({ type: "warm" }))
      .catch(() => undefined);
  }, [user, demoMode, online, loadState]);

  return null;
}
