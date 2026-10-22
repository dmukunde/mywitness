"use client";

import { useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/app-context";
import { Button, Input, Select, Sheet } from "@/components/ui";
import { NotificationSetup } from "@/components/NotificationSetup";
import { useSingleFlight } from "@/hooks/useSingleFlight";
import { usePushStatus } from "@/hooks/usePushStatus";
import { formatDbError } from "@/lib/db-errors";
import {
  REPEAT_LABELS,
  defaultWhen,
  describeWhen,
  whenChoices,
  type ReminderRepeat,
} from "@/lib/reminders";
import { cn } from "@/lib/utils";

const CUSTOM = "custom";

/** Chip styling shared by the "when" and "repeat" choices. */
export const chip = (active: boolean) =>
  cn(
    "min-h-10 rounded-full px-3.5 text-sm font-medium ring-1 transition",
    active
      ? "bg-emerald-700 text-white ring-emerald-700"
      : "bg-white text-stone-700 ring-stone-200 hover:bg-stone-50"
  );

/**
 * Set a reminder in a few taps: say what (type it, or tap a suggestion), tap a
 * time, save. About a contact if opened from their profile; or about nothing
 * in particular. Repeating is optional.
 */
export function AddReminderSheet({
  personId,
  onClose,
}: {
  personId?: string | null;
  onClose: () => void;
}) {
  const { people, addPersonalReminder } = useApp();
  const push = usePushStatus();
  const guard = useSingleFlight();
  // One id per open sheet: saving twice makes one reminder.
  const saveId = useRef<string | null>(null);

  const [now] = useState(() => new Date());
  const choices = useMemo(() => whenChoices(now), [now]);
  const [text, setText] = useState("");
  const [person, setPerson] = useState(personId ?? "");
  const [when, setWhen] = useState<string>(() => defaultWhen(now).id);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("09:00");
  const [repeat, setRepeat] = useState<ReminderRepeat>("none");
  const [error, setError] = useState<string | null>(null);
  const [savedFor, setSavedFor] = useState<Date | null>(null);

  const contact = people.find((p) => p.id === person);
  const first = contact?.name.split(" ")[0];
  const suggestions = [
    "Send meeting invitation",
    "Share a scripture",
    first ? `Check how ${first} is doing` : "Check how they're doing",
  ];

  const due = (): Date | null => {
    if (when === CUSTOM) {
      if (!customDate || !customTime) return null;
      const d = new Date(`${customDate}T${customTime}`);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return choices.find((c) => c.id === when)?.at ?? null;
  };

  const doSave = async () => {
    const at = due();
    if (!text.trim()) {
      setError("Write what you want to be reminded about.");
      return;
    }
    if (!at) {
      setError("Choose a date and time.");
      return;
    }
    if (at.getTime() <= Date.now() && repeat === "none") {
      setError("That time has already passed. Choose a time ahead.");
      return;
    }
    setError(null);
    saveId.current ??= crypto.randomUUID();
    try {
      await addPersonalReminder(
        { text, due_at: at.toISOString(), person_id: person || null, repeat },
        { clientId: saveId.current }
      );
      setSavedFor(at);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        msg.startsWith("DUPLICATE_REMINDER:")
          ? "You already have this reminder for that time."
          : formatDbError("save reminder", err, "Could not save this reminder.")
      );
    }
  };

  // ---- after saving: confirm, and offer notifications if they're not on ----
  if (savedFor) {
    const notificationsOn = push.subscribed && push.permission === "granted";
    return (
      <Sheet open title="Reminder set" subtitle={describeWhen(savedFor)} onClose={onClose}>
        <p className="text-sm text-stone-700">{text.trim()}</p>
        {!push.loading && !notificationsOn && <NotificationSetup compact />}
        <Button className="w-full" onClick={onClose}>
          Done
        </Button>
      </Sheet>
    );
  }

  return (
    <Sheet open title="Add reminder" onClose={onClose}>
      <div className="space-y-1.5">
        <Input
          label="Remind me to…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="For example: Remind Mary about Sunday's meeting"
          autoFocus
        />
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setText(s)}
              className="min-h-9 rounded-full bg-stone-100 px-3 text-xs font-medium text-stone-700 hover:bg-stone-200"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <Select label="About (optional)" value={person} onChange={(e) => setPerson(e.target.value)}>
        <option value="">No one in particular</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>

      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-stone-700">When</span>
        <div className="flex flex-wrap gap-1.5">
          {choices.map((c) => (
            <button key={c.id} type="button" onClick={() => setWhen(c.id)} className={chip(when === c.id)}>
              {c.label}
            </button>
          ))}
          <button type="button" onClick={() => setWhen(CUSTOM)} className={chip(when === CUSTOM)}>
            Pick date &amp; time
          </button>
        </div>
        {when === CUSTOM && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Input
              label="Date"
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
            />
            <Input
              label="Time"
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-stone-700">Repeat</span>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(REPEAT_LABELS) as ReminderRepeat[]).map((r) => (
            <button key={r} type="button" onClick={() => setRepeat(r)} className={chip(repeat === r)}>
              {REPEAT_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <Button className="w-full" onClick={() => void guard(doSave)}>
        Remind me
      </Button>
      <Button variant="ghost" className="w-full" onClick={onClose}>
        Cancel
      </Button>
    </Sheet>
  );
}
