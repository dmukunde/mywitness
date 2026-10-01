import { describe, expect, it } from "vitest";
import {
  buildReportText,
  countBibleStudiesForRange,
  dailyBreakdownForRange,
  monthLabel,
  wasActiveInMinistry,
  type MonthlyReportData,
} from "@/lib/ministry-report";
import type { BibleStudySession, Conversation, MinistrySession } from "@/lib/types";

function session(overrides: Partial<MinistrySession>): MinistrySession {
  return {
    id: "s1",
    user_id: "u1",
    start_time: "2026-09-03T09:00:00.000Z",
    end_time: "2026-09-03T11:15:00.000Z",
    duration_minutes: 135,
    session_date: "2026-09-03",
    ministry_type: null,
    companion: null,
    area: null,
    personal_reflection: null,
    source: "manual",
    is_demo: false,
    created_at: "2026-09-03T11:15:00.000Z",
    updated_at: "2026-09-03T11:15:00.000Z",
    ...overrides,
  };
}

function studySession(overrides: Partial<BibleStudySession>): BibleStudySession {
  return {
    id: "bs1",
    user_id: "u1",
    bible_study_id: "study-1",
    person_id: "person-1",
    session_date: "2026-09-10",
    start_lesson: null,
    end_lesson: null,
    topics_discussed: null,
    scriptures_discussed: null,
    questions_raised: null,
    material_completed: null,
    homework: null,
    next_lesson: null,
    next_scheduled_date: null,
    next_scheduled_time: null,
    preparation_notes: null,
    summary: null,
    source: "manual",
    transcript: null,
    audio_path: null,
    is_demo: false,
    created_at: "2026-09-10T00:00:00.000Z",
    updated_at: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

function conversation(overrides: Partial<Conversation>): Conversation {
  return {
    id: "c1",
    user_id: "u1",
    person_id: "person-1",
    session_id: null,
    conversation_date: "2026-09-05",
    approximate_time: null,
    general_location: null,
    how_met: null,
    main_topic: null,
    questions_asked: null,
    concerns_circumstances: null,
    publications_shared: null,
    interest_level: null,
    promised_follow_up_date: null,
    promised_follow_up_time: null,
    next_topic: null,
    action_required: null,
    additional_notes: null,
    summary: null,
    next_visit_preparation: null,
    source: "manual",
    audio_path: null,
    keep_audio: false,
    transcript: null,
    is_demo: false,
    created_at: "2026-09-05T00:00:00.000Z",
    updated_at: "2026-09-05T00:00:00.000Z",
    ...overrides,
  };
}

const SEPT = { start: "2026-09-01", end: "2026-09-30" };

describe("countBibleStudiesForRange", () => {
  it("counts distinct studies, not sessions", () => {
    const sessions = [
      studySession({ id: "a", bible_study_id: "study-1", session_date: "2026-09-03" }),
      studySession({ id: "b", bible_study_id: "study-1", session_date: "2026-09-17" }),
      studySession({ id: "c", bible_study_id: "study-2", session_date: "2026-09-20" }),
    ];
    expect(countBibleStudiesForRange(sessions, SEPT.start, SEPT.end)).toBe(2);
  });

  it("excludes sessions outside the range", () => {
    const sessions = [
      studySession({ bible_study_id: "study-1", session_date: "2026-08-31" }),
      studySession({ bible_study_id: "study-2", session_date: "2026-10-01" }),
    ];
    expect(countBibleStudiesForRange(sessions, SEPT.start, SEPT.end)).toBe(0);
  });
});

describe("wasActiveInMinistry", () => {
  it("is true from a timed session alone", () => {
    expect(
      wasActiveInMinistry([session({})], [], [], SEPT.start, SEPT.end)
    ).toBe(true);
  });

  it("is true from a conversation alone, with no timed session", () => {
    expect(
      wasActiveInMinistry([], [conversation({})], [], SEPT.start, SEPT.end)
    ).toBe(true);
  });

  it("is true from a Bible study session alone", () => {
    expect(
      wasActiveInMinistry([], [], [studySession({})], SEPT.start, SEPT.end)
    ).toBe(true);
  });

  it("is false with no activity in range", () => {
    expect(wasActiveInMinistry([], [], [], SEPT.start, SEPT.end)).toBe(false);
  });

  it("ignores activity outside the selected month", () => {
    const outside = session({ session_date: "2026-08-15", start_time: "2026-08-15T09:00:00.000Z", end_time: "2026-08-15T10:00:00.000Z" });
    expect(wasActiveInMinistry([outside], [], [], SEPT.start, SEPT.end)).toBe(false);
  });
});

describe("dailyBreakdownForRange", () => {
  it("sorts earliest day first and sums same-day sessions", () => {
    const result = dailyBreakdownForRange(
      [
        session({ id: "1", session_date: "2026-09-14", duration_minutes: 450 }),
        session({ id: "2", session_date: "2026-09-03", duration_minutes: 135 }),
        session({ id: "3", session_date: "2026-09-03", duration_minutes: 60 }),
      ],
      SEPT.start,
      SEPT.end
    );
    expect(result).toEqual([
      { date: "2026-09-03", minutes: 195 },
      { date: "2026-09-14", minutes: 450 },
    ]);
  });
});

describe("monthLabel", () => {
  it("formats a yyyy-MM key", () => {
    expect(monthLabel("2026-09")).toBe("September 2026");
  });
});

describe("buildReportText", () => {
  const base: MonthlyReportData = {
    monthKey: "2026-09",
    shared: true,
    bibleStudies: 3,
    minutes: 1725, // 28h 45m
    dailyBreakdown: [
      { date: "2026-09-03", minutes: 135 },
      { date: "2026-09-08", minutes: 240 },
    ],
  };

  it("includes only the official fields by default", () => {
    const text = buildReportText(base);
    expect(text).toContain("September 2026 Ministry Report");
    expect(text).toContain("Shared in the ministry: Yes");
    expect(text).toContain("Bible studies: 3");
    expect(text).toContain("Hours: 28h 45m");
    expect(text).not.toContain("Ministry Activity");
    expect(text).not.toContain("Sep 3");
  });

  it("omits the Hours line when no time was logged", () => {
    const text = buildReportText({ ...base, minutes: 0 });
    expect(text).not.toContain("Hours");
  });

  it("appends the daily breakdown only when explicitly requested", () => {
    const text = buildReportText(base, { includeDailyBreakdown: true });
    expect(text).toContain("Ministry Activity");
    expect(text).toContain("Sep 3 — 2h 15m");
    expect(text).toContain("Sep 8 — 4h 00m");
  });
});
