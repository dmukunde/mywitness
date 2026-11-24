import { describe, expect, it } from "vitest";
import { lessonAfterSession, withoutRemovedFields } from "@/lib/bible-study";
import { EMPTY_STUDY_SESSION_FORM } from "@/lib/types";

const study = { current_lesson: "Lesson 13", current_lesson_number: 13 };
const form = (o: Partial<typeof EMPTY_STUDY_SESSION_FORM> = {}) => ({ ...EMPTY_STUDY_SESSION_FORM, ...o });

describe("where a study stands after a session", () => {
  it("moves to the next lesson when one is given, label and number together", () => {
    expect(lessonAfterSession(study, form({ start_lesson: "Lesson 13", next_lesson: "Lesson 14" }))).toEqual({
      current_lesson: "Lesson 14",
      current_lesson_number: 14,
    });
  });

  it("otherwise moves to the lesson that was studied", () => {
    expect(lessonAfterSession(study, form({ start_lesson: "Lesson 15" }))).toEqual({
      current_lesson: "Lesson 15",
      current_lesson_number: 15,
    });
  });

  it("stays where it was when the lesson is the one it was already on", () => {
    expect(lessonAfterSession(study, form({ start_lesson: "Lesson 13" }))).toEqual({
      current_lesson: "Lesson 13",
      current_lesson_number: 13,
    });
  });

  it("stays put when no lesson was written at all", () => {
    expect(lessonAfterSession(study, form())).toEqual({ current_lesson: "Lesson 13", current_lesson_number: 13 });
  });

  it("keeps the number when the lesson has no number in it", () => {
    expect(lessonAfterSession(study, form({ next_lesson: "Introduction" }))).toEqual({
      current_lesson: "Introduction",
      current_lesson_number: 13,
    });
  });

  it("still honours an older record's end lesson, behind the next lesson", () => {
    expect(lessonAfterSession(study, form({ start_lesson: "Lesson 13", end_lesson: "Lesson 16" }))).toMatchObject({ current_lesson_number: 16 });
    expect(lessonAfterSession(study, form({ end_lesson: "Lesson 16", next_lesson: "Lesson 17" }))).toMatchObject({ current_lesson_number: 17 });
  });

  it("ignores blank spaces", () => {
    expect(lessonAfterSession(study, form({ next_lesson: "   ", start_lesson: "Lesson 14" }))).toMatchObject({ current_lesson_number: 14 });
  });
});

describe("the study notes form no longer keeps what it does not ask for", () => {
  it("clears the end lesson, topics, scriptures, material completed and summary", () => {
    const saved = withoutRemovedFields(
      form({
        end_lesson: "Lesson 2",
        topics_discussed: "God's purpose",
        scriptures_discussed: "Psalm 37:29",
        material_completed: "Paragraphs 1-8",
        summary: "A voice note summary",
      })
    );
    expect(saved).toMatchObject({ end_lesson: "", topics_discussed: "", scriptures_discussed: "", material_completed: "", summary: "" });
  });

  it("keeps everything that is still asked for", () => {
    const saved = withoutRemovedFields(
      form({
        session_date: "2026-11-24",
        start_lesson: "Lesson 14",
        questions_raised: "Why do people suffer?",
        homework: "Read chapter 3",
        next_lesson: "Lesson 15",
        next_scheduled_date: "2026-12-01",
        next_scheduled_time: "Morning",
        preparation_notes: "Bring the tablet",
        transcript: "…",
      })
    );
    expect(saved).toMatchObject({
      session_date: "2026-11-24",
      start_lesson: "Lesson 14",
      questions_raised: "Why do people suffer?",
      homework: "Read chapter 3",
      next_lesson: "Lesson 15",
      next_scheduled_date: "2026-12-01",
      next_scheduled_time: "Morning",
      preparation_notes: "Bring the tablet",
      transcript: "…",
    });
  });
});
