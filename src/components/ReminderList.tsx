"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/app-context";
import { Button, Input, Select, Sheet } from "@/components/ui";
import { SuccessBanner } from "@/components/badges";
import { chip } from "@/components/AddReminderSheet";
import { useSingleFlight } from "@/hooks/useSingleFlight";
import { formatDbError } from "@/lib/db-errors";
import {
  REPEAT_LABELS,
  buildIcs,
  describeWhen,
  googleCalendarUrl,
  reminderState,
  snoozeChoices,
  type PersonalReminder,
  type ReminderRepeat,
} from "@/lib/reminders";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type Notice = { text: string; undo?: () => Promise<void> };

/** Hands the browser a calendar file for this reminder. */
function downloadIcs(r: PersonalReminder, contactName?: string | null) {
  const blob = new Blob([buildIcs(r, { contactName })], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "reminder.ics";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Open reminders with the three things you do about one — Done, Snooze,
 * Reschedule — each undoable. Dismiss and Add-to-calendar live in
 * Reschedule. Used on Home, a contact's profile and the Reminders screen.
 */
export function ReminderList({
  reminders,
  showPerson = true,
  highlightId,
}: {
  reminders: PersonalReminder[];
  showPerson?: boolean;
  highlightId?: string | null;
}) {
  const {
    people,
    archivedPeople,
    updatePersonalReminder,
    finishPersonalReminder,
  } = useApp();
  const guard = useSingleFlight();
  const [now] = useState(() => new Date());
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snoozing, setSnoozing] = useState<PersonalReminder | null>(null);
  const [editing, setEditing] = useState<PersonalReminder | null>(null);

  const nameOf = (id: string | null) =>
    id ? [...people, ...archivedPeople].find((p) => p.id === id)?.name ?? null : null;

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(
        err instanceof Error && err.message.startsWith("DUPLICATE_REMINDER:")
          ? "You already have this reminder for that time."
          : formatDbError("update reminder", err, "Could not update this reminder.")
      );
    }
  };

  const done = (r: PersonalReminder) =>
    run(async () => {
      const undo = await finishPersonalReminder(r.id);
      setNotice({
        text: r.repeat === "none" ? "Done." : "Done — next one is set.",
        undo: () => updatePersonalReminder(r.id, undo),
      });
    });

  const snooze = (r: PersonalReminder, at: Date) =>
    run(async () => {
      const previous = r.due_at;
      await updatePersonalReminder(r.id, { due_at: at.toISOString() });
      setSnoozing(null);
      setNotice({
        text: `Snoozed until ${describeWhen(at)}.`,
        undo: () => updatePersonalReminder(r.id, { due_at: previous }),
      });
    });

  const dismiss = (r: PersonalReminder) =>
    run(async () => {
      await updatePersonalReminder(r.id, { dismissed_at: new Date().toISOString() });
      setEditing(null);
      setNotice({
        text: "Reminder dismissed.",
        undo: () => updatePersonalReminder(r.id, { dismissed_at: null }),
      });
    });

  const undo = async () => {
    const n = notice;
    setNotice(null);
    if (n?.undo) await run(n.undo);
  };

  if (!reminders.length && !notice) return null;

  return (
    <div className="space-y-2">
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
        </SuccessBanner>
      )}

      <ul className="space-y-2">
        {reminders.map((r) => {
          const overdue = reminderState(r, now) === "overdue";
          const who = showPerson ? nameOf(r.person_id) : null;
          return (
            <li
              key={r.id}
              id={`reminder-${r.id}`}
              ref={(el) => {
                if (el && r.id === highlightId) el.scrollIntoView({ block: "center" });
              }}
              className={cn(
                "rounded-2xl bg-white p-3.5 shadow-sm ring-1",
                overdue ? "ring-rose-200" : "ring-stone-200/70",
                r.id === highlightId && "ring-2 ring-emerald-500"
              )}
            >
              <p className="font-medium text-stone-900">{r.text}</p>
              <p className="mt-0.5 text-xs">
                <span className={overdue ? "font-medium text-rose-700" : "text-stone-500"}>
                  {overdue ? "Overdue · " : ""}
                  {describeWhen(new Date(r.due_at))}
                </span>
                {r.repeat !== "none" && (
                  <span className="text-stone-500"> · {REPEAT_LABELS[r.repeat]}</span>
                )}
                {who && r.person_id && (
                  <>
                    <span className="text-stone-500"> · </span>
                    <Link href={`/people/${r.person_id}`} className="font-medium text-emerald-800">
                      {who}
                    </Link>
                  </>
                )}
              </p>
              <div className="mt-2.5 flex gap-1.5">
                <Button size="sm" className="flex-1" onClick={() => void guard(() => done(r))}>
                  Done
                </Button>
                <Button size="sm" variant="secondary" className="flex-1" onClick={() => setSnoozing(r)}>
                  Snooze
                </Button>
                <Button size="sm" variant="secondary" className="flex-1" onClick={() => setEditing(r)}>
                  Reschedule
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <Sheet
        open={snoozing !== null}
        title="Snooze until…"
        subtitle={snoozing?.text}
        onClose={() => setSnoozing(null)}
      >
        <div className="grid grid-cols-2 gap-2">
          {snoozing &&
            snoozeChoices(new Date()).map((c) => (
              <Button
                key={c.id}
                variant="secondary"
                onClick={() => void guard(() => snooze(snoozing, c.at))}
              >
                {c.label}
              </Button>
            ))}
        </div>
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            setEditing(snoozing);
            setSnoozing(null);
          }}
        >
          Pick another time
        </Button>
      </Sheet>

      {editing && (
        <EditReminderSheet
          key={editing.id}
          reminder={editing}
          contactName={nameOf(editing.person_id)}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setNotice({ text });
          }}
          onDismiss={() => void guard(() => dismiss(editing))}
        />
      )}
    </div>
  );
}

