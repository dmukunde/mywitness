"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Pause, Play, Square, X } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { Button, Card, Input, Textarea } from "@/components/ui";
import { formatDuration, formatDurationFromMs } from "@/lib/utils";
import { format, parseISO } from "date-fns";

const LONG_SESSION_MS = 6 * 60 * 60 * 1000; // 6 hours
const pauseKey = (sessionId: string) => `mywitness-timer-pause-${sessionId}`;

function loadPauseState(sessionId: string): {
  accumulatedMs: number;
  pausedAt: number | null;
} {
  if (typeof window === "undefined") return { accumulatedMs: 0, pausedAt: null };
  try {
    const raw = localStorage.getItem(pauseKey(sessionId));
    if (!raw) return { accumulatedMs: 0, pausedAt: null };
    const parsed = JSON.parse(raw);
    return {
      accumulatedMs: Number(parsed.accumulatedMs) || 0,
      pausedAt: parsed.pausedAt ?? null,
    };
  } catch {
    return { accumulatedMs: 0, pausedAt: null };
  }
}

function savePauseState(
  sessionId: string,
  state: { accumulatedMs: number; pausedAt: number | null }
) {
  localStorage.setItem(pauseKey(sessionId), JSON.stringify(state));
}

function clearPauseState(sessionId: string) {
  localStorage.removeItem(pauseKey(sessionId));
}

