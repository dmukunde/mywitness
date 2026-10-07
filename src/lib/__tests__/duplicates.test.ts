import { describe, expect, it } from "vitest";
import {
  buildCleanupPlan,
  findDuplicateConversations,
  findDuplicatePeople,
  findDuplicateVisits,
  personMergeMap,
  planIsEmpty,
} from "@/lib/duplicates";
import type { Conversation, Person, ReturnVisit } from "@/lib/types";

function person(o: Partial<Person>): Person {
  return {
    id: "p1",
    user_id: "u",
    name: "Justine",
    general_location: null,
    location_lat: null,
    location_lng: null,
    area_id: null,
    phone_number: null,
    preferred_contact_time: null,
    first_met_date: null,
    interest_level: null,
    current_discussion_theme: null,
    key_questions: null,
    private_notes: null,
    is_demo: false,
    archived_at: null,
    created_at: "2026-10-05T10:00:00.000Z",
    updated_at: "2026-10-05T10:00:00.000Z",
    ...o,
  };
}

function visit(o: Partial<ReturnVisit>): ReturnVisit {
  return {
    id: "v1",
    user_id: "u",
    person_id: "p1",
    conversation_id: null,
    scheduled_date: "2026-10-09",
    scheduled_time: "Morning",
    status: "planned",
    last_topic: null,
    question_to_answer: null,
    next_planned_topic: null,
    general_location: null,
    preparation_notes: null,
    completed_at: null,
    is_demo: false,
    created_at: "2026-10-05T10:00:00.000Z",
    updated_at: "2026-10-05T10:00:00.000Z",
    ...o,
  };
}

function conv(o: Partial<Conversation>): Conversation {
  return {
    id: "c1",
    user_id: "u",
    person_id: "p1",
    session_id: null,
    conversation_date: "2026-10-05",
    approximate_time: null,
    general_location: null,
    how_met: null,
    main_topic: "Hope",
    questions_asked: null,
    concerns_circumstances: null,
    publications_shared: null,
    interest_level: null,
    promised_follow_up_date: null,
    promised_follow_up_time: null,
    next_topic: null,
    action_required: null,
    additional_notes: null,
    summary: "Talked about hope",
    next_visit_preparation: null,
    source: "manual",
    audio_path: null,
    keep_audio: false,
    transcript: null,
    is_demo: false,
    created_at: "2026-10-05T10:00:00.000Z",
    updated_at: "2026-10-05T10:00:00.000Z",
    ...o,
  };
}

const none = { conversations: [], returnVisits: [], bibleStudies: [] };

describe("findDuplicatePeople", () => {
  it("groups the same name created seconds apart, keeping the oldest", () => {
    const groups = findDuplicatePeople(
      [
        person({ id: "a", created_at: "2026-10-05T10:00:00.000Z" }),
        person({ id: "b", created_at: "2026-10-05T10:00:03.000Z" }),
      ],
      none
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].canonical.id).toBe("a");
    expect(groups[0].duplicates.map((p) => p.id)).toEqual(["b"]);
  });

  it("keeps the entry with the most history, not just the oldest", () => {
    const groups = findDuplicatePeople(
      [
        person({ id: "a", created_at: "2026-10-05T10:00:00.000Z" }),
        person({ id: "b", created_at: "2026-10-05T10:00:03.000Z" }),
      ],
      {
        ...none,
        conversations: [conv({ person_id: "b" })],
      }
    );
    expect(groups[0].canonical.id).toBe("b");
  });

  it("ignores case and spacing differences in the name", () => {
    const groups = findDuplicatePeople(
      [
        person({ id: "a", name: "Justine" }),
        person({ id: "b", name: "  justine ", created_at: "2026-10-05T10:01:00.000Z" }),
      ],
      none
    );
    expect(groups).toHaveLength(1);
  });

  it("does NOT treat two people who merely share a name as duplicates", () => {
    const groups = findDuplicatePeople(
      [
        person({ id: "a", created_at: "2026-09-01T10:00:00.000Z" }),
        person({ id: "b", created_at: "2026-10-05T10:00:00.000Z" }),
      ],
      none
    );
    expect(groups).toHaveLength(0);
  });

  it("only groups the entries that are actually close together", () => {
    const groups = findDuplicatePeople(
      [
        person({ id: "a", created_at: "2026-10-05T10:00:00.000Z" }),
        person({ id: "b", created_at: "2026-10-05T10:30:00.000Z" }),
        person({ id: "c", created_at: "2026-10-05T15:00:00.000Z" }),
      ],
      none
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].duplicates.map((p) => p.id)).toEqual(["b"]);
  });

  it("ignores archived people and different names", () => {
    const groups = findDuplicatePeople(
      [
        person({ id: "a" }),
        person({ id: "b", archived_at: "2026-10-06T00:00:00.000Z" }),
        person({ id: "c", name: "Miriam" }),
      ],
      none
    );
    expect(groups).toHaveLength(0);
  });
});

