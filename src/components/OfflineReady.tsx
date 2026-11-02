"use client";

import { useEffect } from "react";
import { useApp } from "@/lib/app-context";
import { checkReadiness, offlineSupported, prepareOffline, getReadiness } from "@/lib/offline/readiness";

/** While the screens aren't saved yet, try again this often (the app stays open on screen). */
const RETRY_MS = 2 * 60 * 1000;

/**
 * Once someone is signed in and their records have loaded, saves the app's
 * screens on the phone so MyWitness can open with no signal. Done after sign-in
 * because the screens are only served to a signed-in person. Quick after the
 * first time. If the signal drops part-way, it carries on later.
 */
export function OfflineReady() {
  const { user, demoMode, online, loadState } = useApp();

  useEffect(() => {
    if (demoMode || !user || !offlineSupported()) return;
    void checkReadiness();
    if (!online || loadState !== "ready") return;

    void prepareOffline();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && getReadiness().state !== "ready") {
        void prepareOffline();
      }
    }, RETRY_MS);
    return () => window.clearInterval(timer);
  }, [user, demoMode, online, loadState]);

  return null;
}
