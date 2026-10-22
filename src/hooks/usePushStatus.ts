"use client";

import { useCallback, useEffect, useState } from "react";

export type PushSupport =
  | "ready" // this device can receive push notifications
  | "needs-install" // iPhone/iPad in a browser tab: Add to Home Screen first
  | "unsupported"; // no push here — use calendar reminders instead

export interface PushStatus {
  loading: boolean;
  support: PushSupport;
  permission: NotificationPermission | "unsupported";
  /** This device is registered to receive reminders. */
  subscribed: boolean;
  /** The server has its notification keys and scheduler secret. */
  serverConfigured: boolean;
  busy: boolean;
  error: string | null;
}

function urlBase64ToBytes(value: string): Uint8Array {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function detectSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const hasPush =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (hasPush) return "ready";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const installed =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  // iOS only offers push to an app that was added to the Home Screen.
  return ios && !installed ? "needs-install" : "unsupported";
}

/**
 * The service worker registration, or null if it doesn't become ready soon.
 * `navigator.serviceWorker.ready` waits forever when registration failed, which
 * would leave the screen "loading" for good — so it gets a time limit.
 */
export async function readyRegistration(
  timeoutMs = 4000
): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

async function currentSubscription() {
  const reg = await readyRegistration();
  return { reg, sub: reg ? await reg.pushManager.getSubscription() : null };
}

/**
 * Whether reminders can reach this device as push notifications, and the
 * actions to turn that on or off. Everything degrades gracefully: when push
 * isn't available the rest of the reminder feature still works.
 */
export function usePushStatus() {
  const [state, setState] = useState<PushStatus>({
    loading: true,
    support: "unsupported",
    permission: "unsupported",
    subscribed: false,
    serverConfigured: false,
    busy: false,
    error: null,
  });
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    let support = detectSupport();
    const permission: PushStatus["permission"] =
      typeof Notification === "undefined" ? "unsupported" : Notification.permission;
    let subscribed = false;
    let serverConfigured = false;
    let key: string | null = null;
    try {
      const res = await fetch("/api/push/status");
      if (res.ok) {
        const body = (await res.json()) as { configured: boolean; publicKey: string | null };
        serverConfigured = body.configured;
        key = body.publicKey;
      }
      if (support === "ready") {
        const { reg, sub } = await currentSubscription();
        if (!reg) support = "unsupported"; // the service worker isn't running
        subscribed = Boolean(sub);
      }
    } catch {
      // Offline or no service worker yet: report what we know.
    }
    setPublicKey(key);
    setState((s) => ({
      ...s,
      loading: false,
      support,
      permission,
      subscribed,
      serverConfigured,
    }));
  }, []);

  useEffect(() => {
    // Reads the device's current state once; the awaits inside keep the
    // updates out of the synchronous effect body.
    void refresh();
  }, [refresh]);

  const register = useCallback(
    async (privateMode?: boolean) => {
      if (!publicKey) throw new Error("Notifications aren't set up on the server yet.");
      const { reg, sub: existing } = await currentSubscription();
      if (!reg) throw new Error("Notifications aren't available on this device right now.");
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBytes(publicKey) as BufferSource,
        }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          ...(privateMode === undefined ? {} : { privateMode }),
        }),
      });
      if (!res.ok) throw new Error("Could not save this device. Please try again.");
    },
    [publicKey]
  );

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setState((s) => ({ ...s, busy: true, error: null }));
      try {
        await fn();
        await refresh();
      } catch (err) {
        setState((s) => ({
          ...s,
          error: err instanceof Error ? err.message : "Something went wrong.",
        }));
      } finally {
        setState((s) => ({ ...s, busy: false }));
      }
    },
    [refresh]
  );

  /** Asks permission (once) and registers this device. */
  const enable = useCallback(
    (privateMode?: boolean) =>
      run(async () => {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          throw new Error(
            permission === "denied"
              ? "Notifications are blocked. Allow them for MyWitness in your device or browser settings, then try again."
              : "Notifications weren't turned on."
          );
        }
        await register(privateMode);
      }),
    [register, run]
  );

  const disable = useCallback(
    () =>
      run(async () => {
        const { sub } = await currentSubscription();
        if (!sub) return;
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }),
    [run]
  );

  const setPrivateMode = useCallback(
    (privateMode: boolean) => run(() => register(privateMode)),
    [register, run]
  );

  const sendTest = useCallback(
    () =>
      run(async () => {
        const res = await fetch("/api/push/test", { method: "POST" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || "The test notification failed.");
        }
      }),
    [run]
  );

  return { ...state, enable, disable, setPrivateMode, sendTest, refresh };
}
