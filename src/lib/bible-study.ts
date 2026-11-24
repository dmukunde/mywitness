import type {
  BibleStudy,
  BibleStudyFormData,
  BibleStudySessionFormData,
} from "@/lib/types";

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
 * Where a study stands after a session is saved: the next lesson if one was
 * given, otherwise the lesson that was studied. The lesson number follows the
 * same lesson, so the progress bar and the label never disagree. If the lesson
 * has no number in it ("Introduction"), the number stays as it was.
 * (`end_lesson` is no longer asked for, but is still honoured if a record has one.)
 */
export function lessonAfterSession(
  study: Pick<BibleStudy, "current_lesson" | "current_lesson_number">,
  form: Pick<BibleStudySessionFormData, "next_lesson" | "end_lesson" | "start_lesson">
): { current_lesson: string | null; current_lesson_number: number } {
  const lesson =
    form.next_lesson.trim() || form.end_lesson.trim() || form.start_lesson.trim() || null;
  return {
    current_lesson: lesson ?? study.current_lesson,
    current_lesson_number: parseLessonNumber(lesson) || study.current_lesson_number,
  };
}

/**
 * Fields the study notes form no longer asks for. A voice note can still fill
 * some of them in, so they are cleared on save rather than kept without being
 * shown. (Notes saved earlier keep theirs.)
 */
export function withoutRemovedFields(
  form: BibleStudySessionFormData
): BibleStudySessionFormData {
  return {
    ...form,
    end_lesson: "",
    topics_discussed: "",
    scriptures_discussed: "",
    material_completed: "",
    summary: "",
  };
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