export function MinistryTimer({
  onStartManual,
  monthMinutes,
  allTimeMinutes,
}: {
  /** Opens the existing manual hours/minutes editor. */
  onStartManual: () => void;
  /** Minutes already saved this month (sum of saved sessions — never the live timer). */
  monthMinutes: number;
  /** Every saved session ever, regardless of month or year — never the live timer. */
  allTimeMinutes: number;
}) {
  const { activeMinistrySession, startMinistryTimer, endMinistryTimer, discardMinistryTimer } =
    useApp();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pauseState, setPauseState] = useState(() =>
    activeMinistrySession ? loadPauseState(activeMinistrySession.id) : { accumulatedMs: 0, pausedAt: null }
  );
  const [confirming, setConfirming] = useState(false);
  const [editHours, setEditHours] = useState(0);
  const [editMinutes, setEditMinutes] = useState(0);
  const [notes, setNotes] = useState("");
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tickRef = useRef<number | null>(null);

  const [syncedSessionId, setSyncedSessionId] = useState(
    activeMinistrySession?.id ?? null
  );
  if ((activeMinistrySession?.id ?? null) !== syncedSessionId) {
    setSyncedSessionId(activeMinistrySession?.id ?? null);
    setPauseState(
      activeMinistrySession
        ? loadPauseState(activeMinistrySession.id)
        : { accumulatedMs: 0, pausedAt: null }
    );
  }

  useEffect(() => {
    if (!activeMinistrySession || pauseState.pausedAt) {
      if (tickRef.current) window.clearInterval(tickRef.current);
      return;
    }
    tickRef.current = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [activeMinistrySession, pauseState.pausedAt]);

  if (!activeMinistrySession) {
    const hasTime = monthMinutes > 0;
    const monthLabel = format(new Date(), "MMMM");
    return (
      <Card>
        <p className="text-sm font-medium text-stone-500">{monthLabel} ministry time</p>
        {hasTime ? (
          <>
            <p className="mt-2 font-display text-2xl font-semibold text-emerald-800">
              {formatDuration(monthMinutes)} completed
            </p>
            {allTimeMinutes > 0 && (
              <p className="mt-1 text-sm font-medium text-amber-800">
                All-time ministry: {formatDuration(allTimeMinutes)}
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-stone-500">Track time as you go, or add it later.</p>
        )}
        <Link
          href="/activity"
          className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-emerald-800"
        >
          View activity history &amp; Monthly Report
          <ChevronRight className="h-4 w-4" />
        </Link>
        <div className="mt-4 space-y-2">
          <Button
            variant="record"
            className="w-full"
            onClick={async () => {
              setError(null);
              try {
                await startMinistryTimer();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not start timer.");
              }
            }}
          >
            <Play className="h-5 w-5" />
            Start Ministry
          </Button>
          <Button variant="secondary" className="w-full" onClick={onStartManual}>
            Add Time Manually
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      </Card>
    );
  }

  const startMs = parseISO(activeMinistrySession.start_time).getTime();
  const rawElapsedMs = (pauseState.pausedAt ?? nowMs) - startMs;
  const elapsedMs = Math.max(0, rawElapsedMs - pauseState.accumulatedMs);
  const isPaused = pauseState.pausedAt != null;
  const isLong = elapsedMs > LONG_SESSION_MS;

  const pause = () => {
    const next = { accumulatedMs: pauseState.accumulatedMs, pausedAt: Date.now() };
    savePauseState(activeMinistrySession.id, next);
    setPauseState(next);
  };

  const resume = () => {
    const additional = pauseState.pausedAt ? Date.now() - pauseState.pausedAt : 0;
    const next = {
      accumulatedMs: pauseState.accumulatedMs + additional,
      pausedAt: null,
    };
    savePauseState(activeMinistrySession.id, next);
    setPauseState(next);
  };

  const openConfirm = () => {
    const minutes = Math.round(elapsedMs / 60000);
    setEditHours(Math.floor(minutes / 60));
    setEditMinutes(minutes % 60);
    setNotes(activeMinistrySession.personal_reflection || "");
    setConfirming(true);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const duration = editHours * 60 + editMinutes;
      await endMinistryTimer({ durationMinutesOverride: duration, notes: notes.trim() || undefined });
      clearPauseState(activeMinistrySession.id);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save ministry time.");
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    setBusy(true);
    try {
      await discardMinistryTimer();
      clearPauseState(activeMinistrySession.id);
      setDiscardConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not discard timer.");
    } finally {
      setBusy(false);
    }
  };

  if (confirming) {
    return (
      <Card className="space-y-3">
        <p className="text-sm font-medium text-stone-500">End ministry session</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-stone-400">Started</p>
            <p className="font-medium text-stone-800">
              {new Date(startMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
          </div>
          <div>
            <p className="text-xs text-stone-400">Ending</p>
            <p className="font-medium text-stone-800">
              {new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Hours"
            type="number"
            min={0}
            value={editHours}
            onChange={(e) => setEditHours(Math.max(0, Number(e.target.value) || 0))}
          />
          <Input
            label="Minutes"
            type="number"
            min={0}
            max={59}
            value={editMinutes}
            onChange={(e) => setEditMinutes(Math.min(59, Math.max(0, Number(e.target.value) || 0)))}
          />
        </div>
        {isLong && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            This is an unusually long session — double-check the duration before saving.
          </p>
        )}
        <Textarea
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)} disabled={busy}>
            Back
          </Button>
          <Button className="flex-1" onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-stone-500">
          {isPaused ? "Ministry paused" : "Ministry in progress"}
        </p>
        <button
          type="button"
          onClick={() => setDiscardConfirm(true)}
          className="text-xs font-medium text-stone-400 hover:text-rose-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="font-display text-4xl font-semibold tracking-tight text-emerald-800">
        {formatDurationFromMs(elapsedMs)}
      </p>
      <p className="flex items-center gap-1.5 text-sm text-amber-700">
        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
        {isPaused
          ? "Paused — not counted until resumed and saved"
          : "Currently running — not yet saved"}
      </p>
      {monthMinutes > 0 && (
        <p className="text-xs text-stone-500">
          {format(new Date(), "MMMM")} completed so far: {formatDuration(monthMinutes)}
        </p>
      )}
      <Link
        href="/activity"
        className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-800"
      >
        View activity history
        <ChevronRight className="h-4 w-4" />
      </Link>
      {isLong && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" />
          This session has been running a long time.
        </p>
      )}
      {discardConfirm ? (
        <div className="space-y-2 rounded-xl bg-rose-50 p-3">
          <p className="text-sm text-rose-800">Discard this timer? Nothing will be saved.</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setDiscardConfirm(false)}>
              Keep timer
            </Button>
            <Button variant="danger" className="flex-1" onClick={() => void discard()} disabled={busy}>
              Discard
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {isPaused ? (
            <Button variant="secondary" onClick={resume}>
              <Play className="h-4 w-4" />
              Resume
            </Button>
          ) : (
            <Button variant="secondary" onClick={pause}>
              <Pause className="h-4 w-4" />
              Pause
            </Button>
          )}
          <Button onClick={openConfirm}>
            <Square className="h-4 w-4" />
            End Ministry
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </Card>
  );
}
