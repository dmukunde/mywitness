import { describe, expect, it } from "vitest";
import {
  buildActivities,
  findPlannedVisitInSlot,
  nextActivityForPerson,
  nextActivityForStudy,
  returnVisitsToComplete,
  returnVisitsToSupersede,
  type ScheduleInput,
} from "@/lib/schedule";
import { statusAfterScheduling } from "@/lib/bible-study";
import type {
  BibleStudy,
  BibleStudySession,
  Conversation,
  ReturnVisit,
  ScheduledMinistryEvent,
} from "@/lib/types";

const TODAY = "2026-10-10";

function rv(o: Partial<ReturnVisit>): ReturnVisit {
  return {
    id: "rv1",
    user_id: "u",
    person_id: "p1",
    conversation_id: null,
    scheduled_date: "2026-10-05",
    scheduled_time: null,
    status: "planned",
    last_topic: null,
    question_to_answer: null,
    next_planned_topic: null,
    general_location: null,
    preparation_notes: null,
    completed_at: null,
    is_demo: false,
    created_at: "2026-10-01T09:00:00.000Z",
    updated_at: "2026-10-01T09:00:00.000Z",
    ...o,
  };
}

function conv(o: Partial<Conversation>): Conversation {
  return {
    id: "c1",
    user_id: "u",
    person_id: "p1",
    session_id: null,
    conversation_date: "2026-10-08",
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
    created_at: "2026-10-08T10:00:00.000Z",
    updated_at: "2026-10-08T10:00:00.000Z",
    ...o,
  };
}

function study(o: Partial<BibleStudy>): BibleStudy {
  return {
    id: "s1",
    user_id: "u",
    person_id: "p1",
    publication: "Enjoy Life Forever!",
    starting_lesson: null,
    current_lesson: "Lesson 1",
    current_lesson_number: 1,
    total_lessons: 60,
    study_frequency: "weekly",
    preferred_day: null,
    preferred_time: null,
    first_study_date: null,
    next_study_date: "2026-10-05",
    next_study_time: null,
    last_study_date: null,
    general_location: null,
    status: "active",
    preparation_notes: null,
    private_notes: null,
    source_return_visit_id: null,
    archived_at: null,
    is_demo: false,
    created_at: "2026-09-20T09:00:00.000Z",
    updated_at: "2026-09-20T09:00:00.000Z",
    ...o,
  };
}

function session(o: Partial<BibleStudySession>): BibleStudySession {
  return {
    id: "ss1",
    user_id: "u",
    bible_study_id: "s1",
    person_id: "p1",
    session_date: "2026-10-05",
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
    created_at: "2026-10-05T10:00:00.000Z",
    updated_at: "2026-10-05T10:00:00.000Z",
    ...o,
  };
}

function event(o: Partial<ScheduledMinistryEvent>): ScheduledMinistryEvent {
  return {
    id: "e1",
    user_id: "u",
    person_id: "p1",
    event_type: "return_visit",
    return_visit_id: "rv1",
    bible_study_id: null,
    scheduled_date: "2026-10-05",
    scheduled_time: null,
    general_location: null,
    topic_or_lesson: null,
    preparation_notes: null,
    status: "planned",
    is_demo: false,
    created_at: "2026-10-01T09:00:00.000Z",
    updated_at: "2026-10-01T09:00:00.000Z",
    ...o,
  };
}

function build(o: Partial<ScheduleInput>) {
  return buildActivities({
    events: [],
    returnVisits: [],
    bibleStudies: [],
    conversations: [],
    studySessions: [],
    today: TODAY,
    ...o,
  });
}

