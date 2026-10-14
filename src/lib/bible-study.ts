import type { BibleStudy, BibleStudyFormData } from "@/lib/types";

/**
 * Scheduling a next study means the study is going on: a paused or finished
 * study that gets a next appointment is reopened, so the appointment is
 * visible everywhere. (A study only has an appointment while it is active.)
 */
export function statusAfterScheduling(
  status: BibleStudy["status"],
  nextDate: string | null
): BibleStudy["status"] {
  return nextDate ? "active" : status;
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

/**
 * A study as an editable form, with the changes applied — for changing just
 * one thing (like its next date) without re-typing the rest.
 */
export function studyToFormData(
  study: BibleStudy,
  person?: { location_lat?: number | null; location_lng?: number | null } | null,
  changes: Partial<BibleStudyFormData> = {}
): BibleStudyFormData {
  return {
    person_id: study.person_id,
    publication: study.publication,
    starting_lesson: study.starting_lesson || "",
    current_lesson: study.current_lesson || "",
    current_lesson_number: study.current_lesson_number,
    total_lessons: study.total_lessons,
    study_frequency: study.study_frequency,
    preferred_day: study.preferred_day || "",
    preferred_time: study.preferred_time || "",
    first_study_date: study.first_study_date || "",
    next_study_date: study.next_study_date || "",
    next_study_time: study.next_study_time || "",
    general_location: study.general_location || "",
    location_lat: person?.location_lat ?? null,
    location_lng: person?.location_lng ?? null,
    status: study.status,
    preparation_notes: study.preparation_notes || "",
    private_notes: study.private_notes || "",
    source_return_visit_id: study.source_return_visit_id || "",
    ...changes,
  };
}
