"use client";

import { useSyncExternalStore } from "react";
import { buildId } from "@/lib/offline/build-id";
import { readWarmStatus, warmOfflineCache, type WarmProgress } from "@/lib/offline/warm";

/**
 * Whether the app's screens are saved on this phone for use with no signal,
 * shared by everything that shows or starts it (the banner, Settings, and the
 * automatic start after sign-in).
 */

const IDLE: WarmProgress = { state: "idle", done: 0, total: 0 };
let current: WarmProgress = IDLE;
let running: Promise<WarmProgress> | null = null;
const listeners = new Set<() => void>();

function publish(next: WarmProgress) {
  current = next;
  listeners.forEach((l) => l());
}

export function getReadiness(): WarmProgress {
  return current;
}

/** Whether this browser can save the app for offline use at all. */
export function offlineSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "caches" in window &&
    process.env.NODE_ENV === "production"
  );
}

/**
 * Starts saving the screens (one run at a time). With `force`, saves again even
 * if it was done recently. Does nothing where the browser can't support it.
 */
export function prepareOffline(force = false): Promise<WarmProgress> {
  if (!offlineSupported()) return Promise.resolve(current);
  if (running) return running;
  running = warmOfflineCache({ version: buildId(), force, onProgress: publish })
    .catch((): WarmProgress => ({ ...IDLE, state: "failed", reason: "error" }))
    .then((result) => {
      publish(result);
      return result;
    })
    .finally(() => {
      running = null;
    });
  return running;
}

/** Looks at what is already saved (without downloading anything). */
export async function checkReadiness(): Promise<WarmProgress> {
  if (!offlineSupported()) return current;
  const status = await readWarmStatus(buildId());
  if (current.state !== "working") publish(status);
  return status;
}

export function useOfflineReadiness(): WarmProgress {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getReadiness,
    () => IDLE
  );
}
