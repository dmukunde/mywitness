import type { StudySessionExtraction } from "@/lib/types";
import { resolveRelativeDatePhrase } from "@/lib/ai/relative-dates";
import { todayISO } from "@/lib/utils";

/** Map conversation-style extraction JSON into a study session draft. */
export function mapExtractionToStudySession(
  raw: Record<string, unknown>
): StudySessionExtraction {
  const scriptures = Array.isArray(raw.scriptures_discussed)
    ? (raw.scriptures_discussed as string[])
    : typeof raw.scriptures_discussed === "string"
      ? String(raw.scriptures_discussed)
          .split(/[;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const questionsRaw = Array.isArray(raw.questions_raised)
    ? (raw.questions_raised as string[])
    : String(raw.questions_raised || "")
        .split(/[;\n]+/)
        .map((q) => q.trim())
        .filter(Boolean);

  const datePhrase = String(
    raw.next_scheduled_date_phrase ||
      raw.proposed_return_visit_date_phrase ||
      ""
  );
  let nextDate =
    (raw.next_scheduled_date as string | null) ||
    (raw.proposed_return_visit_date as string | null) ||
    null;
  let nextTime = String(
    raw.next_scheduled_time || raw.proposed_return_visit_time || ""
  );

  if ((!nextDate || nextDate === "") && datePhrase) {
    const resolved = resolveRelativeDatePhrase(datePhrase, todayISO());
    nextDate = resolved.date;
    if (!nextTime && resolved.timePeriod) nextTime = resolved.timePeriod;
  }

  return {
    start_lesson: String(raw.start_lesson || raw.current_lesson || ""),
    end_lesson: String(
      raw.end_lesson || raw.material_completed || raw.start_lesson || ""
    ),
    topics_discussed: String(
      raw.topics_discussed || raw.main_discussion_topic || ""
    ),
    scriptures_discussed: scriptures,
    questions_raised: questionsRaw,
    material_completed: String(raw.material_completed || raw.end_lesson || ""),
    homework: String(raw.homework || ""),
    next_lesson: String(raw.next_lesson || raw.next_planned_topic || ""),
    next_scheduled_date: nextDate,
    next_scheduled_time: nextTime,
    preparation_notes: String(
      raw.preparation_notes || raw.additional_notes || ""
    ),
    summary: String(raw.summary || ""),
  };
}