describe("return visit lifecycle", () => {
  it("is upcoming, due, then overdue as the date passes", () => {
    const visits = [
      rv({ id: "a", scheduled_date: "2026-10-15" }),
      rv({ id: "b", scheduled_date: TODAY }),
      rv({ id: "c", scheduled_date: "2026-10-05" }),
    ];
    const states = Object.fromEntries(
      build({ returnVisits: visits }).map((a) => [a.return_visit_id, a.state])
    );
    expect(states).toEqual({ a: "upcoming", b: "due", c: "overdue" });
  });

  it("clears overdue once the person is visited, and shows the next visit instead", () => {
    // Scheduled 5 Oct, visited 8 Oct (recorded after scheduling), next set for 15 Oct.
    const activities = build({
      returnVisits: [
        rv({ id: "old", scheduled_date: "2026-10-05" }),
        rv({
          id: "next",
          scheduled_date: "2026-10-15",
          created_at: "2026-10-08T10:01:00.000Z",
          conversation_id: "visit",
        }),
      ],
      conversations: [
        conv({ id: "visit", conversation_date: "2026-10-08" }),
      ],
    });
    const old = activities.find((a) => a.return_visit_id === "old");
    expect(old?.state).toBe("completed");
    const next = nextActivityForPerson(activities, "p1");
    expect(next?.return_visit_id).toBe("next");
    expect(next?.state).toBe("upcoming");
  });

  it("does not let the conversation that created a visit resolve it", () => {
    const activities = build({
      returnVisits: [
        rv({ scheduled_date: "2026-10-05", conversation_id: "c1", created_at: "2026-10-01T09:00:00.000Z" }),
      ],
      conversations: [conv({ id: "c1", conversation_date: "2026-10-05", created_at: "2026-10-01T09:00:00.000Z" })],
    });
    expect(activities[0].state).toBe("overdue");
  });

  it("ignores a conversation recorded before the visit was scheduled", () => {
    const activities = build({
      returnVisits: [rv({ scheduled_date: "2026-10-09", created_at: "2026-10-09T08:00:00.000Z" })],
      conversations: [conv({ conversation_date: "2026-10-09", created_at: "2026-10-09T07:00:00.000Z" })],
    });
    expect(activities[0].state).toBe("overdue");
  });

  it("does not let a conversation with someone else resolve it", () => {
    const activities = build({
      returnVisits: [rv({})],
      conversations: [conv({ person_id: "p2" })],
    });
    expect(activities[0].state).toBe("overdue");
  });

  it("drops cancelled and rescheduled visits but keeps completed ones as history", () => {
    const activities = build({
      returnVisits: [
        rv({ id: "x", status: "cancelled" }),
        rv({ id: "y", status: "rescheduled" }),
        rv({ id: "z", status: "completed" }),
      ],
    });
    expect(activities.map((a) => a.return_visit_id)).toEqual(["z"]);
    expect(activities[0].state).toBe("completed");
  });

  it("trusts the more resolved of a visit and its drifted calendar mirror", () => {
    const completedRecord = build({
      returnVisits: [rv({ status: "completed" })],
      events: [event({ status: "planned" })],
    });
    expect(completedRecord[0].state).toBe("completed");

    const completedMirror = build({
      returnVisits: [rv({ status: "planned" })],
      events: [event({ status: "completed" })],
    });
    expect(completedMirror[0].state).toBe("completed");
  });

  it("uses the visit's own date when its mirror event is stale", () => {
    const activities = build({
      returnVisits: [rv({ scheduled_date: "2026-10-20" })],
      events: [event({ scheduled_date: "2026-10-05" })],
    });
    expect(activities[0].scheduled_date).toBe("2026-10-20");
    expect(activities[0].state).toBe("upcoming");
  });
});