describe("findDuplicateVisits", () => {
  it("finds planned visits for the same person, date and time", () => {
    const groups = findDuplicateVisits([
      visit({ id: "a" }),
      visit({ id: "b", created_at: "2026-10-05T10:00:02.000Z" }),
      visit({ id: "c", created_at: "2026-10-05T10:00:05.000Z" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].canonical.id).toBe("a");
    expect(groups[0].duplicates.map((v) => v.id)).toEqual(["b", "c"]);
  });

  it("never touches completed visits — they are history", () => {
    const groups = findDuplicateVisits([
      visit({ id: "a", status: "completed" }),
      visit({ id: "b", status: "completed" }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("treats a different time or date as a different visit", () => {
    const groups = findDuplicateVisits([
      visit({ id: "a" }),
      visit({ id: "b", scheduled_time: "Afternoon" }),
      visit({ id: "c", scheduled_date: "2026-10-10" }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("keeps the copy that carries a linked conversation and topic", () => {
    const groups = findDuplicateVisits([
      visit({ id: "a" }),
      visit({
        id: "b",
        conversation_id: "c1",
        next_planned_topic: "Hope",
        created_at: "2026-10-05T10:00:02.000Z",
      }),
    ]);
    expect(groups[0].canonical.id).toBe("b");
  });

  it("collapses identical visits across people that are being merged", () => {
    const merge = new Map([["p2", "p1"]]);
    const groups = findDuplicateVisits(
      [visit({ id: "a", person_id: "p1" }), visit({ id: "b", person_id: "p2" })],
      merge
    );
    expect(groups).toHaveLength(1);
  });
});

describe("findDuplicateConversations", () => {
  it("finds exact copies saved within minutes", () => {
    const groups = findDuplicateConversations([
      conv({ id: "a" }),
      conv({ id: "b", created_at: "2026-10-05T10:00:04.000Z" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].canonical.id).toBe("a");
  });

  it("keeps conversations that differ in any way", () => {
    const groups = findDuplicateConversations([
      conv({ id: "a" }),
      conv({ id: "b", summary: "Talked about hope and a resurrection" }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("keeps identical-looking conversations that are far apart in time", () => {
    const groups = findDuplicateConversations([
      conv({ id: "a" }),
      conv({ id: "b", created_at: "2026-10-05T14:00:00.000Z" }),
    ]);
    expect(groups).toHaveLength(0);
  });
});

describe("buildCleanupPlan", () => {
  const input = {
    people: [
      person({ id: "a" }),
      person({ id: "b", created_at: "2026-10-05T10:00:03.000Z" }),
    ],
    returnVisits: [
      visit({ id: "v1", person_id: "a" }),
      visit({ id: "v2", person_id: "b", created_at: "2026-10-05T10:00:04.000Z" }),
    ],
    conversations: [],
    bibleStudies: [],
    eventVisitIds: ["v1", "v1", "v1", "v2", null],
  };

  it("combines people, visits (across the merge) and extra calendar copies", () => {
    const plan = buildCleanupPlan(input);
    expect(plan.people).toHaveLength(1);
    expect(plan.visits).toHaveLength(1);
    expect(plan.extraEvents).toBe(2);
    expect(planIsEmpty(plan)).toBe(false);
    expect(personMergeMap(plan.people).get("b")).toBe("a");
  });

  it("reports nothing to do for clean data", () => {
    const plan = buildCleanupPlan({
      people: [person({ id: "a" })],
      returnVisits: [visit({ id: "v1" })],
      conversations: [conv({ id: "c1" })],
      bibleStudies: [],
      eventVisitIds: ["v1"],
    });
    expect(planIsEmpty(plan)).toBe(true);
  });
});
