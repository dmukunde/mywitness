"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/app-context";
import { Button, Card, Input, SectionTitle, Sheet, TimeField } from "@/components/ui";
import { SuccessBanner } from "@/components/badges";
import { useSingleFlight } from "@/hooks/useSingleFlight";
import { formatDbError } from "@/lib/db-errors";
import { studyToFormData } from "@/lib/bible-study";
import type { ScheduledActivity } from "@/lib/schedule";
import { formatDisplayDate, todayISO } from "@/lib/utils";

type Notice = { text: string; undo?: () => Promise<void>; noteHref?: string };

/** How many are shown before "View all" — Home stays compact. */
const COMPACT = 2;

/**
 * Genuinely outstanding follow-ups, with the three things you actually do
 * about one — mark it done, move it, or let it go — right where you see it.
 *
 * What is listed is read from the same schedule as every other screen, so a
 * visit that has been followed up (a later conversation, a Bible study begun,
 * a session held) is simply not here. Acting on one removes it at once, and a
 * banner offers Undo.
 */
export function OverdueFollowUps() {
  const {
    activities,
    people,
    bibleStudies,
    updateReturnVisit,
    deleteReturnVisit,
    saveBibleStudy,
  } = useApp();
  const guard = useSingleFlight();
  const [showAll, setShowAll] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [moving, setMoving] = useState<ScheduledActivity | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(
    () => activities.filter((a) => a.state === "overdue"),
    [activities]
  );

  const nameOf = (a: ScheduledActivity) =>
    people.find((p) => p.id === a.person_id)?.name || "Person";
  const isStudy = (a: ScheduledActivity) => a.event_type === "bible_study";
  const studyOf = (a: ScheduledActivity) =>
    bibleStudies.find((s) => s.id === a.bible_study_id);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(formatDbError("update follow-up", err, "Could not update this follow-up."));
    }
  };

  // ---- visits: done / let go (both undoable) --------------------------------
  const reopenVisit = (id: string) => () =>
    updateReturnVisit(id, { status: "planned", completed_at: null });

  const done = (a: ScheduledActivity) =>
    run(async () => {
      const id = a.return_visit_id!;
      await updateReturnVisit(id, {
        status: "completed",
        completed_at: new Date().toISOString(),
      });
      setNotice({
        text: `${nameOf(a)} marked as done.`,
        undo: reopenVisit(id),
        noteHref: `/conversations/new?personId=${a.person_id}`,
      });
    });

  const letGo = (a: ScheduledActivity) =>
    run(async () => {
      if (isStudy(a)) {
        const study = studyOf(a);
        if (!study) return;
        const person = people.find((p) => p.id === study.person_id);
        const previous = {
          next_study_date: study.next_study_date || "",
          next_study_time: study.next_study_time || "",
        };
        await saveBibleStudy(
          studyToFormData(study, person, { next_study_date: "", next_study_time: "" }),
          study.id,
          { allowDuplicate: true }
        );
        setNotice({
          text: `${nameOf(a)}'s study appointment removed.`,
          undo: async () => {
            await saveBibleStudy(
              studyToFormData(study, person, previous),
              study.id,
              { allowDuplicate: true }
            );
          },
        });
        return;
      }
      const id = a.return_visit_id!;
      await deleteReturnVisit(id);
      setNotice({ text: `${nameOf(a)}'s follow-up dismissed.`, undo: reopenVisit(id) });
    });

  // ---- reschedule -------------------------------------------------------------
  const openMove = (a: ScheduledActivity) => {
    setMoveError(null);
    setDate(todayISO());
    setTime(a.scheduled_time || "");
    setMoving(a);
  };

  const doMove = async () => {
    if (!moving) return;
    if (!date) {
      setMoveError("Choose a date.");
      return;
    }
    setMoveError(null);
    try {
      if (isStudy(moving)) {
        const study = studyOf(moving);
        if (!study) return;
        await saveBibleStudy(
          studyToFormData(
            study,
            people.find((p) => p.id === study.person_id),
            { next_study_date: date, next_study_time: time }
          ),
          study.id,
          { allowDuplicate: true }
        );
      } else {
        await updateReturnVisit(moving.return_visit_id!, {
          scheduled_date: date,
          scheduled_time: time || null,
          status: "planned",
        });
      }
      setNotice({
        text: `${nameOf(moving)} rescheduled to ${formatDisplayDate(date)}${time ? ` · ${time}` : ""}.`,
      });
      setMoving(null);
    } catch (err) {
      setMoveError(
        formatDbError("reschedule follow-up", err, "Could not reschedule this.")
      );
    }
  };

  const undo = async () => {
    const n = notice;
    setNotice(null);
    if (n?.undo) await run(n.undo);
  };

  if (!items.length && !notice) return null;
  const shown = showAll ? items : items.slice(0, COMPACT);

  return (
    <section className="space-y-2">
      <SectionTitle title="Overdue" />

      {notice && (
        <SuccessBanner onDismiss={() => setNotice(null)}>
          {notice.text}
          {notice.undo && (
            <button
              type="button"
              onClick={() => void undo()}
              className="ml-2 font-semibold text-amber-900 underline decoration-amber-300 underline-offset-2"
            >
              Undo
            </button>
          )}
          {notice.noteHref && (
            <Link
              href={notice.noteHref}
              className="ml-2 font-semibold text-amber-900 underline decoration-amber-300 underline-offset-2"
            >
              Add a note
            </Link>
          )}
        </SuccessBanner>
      )}

      {items.length > 0 && (
        <Card className="bg-rose-50/60 ring-rose-200">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-rose-900">
              {items.length} overdue follow-up{items.length === 1 ? "" : "s"}
            </p>
            {items.length > COMPACT && (
              <button
                type="button"
                className="min-h-9 shrink-0 text-sm font-semibold text-rose-800"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? "Show less" : "View all"}
              </button>
            )}
          </div>
          <ul className="mt-1 divide-y divide-rose-100">
            {shown.map((a) => {
              const study = isStudy(a);
              const href = study
                ? `/bible-studies/${a.bible_study_id}`
                : `/return-visits/${a.return_visit_id}`;
              return (
                <li key={a.id} className="py-2">
                  <Link href={href} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium text-stone-900">
                      {nameOf(a)}
                    </span>
                    <span className="shrink-0 text-xs text-rose-800">
                      {study ? "Bible study" : "Return visit"} ·{" "}
                      {formatDisplayDate(a.scheduled_date)}
                    </span>
                  </Link>
                  <div className="mt-1.5 flex gap-1.5">
                    {study ? (
                      <Link href={`/bible-studies/${a.bible_study_id}/session`} className="flex-1">
                        <Button size="sm" className="w-full" variant="secondary">
                          Record
                        </Button>
                      </Link>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => void guard(() => done(a))}
                      >
                        Done
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                      onClick={() => openMove(a)}
                    >
                      Reschedule
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1"
                      onClick={() => void guard(() => letGo(a))}
                    >
                      Dismiss
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {error && (
            <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
        </Card>
      )}

      <Sheet
        open={moving !== null}
        title={moving ? `Reschedule ${nameOf(moving)}` : "Reschedule"}
        subtitle="This changes the existing appointment. It won't add another."
        onClose={() => setMoving(null)}
      >
        <Input
          label="New date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <TimeField label="Time" value={time} onChange={setTime} />
        {moveError && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{moveError}</p>
        )}
        <Button className="w-full" onClick={() => void guard(doMove)}>
          Save new date
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setMoving(null)}>
          Cancel
        </Button>
      </Sheet>
    </section>
  );
}