describe("bible study lifecycle", () => {
  it("is overdue when its date passed with no session", () => {
    const [a] = build({ bibleStudies: [study({})] });
    expect(a.event_type).toBe("bible_study");
    expect(a.state).toBe("overdue");
  });

  it("is no longer overdue once a session was held on or after the date", () => {
    const [a] = build({
      bibleStudies: [study({})],
      studySessions: [session({ session_date: "2026-10-06" })],
    });
    expect(a.state).toBe("completed");
  });

  it("is not resolved by a session held before the scheduled date", () => {
    const [a] = build({
      bibleStudies: [study({ next_study_date: "2026-10-20" })],
      studySessions: [session({ session_date: "2026-10-06" })],
    });
    expect(a.state).toBe("upcoming");
  });

  it("shows the new date even if a stale planned event still has the old one", () => {
    const activities = build({
      bibleStudies: [study({ next_study_date: "2026-10-17" })],
      events: [
        event({
          id: "stale",
          event_type: "bible_study",
          return_visit_id: null,
          bible_study_id: "s1",
          scheduled_date: "2026-10-03",
          status: "planned",
        }),
      ],
    });
    expect(activities).toHaveLength(1);
    expect(activities[0].scheduled_date).toBe("2026-10-17");
    expect(activities[0].state).toBe("upcoming");
  });

  it("has no upcoming appointment when paused, finished, or unscheduled", () => {
    expect(build({ bibleStudies: [study({ status: "paused" })] })).toHaveLength(0);
    expect(build({ bibleStudies: [study({ status: "completed" })] })).toHaveLength(0);
    expect(build({ bibleStudies: [study({ next_study_date: null })] })).toHaveLength(0);
  });

  it("keeps held appointments as history without duplicating a fulfilled one", () => {
    const activities = build({
      bibleStudies: [study({ next_study_date: "2026-10-05" })],
      studySessions: [session({ session_date: "2026-10-05" })],
      events: [
        event({
          event_type: "bible_study",
          return_visit_id: null,
          bible_study_id: "s1",
          scheduled_date: "2026-10-05",
          status: "completed",
        }),
      ],
    });
    expect(activities).toHaveLength(1);
    expect(activities[0].state).toBe("completed");
  });
});

describe("nextActivityForPerson", () => {
  it("returns the earliest unresolved activity across visits and studies", () => {
    const activities = build({
      returnVisits: [rv({ id: "later", scheduled_date: "2026-10-25" })],
      bibleStudies: [study({ next_study_date: "2026-10-12" })],
    });
    const next = nextActivityForPerson(activities, "p1");
    expect(next?.event_type).toBe("bible_study");
  });

  it("returns null when nothing is unresolved", () => {
    const activities = build({ returnVisits: [rv({ status: "completed" })] });
    expect(nextActivityForPerson(activities, "p1")).toBeNull();
  });
});

describe("write-side helpers", () => {
  const visits = [
    rv({ id: "overdue", scheduled_date: "2026-10-05" }),
    rv({ id: "today", scheduled_date: TODAY }),
    rv({ id: "future", scheduled_date: "2026-10-20" }),
    rv({ id: "done", scheduled_date: "2026-10-01", status: "completed" }),
    rv({ id: "other", scheduled_date: "2026-10-05", person_id: "p2" }),
  ];

  it("completes only this person's planned visits due on or before the visit date", () => {
    expect(
      returnVisitsToComplete(visits, "p1", TODAY).map((r) => r.id)
    ).toEqual(["overdue", "today"]);
  });

  it("supersedes only overdue visits, leaving today's and future ones alone", () => {
    expect(
      returnVisitsToSupersede(visits, "p1", TODAY).map((r) => r.id)
    ).toEqual(["overdue"]);
  });

  it("can exclude a visit by id", () => {
    expect(
      returnVisitsToComplete(visits, "p1", TODAY, ["overdue"]).map((r) => r.id)
    ).toEqual(["today"]);
  });
});

describe("a visit's topic", () => {
  it("is its own next topic, never the previous visit's topic", () => {
    const [withTopic] = build({
      returnVisits: [
        rv({ scheduled_date: "2026-10-15", last_topic: "Discussed last time", next_planned_topic: "Brand new topic" }),
      ],
    });
    expect(withTopic.topic_or_lesson).toBe("Brand new topic");

    const [noTopic] = build({
      returnVisits: [
        rv({ scheduled_date: "2026-10-15", last_topic: "Discussed last time", next_planned_topic: null }),
      ],
    });
    expect(noTopic.topic_or_lesson).toBeNull();
  });

  it("follows the newest scheduled visit once the previous one is completed", () => {
    const activities = build({
      returnVisits: [
        rv({ id: "done", status: "completed", scheduled_date: "2026-10-03", next_planned_topic: "Old topic" }),
        rv({ id: "next", scheduled_date: "2026-10-10", next_planned_topic: "New topic" }),
      ],
    });
    const next = nextActivityForPerson(activities, "p1");
    expect(next?.return_visit_id).toBe("next");
    expect(next?.topic_or_lesson).toBe("New topic");
  });
});

