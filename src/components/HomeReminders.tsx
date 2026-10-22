"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { Card, SectionTitle } from "@/components/ui";
import { AddReminderSheet } from "@/components/AddReminderSheet";
import { ReminderList } from "@/components/ReminderList";
import { usePushStatus } from "@/hooks/usePushStatus";
import { reminderState, sortOpen } from "@/lib/reminders";

const COMPACT = 3;
const WEEK_MS = 7 * 86_400_000;

/**
 * Reminders on Home: anything due or overdue, plus what's coming this week,
 * with Done / Snooze / Reschedule right there. With none yet, a one-tap way to
 * set the first. A due reminder stays here until it is done or dismissed.
 */
export function HomeReminders() {
  const { personalReminders } = useApp();
  const push = usePushStatus();
  const [adding, setAdding] = useState(false);
  const [now] = useState(() => new Date());

  const open = sortOpen(personalReminders);
  const relevant = open.filter(
    (r) => reminderState(r, now) === "overdue" || Date.parse(r.due_at) - now.getTime() <= WEEK_MS
  );
  const shown = relevant.slice(0, COMPACT);
  const overdue = relevant.filter((r) => reminderState(r, now) === "overdue").length;
  const canTurnOn =
    open.length > 0 && push.support === "ready" && push.serverConfigured && !push.subscribed;

  return (
    <section className="space-y-2">
      <SectionTitle
        title={overdue ? `Reminders · ${overdue} due` : "Reminders"}
        action={
          open.length > 0 ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-9 items-center gap-1 text-sm font-semibold text-emerald-800"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          ) : undefined
        }
      />

      {/* Always mounted: it holds the "Done — Undo" banner, which must outlive
          the last reminder disappearing from the list. */}
      <ReminderList reminders={shown} />

      {open.length === 0 ? (
        <Card onClick={() => setAdding(true)}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
              <Plus className="h-5 w-5 text-emerald-700" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-stone-900">Set a reminder</p>
              <p className="truncate text-sm text-stone-500">
                To follow up with someone at just the right time
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {shown.length === 0 && (
            <p className="rounded-2xl bg-white/60 px-4 py-3 text-sm text-stone-500 ring-1 ring-stone-200/60">
              Nothing due this week.
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <Link href="/reminders" className="min-h-9 text-sm font-semibold text-emerald-800">
              {open.length > shown.length ? `View all ${open.length}` : "Open reminders"}
            </Link>
            {canTurnOn && (
              <Link href="/reminders" className="min-h-9 text-sm font-medium text-stone-500 underline decoration-stone-300 underline-offset-2">
                Turn on notifications
              </Link>
            )}
          </div>
        </>
      )}

      {adding && <AddReminderSheet onClose={() => setAdding(false)} />}
    </section>
  );
}

