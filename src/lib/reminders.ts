import { addMonths, addWeeks, addDays, addMinutes, format, isToday, isTomorrow, setHours, setMinutes, startOfDay, nextSaturday, isSameDay } from "date-fns";

/**
 * Personal reminders: "remind me to ..." — independent of return visits and
 * Bible studies, optionally about one contact.
 */

export type ReminderRepeat = "none" | "weekly" | "monthly";

export interface PersonalReminder {
  id: string;
  user_id: string;
  person_id: string | null;
  text: string;
  due_at: string;
  repeat: ReminderRepeat;
  notified_at: string | null;
  done_at: string | null;
  dismissed_at: string | null;
  last_done_at: string | null;
  created_at: string;
  updated_at: string;
}

export const REPEAT_LABELS: Record<ReminderRepeat, string> = {
  none: "Once",
  weekly: "Every week",
  monthly: "Every month",
};

/** Open = still waiting for the user (not done, not dismissed). */
export function isOpen(r: Pick<PersonalReminder, "done_at" | "dismissed_at">): boolean {
  return !r.done_at && !r.dismissed_at;
}

export type ReminderState = "overdue" | "upcoming";

/** A reminder whose time has come stays "overdue" until it is dealt with. */
export function reminderState(
  r: Pick<PersonalReminder, "due_at">,
  now: Date = new Date()
): ReminderState {
  return Date.parse(r.due_at) <= now.getTime() ? "overdue" : "upcoming";
}

/** Open reminders, soonest first. */
export function sortOpen(reminders: PersonalReminder[]): PersonalReminder[] {
  return reminders
    .filter(isOpen)
    .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
}

// ---- choosing a time in a couple of taps ----------------------------------

export interface WhenChoice {
  id: string;
  label: string;
  at: Date;
}

const atTime = (d: Date, h: number, m = 0) =>
  setMinutes(setHours(startOfDay(d), h), m);

/**
 * Quick choices for "when", relative to now. Only times still ahead are
 * offered; two choices that land on the same moment are not both listed.
 */
export function whenChoices(now: Date = new Date()): WhenChoice[] {
  const all: WhenChoice[] = [
    { id: "hour", label: "In 1 hour", at: addMinutes(now, 60) },
    { id: "tonight", label: "Tonight 7 PM", at: atTime(now, 19) },
    { id: "tomorrow", label: "Tomorrow 9 AM", at: atTime(addDays(now, 1), 9) },
    {
      id: "saturday",
      label: "Saturday 7 PM",
      at: atTime(isSameDay(now, nextSaturdayOrToday(now)) ? now : nextSaturday(now), 19),
    },
  ];
  const minute = (c: WhenChoice) => Math.floor(c.at.getTime() / 60_000);
  const future = all.filter((c) => c.at.getTime() > now.getTime());
  // "In 1 hour" is the least specific: if it lands on another choice's moment
  // (e.g. exactly 7 PM), the named one wins. Otherwise first listed wins.
  const named = new Set(future.filter((c) => c.id !== "hour").map(minute));
  const seen = new Set<number>();
  return future.filter((c) => {
    if (c.id === "hour" && named.has(minute(c))) return false;
    if (seen.has(minute(c))) return false;
    seen.add(minute(c));
    return true;
  });
}

function nextSaturdayOrToday(now: Date): Date {
  return now.getDay() === 6 ? now : nextSaturday(now);
}

/** The time pre-selected when the sheet opens: this evening, else tomorrow morning. */
export function defaultWhen(now: Date = new Date()): WhenChoice {
  const choices = whenChoices(now);
  return (
    choices.find((c) => c.id === "tonight") ??
    choices.find((c) => c.id === "tomorrow") ??
    choices[0]
  );
}

/** Choices for pushing a reminder back. */
export function snoozeChoices(now: Date = new Date()): WhenChoice[] {
  const all: WhenChoice[] = [
    { id: "10min", label: "10 minutes", at: addMinutes(now, 10) },
    { id: "1hour", label: "1 hour", at: addMinutes(now, 60) },
    { id: "tonight", label: "Tonight 7 PM", at: atTime(now, 19) },
    { id: "tomorrow", label: "Tomorrow 9 AM", at: atTime(addDays(now, 1), 9) },
  ];
  return all.filter((c) => c.at.getTime() > now.getTime());
}