describe("findPlannedVisitInSlot", () => {
  const visits = [
    rv({ id: "a", scheduled_date: "2026-10-10", scheduled_time: null }),
    rv({ id: "b", scheduled_date: "2026-10-10", scheduled_time: "Afternoon" }),
    rv({ id: "c", scheduled_date: "2026-10-10", status: "completed" }),
    rv({ id: "d", scheduled_date: "2026-10-10", person_id: "p2" }),
  ];

  it("finds the planned visit in the same person/date/time slot", () => {
    expect(findPlannedVisitInSlot(visits, "p1", "2026-10-10", null)?.id).toBe("a");
    expect(findPlannedVisitInSlot(visits, "p1", "2026-10-10", "Afternoon")?.id).toBe("b");
  });

  it("treats empty and missing time as the same slot", () => {
    expect(findPlannedVisitInSlot(visits, "p1", "2026-10-10", "")?.id).toBe("a");
  });

  it("ignores completed visits, other people, and other dates or times", () => {
    expect(findPlannedVisitInSlot(visits, "p1", "2026-10-11", null)).toBeUndefined();
    expect(findPlannedVisitInSlot(visits, "p1", "2026-10-10", "Morning")).toBeUndefined();
    expect(findPlannedVisitInSlot(visits, "p3", "2026-10-10", null)).toBeUndefined();
  });
});

describe("a study's appointment", () => {
  const upcoming = { next_study_date: "2026-10-14", next_study_time: "10:00" };

  it("is the same record Calendar/Home read for an active study", () => {
    const acts = build({ bibleStudies: [study({ ...upcoming })] });
    const next = nextActivityForStudy(acts, "s1");
    expect(next?.scheduled_date).toBe("2026-10-14");
    expect(next?.scheduled_time).toBe("10:00");
    expect(acts.filter((a) => a.bible_study_id === "s1")).toHaveLength(1);
  });

  it("does not exist for a finished or paused study, whatever its date field says", () => {
    for (const status of ["completed", "paused"] as const) {
      const acts = build({ bibleStudies: [study({ ...upcoming, status })] });
      expect(nextActivityForStudy(acts, "s1")).toBeNull();
      expect(acts).toHaveLength(0);
    }
  });

  it("appears exactly once after a finished study is reopened with a date", () => {
    const reopened = study({
      ...upcoming,
      status: statusAfterScheduling("completed", "2026-10-14"),
    });
    const acts = build({ bibleStudies: [reopened] });
    expect(acts.filter((a) => a.bible_study_id === "s1")).toHaveLength(1);
    expect(nextActivityForStudy(acts, "s1")?.state).toBe("upcoming");
  });

  it("scheduling reopens; no new date leaves the status alone", () => {
    expect(statusAfterScheduling("completed", "2026-10-14")).toBe("active");
    expect(statusAfterScheduling("paused", "2026-10-14")).toBe("active");
    expect(statusAfterScheduling("completed", null)).toBe("completed");
    expect(statusAfterScheduling("paused", null)).toBe("paused");
  });

  it("is resolved once held, so only the new date remains", () => {
    const acts = build({
      bibleStudies: [study({ ...upcoming })],
      events: [
        event({
          id: "e-old",
          return_visit_id: null,
          bible_study_id: "s1",
          event_type: "bible_study",
          scheduled_date: "2026-10-07",
          status: "completed",
        }),
      ],
    });
    const forStudy = acts.filter((a) => a.bible_study_id === "s1");
    expect(forStudy.map((a) => [a.scheduled_date, a.state])).toEqual([
      ["2026-10-07", "completed"],
      ["2026-10-14", "upcoming"],
    ]);
    expect(nextActivityForStudy(acts, "s1")?.scheduled_date).toBe("2026-10-14");
  });
});
