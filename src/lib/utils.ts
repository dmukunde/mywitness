import { format, formatDistanceToNow, isToday, isTomorrow, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, differenceInMinutes } from "date-fns";
import { twMerge } from "tailwind-merge";

/**
 * Joins class names AND resolves conflicting Tailwind utilities (e.g. a
 * variant's `text-stone-700` vs. a caller's `text-rose-700` override) by
 * keeping the later one — plain string concatenation left this to
 * Tailwind's internal stylesheet order, not the order classes appear here,
 * which silently broke every colored ghost/secondary button's intended
 * color across the app.
 */
export function cn(...classes: Array<string | false | null | undefined>) {
  return twMerge(classes.filter(Boolean).join(" "));
}

/** Convert empty strings to null for UUID / optional DB fields */
export function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function formatDisplayDate(date: string | Date) {
  const d = typeof date === "string" ? parseISO(date) : date;
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEE, MMM d");
}

export function formatFullDate(date: string | Date) {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "EEEE, MMMM d, yyyy");
}

export function formatTime(date: string | Date) {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "h:mm a");
}

export function formatDuration(minutes: number) {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Clock time for ministry display, e.g. 09:00 */
export function formatClockTime(date: string | Date) {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "HH:mm");
}

/** datetime-local input value from an ISO timestamp */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = parseISO(iso);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

/** ISO string from a datetime-local value */
export function fromDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}

export function formatDurationFromMs(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function greetingForNow(name?: string | null) {
  const hour = new Date().getHours();
  const greet =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const trimmed = name?.trim();
  return trimmed ? `${greet}, ${trimmed}.` : `${greet}.`;
}

/**
 * Prefer an explicit display name. Never treat the email local-part
 * (or a full email) as a person's name.
 */
export function sanitizeDisplayName(
  name: string | null | undefined,
  email?: string | null
): string {
  const trimmed = name?.trim() || "";
  if (!trimmed) return "";
  if (trimmed.includes("@")) return "";
  const local = email?.split("@")[0]?.trim().toLowerCase();
  if (local && trimmed.toLowerCase() === local) return "";
  return trimmed;
}

export function relativeDate(date: string) {
  return formatDistanceToNow(parseISO(date), { addSuffix: true });
}

export function todayISO() {
  return format(new Date(), "yyyy-MM-dd");
}

export function weekRange() {
  const now = new Date();
  return {
    start: format(startOfWeek(now, { weekStartsOn: 0 }), "yyyy-MM-dd"),
    end: format(endOfWeek(now, { weekStartsOn: 0 }), "yyyy-MM-dd"),
  };
}

export function monthRange() {
  const now = new Date();
  return {
    start: format(startOfMonth(now), "yyyy-MM-dd"),
    end: format(endOfMonth(now), "yyyy-MM-dd"),
  };
}

export function minutesBetween(start: string, end: string) {
  return Math.max(0, differenceInMinutes(parseISO(end), parseISO(start)));
}

export function parseScriptures(value: string): string[] {
  return value
    .split(/[;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function scripturesToString(scriptures: string[]): string {
  return scriptures.join("; ");
}

export function getNextSaturdayAfternoon(): { date: string; time: string } {
  const d = new Date();
  const day = d.getDay();
  const daysUntilSat = (6 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilSat);
  return {
    date: format(d, "yyyy-MM-dd"),
    time: "Afternoon",
  };
}