function EditReminderSheet({
  reminder,
  contactName,
  onClose,
  onSaved,
  onDismiss,
}: {
  reminder: PersonalReminder;
  contactName: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
  onDismiss: () => void;
}) {
  const { people, updatePersonalReminder } = useApp();
  const guard = useSingleFlight();
  const due = useMemo(() => new Date(reminder.due_at), [reminder.due_at]);
  const [text, setText] = useState(reminder.text);
  const [date, setDate] = useState(format(due, "yyyy-MM-dd"));
  const [time, setTime] = useState(format(due, "HH:mm"));
  const [repeat, setRepeat] = useState<ReminderRepeat>(reminder.repeat);
  const [person, setPerson] = useState(reminder.person_id ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const at = new Date(`${date}T${time}`);
    if (!text.trim()) return setError("Write what you want to be reminded about.");
    if (Number.isNaN(at.getTime())) return setError("Choose a date and time.");
    setError(null);
    try {
      await updatePersonalReminder(reminder.id, {
        text: text.trim(),
        due_at: at.toISOString(),
        repeat,
        person_id: person || null,
      });
      onSaved(`Rescheduled to ${describeWhen(at)}.`);
    } catch (err) {
      setError(
        err instanceof Error && err.message.startsWith("DUPLICATE_REMINDER:")
          ? "You already have this reminder for that time."
          : formatDbError("update reminder", err, "Could not save.")
      );
    }
  };

  // What the calendar options should use: the words and time currently shown.
  const shown = new Date(`${date}T${time}`);
  const preview = {
    ...reminder,
    text: text.trim() || reminder.text,
    repeat,
    due_at: Number.isNaN(shown.getTime()) ? reminder.due_at : shown.toISOString(),
  };

  return (
    <Sheet open title="Reschedule" onClose={onClose}>
      <Input label="Reminder" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(REPEAT_LABELS) as ReminderRepeat[]).map((r) => (
          <button key={r} type="button" onClick={() => setRepeat(r)} className={chip(repeat === r)}>
            {REPEAT_LABELS[r]}
          </button>
        ))}
      </div>
      <Select label="About" value={person} onChange={(e) => setPerson(e.target.value)}>
        <option value="">No one in particular</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <Button className="w-full" onClick={() => void guard(save)}>
        Save
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          onClick={() => downloadIcs(preview, contactName)}
        >
          Add to calendar
        </Button>
        <a
          href={googleCalendarUrl(preview, { contactName })}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-stone-100 px-4 text-sm font-semibold text-stone-800 hover:bg-stone-200"
        >
          Google Calendar
        </a>
      </div>
      <Button variant="ghost" className="w-full text-rose-700" onClick={onDismiss}>
        Dismiss this reminder
      </Button>
      <Button variant="ghost" className="w-full" onClick={onClose}>
        Cancel
      </Button>
    </Sheet>
  );
}