// ---- finishing and repeating ------------------------------------------------

/** The next time a repeating reminder falls after `now`. */
export function nextOccurrence(
  due: Date,
  repeat: ReminderRepeat,
  now: Date = new Date()
): Date | null {
  if (repeat === "none") return null;
  // Step from the original time so a monthly "31st" does not drift. Always at
  // least one step past `due`: finishing this occurrence must move to the next,
  // even if it was finished early (before it was due).
  const step = (i: number) => (repeat === "weekly" ? addWeeks(due, i) : addMonths(due, i));
  let i = 1;
  let next = step(i);
  while (next.getTime() <= now.getTime() && i < 1000) next = step(++i);
  return next;
}

/**
 * What changes when a reminder is marked done. A one-off is finished; a
 * repeating one stays open, moved to its next occurrence.
 */
export function completionPatch(
  r: Pick<PersonalReminder, "due_at" | "repeat">,
  now: Date = new Date()
): Partial<PersonalReminder> {
  const stamp = now.toISOString();
  const next = nextOccurrence(new Date(r.due_at), r.repeat, now);
  return next
    ? { due_at: next.toISOString(), last_done_at: stamp }
    : { done_at: stamp, last_done_at: stamp };
}

// ---- what a notification says ----------------------------------------------

export interface PushPayload {
  title: string;
  body: string;
  /** Same tag = one notification on the device, however many arrive. */
  tag: string;
  url: string;
}

/**
 * The notification text. In private mode nothing identifying appears on the
 * lock screen — just that a reminder is waiting.
 */
export function reminderPushPayload(
  r: Pick<PersonalReminder, "id" | "text">,
  opts: { privateMode?: boolean } = {}
): PushPayload {
  return {
    title: "MyWitness reminder",
    body: opts.privateMode ? "You have a reminder." : r.text,
    tag: `reminder-${r.id}`,
    url: `/reminders?reminder=${r.id}`,
  };
}

// ---- calendar fallback ------------------------------------------------------

const icsStamp = (d: Date) =>
  d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const icsEscape = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/**
 * A calendar entry (.ics) with an alarm at the reminder's time, for devices
 * where push notifications aren't available. Opens in any calendar app.
 */
export function buildIcs(
  r: Pick<PersonalReminder, "id" | "text" | "due_at" | "repeat">,
  opts: { contactName?: string | null; now?: Date } = {}
): string {
  const start = new Date(r.due_at);
  const end = addMinutes(start, 15);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MyWitness//Reminders//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${r.id}@mywitness`,
    `DTSTAMP:${icsStamp(opts.now ?? new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEscape(r.text)}`,
  ];
  if (opts.contactName) lines.push(`DESCRIPTION:${icsEscape(`About ${opts.contactName}`)}`);
  if (r.repeat === "weekly") lines.push("RRULE:FREQ=WEEKLY");
  if (r.repeat === "monthly") lines.push("RRULE:FREQ=MONTHLY");
  lines.push(
    "BEGIN:VALARM",
    "TRIGGER:PT0M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(r.text)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  );
  return lines.join("\r\n") + "\r\n";
}

/** A "add to Google Calendar" link for the same reminder. */
export function googleCalendarUrl(
  r: Pick<PersonalReminder, "text" | "due_at" | "repeat">,
  opts: { contactName?: string | null } = {}
): string {
  const start = new Date(r.due_at);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: r.text,
    dates: `${icsStamp(start)}/${icsStamp(addMinutes(start, 15))}`,
  });
  if (opts.contactName) params.set("details", `About ${opts.contactName}`);
  if (r.repeat === "weekly") params.set("recur", "RRULE:FREQ=WEEKLY");
  if (r.repeat === "monthly") params.set("recur", "RRULE:FREQ=MONTHLY");
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** "Today · 7:00 PM", "Tomorrow · 9:00 AM", "Sat, Oct 17 · 7:00 PM". */
export function describeWhen(due: Date): string {
  const day = isToday(due) ? "Today" : isTomorrow(due) ? "Tomorrow" : format(due, "EEE, MMM d");
  return `${day} · ${format(due, "h:mm a")}`;
}
