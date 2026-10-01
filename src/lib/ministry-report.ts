import { format, parseISO } from "date-fns";
import type { BibleStudySession, Conversation, MinistrySession } from "@/lib/types";
import { formatDuration } from "@/lib/utils";
import { groupMinutesByDate, sumMinutesForRange } from "@/lib/ministry-time";

/**
 * Month-end ministry report — built entirely from data MyWitness already
 * records (ministry_sessions, bible_study_sessions, conversations). No new
 * tables or fields: "shared in the ministry" and "Bible studies" are both
 * derived, not stored, the same way monthMinutes already is.
 */

/** Distinct Bible studies with at least one session held in [start, end]. */
export function countBibleStudiesForRange(
  bibleStudySessions: BibleStudySession[],
  start: string,
  end: string
): number {
  const ids = new Set(
    bibleStudySessions
      .filter((s) => s.session_date >= start && s.session_date <= end)
      .map((s) => s.bible_study_id)
  );
  return ids.size;
}

/**
 * Best-effort "did I do anything in the ministry this month" signal, from
 * every kind of activity MyWitness tracks — a timed session, a recorded
 * conversation, or a Bible study session — since not everyone logs time.
 * This is only ever a *default*; the report screen lets the user override
 * it, since the app can't see activity it was never told about.
 */
export function wasActiveInMinistry(
  sessions: MinistrySession[],
  conversations: Conversation[],
  bibleStudySessions: BibleStudySession[],
  start: string,
  end: string
): boolean {
  const inRange = (date: string) => date >= start && date <= end;
  return (
    sumMinutesForRange(sessions, start, end) > 0 ||
    conversations.some((c) => inRange(c.conversation_date)) ||
    bibleStudySessions.some((s) => inRange(s.session_date))
  );
}

/** Daily ministry-time breakdown within [start, end], earliest day first. */
export function dailyBreakdownForRange(
  sessions: MinistrySession[],
  start: string,
  end: string
): Array<{ date: string; minutes: number }> {
  const byDate = groupMinutesByDate(sessions);
  return [...byDate.entries()]
    .filter(([date]) => date >= start && date <= end)
    .map(([date, minutes]) => ({ date, minutes }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface MonthlyReportData {
  monthKey: string;
  shared: boolean;
  bibleStudies: number;
  minutes: number;
  dailyBreakdown: Array<{ date: string; minutes: number }>;
}

/** "September 2026" from a "yyyy-MM" key. */
export function monthLabel(monthKey: string): string {
  return format(parseISO(`${monthKey}-01`), "MMMM yyyy");
}

/**
 * The official, shareable report text — only reportable totals, never
 * names, notes, addresses, or any other private ministry record. Omits the
 * Hours line entirely when there's no logged time, since a publisher who
 * doesn't track hours shouldn't have their report imply "0 hours worked."
 * `includeDailyBreakdown` is opt-in and off by default — the daily list is
 * a personal record, not part of the official report, unless the user
 * deliberately chooses to attach it.
 */
export function buildReportText(
  report: MonthlyReportData,
  { includeDailyBreakdown = false }: { includeDailyBreakdown?: boolean } = {}
): string {
  const lines = [
    `${monthLabel(report.monthKey)} Ministry Report`,
    "",
    `Shared in the ministry: ${report.shared ? "Yes" : "No"}`,
    `Bible studies: ${report.bibleStudies}`,
  ];
  if (report.minutes > 0) {
    lines.push(`Hours: ${formatDuration(report.minutes)}`);
  }

  if (includeDailyBreakdown && report.dailyBreakdown.length > 0) {
    lines.push("", "Ministry Activity");
    for (const { date, minutes } of report.dailyBreakdown) {
      lines.push(`${format(parseISO(date), "MMM d")} — ${formatDuration(minutes)}`);
    }
  }

  return lines.join("\n");
}
