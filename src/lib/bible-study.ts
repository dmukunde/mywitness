import { isBefore, parseISO } from "date-fns";
import type { BibleStudy } from "@/lib/types";

/** Overdue = still active, has a next study date, and that date has passed. */
export function isStudyOverdue(study: BibleStudy, today: string): boolean {
  return (
    study.status === "active" &&
    !!study.next_study_date &&
    isBefore(parseISO(study.next_study_date), parseISO(today))
  );
}

/** Progress 0–100 from lesson number / total (user-editable total). */
export function studyProgressPercent(study: Pick<
  BibleStudy,
  "current_lesson_number" | "total_lessons"
>): number {
  const total = Math.max(1, study.total_lessons || 1);
  const current = Math.min(Math.max(0, study.current_lesson_number || 0), total);
  return Math.round((current / total) * 100);
}

export function studyProgressLabel(study: Pick<
  BibleStudy,
  "current_lesson_number" | "total_lessons" | "current_lesson"
>): string {
  const total = Math.max(1, study.total_lessons || 1);
  const current = Math.min(Math.max(0, study.current_lesson_number || 0), total);
  return `Lesson ${current} of ${total}`;
}

/** Parse a leading integer from "Lesson 6", "6", "Chapter 12", etc. */
export function parseLessonNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(\d+)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}
