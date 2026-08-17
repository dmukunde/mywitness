import { format } from "date-fns";
import type { MinistrySession } from "@/lib/types";
import { minutesBetween } from "@/lib/utils";

/**
 * Single source of truth for ministry-time totals. Today's Home card, the
 * Activity Summary, and the Calendar all call these same functions so a
 * total can never drift between screens. Only ever sums saved sessions
 * (rows with an id already persisted) — the live running timer is never
 * included here; callers add it separately, clearly labeled, until it's
 * actually ended and saved.
 */

function minutesOf(session: MinistrySession): number {
  if (session.duration_minutes != null) return session.duration_minutes;
  if (session.end_time) {
    return minutesBetween(session.start_time, session.end_time);
  }
  return 0;
}

/** Sum of all saved (non-active) sessions whose session_date falls within [start, end], inclusive. */
export function sumMinutesForRange(
  sessions: MinistrySession[],
  start: string,
  end: string
): number {
  return sessions
    .filter((s) => s.end_time != null && s.session_date >= start && s.session_date <= end)
    .reduce((sum, s) => sum + minutesOf(s), 0);
}

/** Saved sessions for one exact date, most recent first. */
export function sessionsOnDate(
  sessions: MinistrySession[],
  date: string
): MinistrySession[] {
  return sessions
    .filter((s) => s.end_time != null && s.session_date === date)
    .sort((a, b) => b.start_time.localeCompare(a.start_time));
}

/** Map of session_date -> total minutes, saved sessions only. */
export function groupMinutesByDate(
  sessions: MinistrySession[]
): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const s of sessions) {
    if (s.end_time == null) continue;
    byDate.set(s.session_date, (byDate.get(s.session_date) || 0) + minutesOf(s));
  }
  return byDate;
}

/** Map of "yyyy-MM" -> total minutes, saved sessions only. */
export function groupMinutesByMonth(
  sessions: MinistrySession[]
): Map<string, number> {
  const byMonth = new Map<string, number>();
  for (const s of sessions) {
    if (s.end_time == null) continue;
    const month = s.session_date.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) || 0) + minutesOf(s));
  }
  return byMonth;
}

/** Sum of every saved session, regardless of date — the all-time total. */
export function sumAllMinutes(sessions: MinistrySession[]): number {
  return sessions
    .filter((s) => s.end_time != null)
    .reduce((sum, s) => sum + minutesOf(s), 0);
}

/**
 * The 12-month window (inclusive, as yyyy-MM-dd strings) containing
 * `reference`, starting on `startMonth` (1-12). startMonth = 1 gives an
 * ordinary calendar year; any other value gives a "service year" style
 * window (e.g. 9 = September-August).
 */
export function yearRangeFor(
  startMonth: number,
  reference: Date = new Date()
): { start: string; end: string } {
  const refMonth = reference.getMonth() + 1;
  const refYear = reference.getFullYear();
  // If we haven't reached the start month yet this calendar year, the
  // current year-window began the previous calendar year.
  const startYear = refMonth >= startMonth ? refYear : refYear - 1;
  const start = new Date(startYear, startMonth - 1, 1);
  const end = new Date(startYear + 1, startMonth - 1, 0);
  return { start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") };
}
