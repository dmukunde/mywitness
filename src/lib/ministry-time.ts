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
