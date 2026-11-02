"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { AlertCircle, CloudOff, RefreshCw } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useOfflineReadiness } from "@/lib/offline/readiness";

/** Remembers that the "ready for use without signal" note has been shown once on this phone. */
const READY_SEEN_KEY = "mw-offline-ready-seen";
const seenListeners = new Set<() => void>();

function readySeen(): boolean {
  try {
    return localStorage.getItem(READY_SEEN_KEY) === "1";
  } catch {
    return true; // can't remember it, so don't nag
  }
}

function markReadySeen() {
  try {
    localStorage.setItem(READY_SEEN_KEY, "1");
  } catch {
    // Fine: it may show again next time.
  }
  seenListeners.forEach((l) => l());
}

/**
 * Tells the person, in plain words, what state their records are in:
 * working with no signal, changes waiting to send, something the server
 * refused, or a sign-in that must be renewed. Nothing is hidden: if a change
 * is only saved on this phone, it says so.
 */
export function OfflineBanner() {
  const {
    demoMode,
    loadState,
    online,
    pendingChanges,
    failedChanges,
    needsSignIn,
    lastSyncedAt,
    syncNow,
    retryFailedChanges,
    discardFailedChanges,
  } = useApp();
  const [busy, setBusy] = useState(false);
  const readiness = useOfflineReadiness();
  // The first time the app is fully saved on this phone, say so (once).
  const seen = useSyncExternalStore(
    (listener) => {
      seenListeners.add(listener);
      return () => seenListeners.delete(listener);
    },
    readySeen,
    () => true
  );
  const readyNote = readiness.state === "ready" && !seen;

  if (demoMode) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const when = lastSyncedAt ? format(parseISO(lastSyncedAt), "EEE d MMM, h:mm a") : null;
  const offline = !online || loadState === "stale";
  const waiting =
    pendingChanges > 0
      ? `${pendingChanges} change${pendingChanges === 1 ? "" : "s"} waiting to send.`
      : null;

  const banners: React.ReactNode[] = [];

  if (failedChanges.length > 0) {
    banners.push(
      <div
        key="failed"
        role="alert"
        className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-800 ring-1 ring-rose-200"
      >
        <p className="flex items-start gap-2 font-medium">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {failedChanges.length === 1
            ? "1 change couldn't be saved to your account."
            : `${failedChanges.length} changes couldn't be saved to your account.`}
        </p>
        <p className="mt-1 text-xs text-rose-700">
          {failedChanges[0].error ?? "The server did not accept it."}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(retryFailedChanges)}
            className="min-h-9 rounded-full bg-white px-3 text-xs font-semibold text-rose-800 ring-1 ring-rose-200 disabled:opacity-60"
          >
            Try again
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(discardFailedChanges)}
            className="min-h-9 rounded-full px-3 text-xs font-semibold text-rose-800 underline decoration-rose-300 underline-offset-2 disabled:opacity-60"
          >
            Discard
          </button>
        </div>
      </div>
    );
  }

  if (needsSignIn) {
    banners.push(
      <div
        key="signin"
        role="alert"
        className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200"
      >
        <p className="font-medium">Please sign in again to send your saved changes.</p>
        <p className="mt-1 text-xs text-amber-800">
          {waiting ?? "Your changes"} Everything is safe on this phone until you do.
        </p>
        <Link
          href="/login"
          className="mt-2 inline-flex min-h-9 items-center rounded-full bg-white px-3 text-xs font-semibold text-amber-900 ring-1 ring-amber-200"
        >
          Sign in
        </Link>
      </div>
    );
  } else if (offline) {
    banners.push(
      <div
        key="offline"
        role="status"
        aria-live="polite"
        className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200"
      >
        <p className="flex items-start gap-2 font-medium">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          You&apos;re offline.
        </p>
        <p className="mt-1 text-xs text-amber-800">
          {when
            ? `You're seeing your records as they were on ${when}. `
            : "You're seeing the records saved on this phone. "}
          Ministry time you track is saved on this phone and sent when you have
          signal. Other changes need internet.
          {waiting ? ` ${waiting}` : ""}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(syncNow)}
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-amber-900 ring-1 ring-amber-200 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden />
          Try now
        </button>
      </div>
    );
  } else if (pendingChanges > 0) {
    banners.push(
      <div
        key="sending"
        role="status"
        aria-live="polite"
        className="flex items-center justify-between gap-3 rounded-xl bg-sky-50 px-3 py-2.5 text-sm text-sky-900 ring-1 ring-sky-200"
      >
        <span>{waiting} Sending now…</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(syncNow)}
          className="min-h-9 rounded-full bg-white px-3 text-xs font-semibold text-sky-900 ring-1 ring-sky-200 disabled:opacity-60"
        >
          Send now
        </button>
      </div>
    );
  }

  if (!offline && !needsSignIn && readiness.state === "working") {
    banners.push(
      <div
        key="preparing"
        role="status"
        aria-live="polite"
        className="rounded-xl bg-sky-50 px-3 py-2.5 text-xs text-sky-900 ring-1 ring-sky-200"
      >
        Getting MyWitness ready for use without signal ({readiness.done} of {readiness.total}).
        Please keep the app open for a minute.
      </div>
    );
  }

  if (readyNote && !offline) {
    banners.push(
      <div
        key="ready"
        role="status"
        className="flex items-start justify-between gap-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900 ring-1 ring-emerald-200"
      >
        <span>
          <strong>Ready.</strong> MyWitness is saved on this phone and will now open
          without signal.
        </span>
        <button
          type="button"
          onClick={markReadySeen}
          className="min-h-9 shrink-0 rounded-full bg-white px-3 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200"
        >
          Got it
        </button>
      </div>
    );
  }

  if (banners.length === 0) return null;
  return <div className="space-y-2 px-4 pt-3">{banners}</div>;
}
