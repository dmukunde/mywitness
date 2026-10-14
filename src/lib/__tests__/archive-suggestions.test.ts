import { describe, expect, it } from "vitest";
import { lastActivityDate, suggestArchiving } from "@/lib/archive-suggestions";
import type {
  BibleStudy,
  BibleStudySession,
  Conversation,
  Person,
  ReturnVisit,
} from "@/lib/types";

const TODAY = "2026-12-01";

const person = (o: Partial<Person>): Person =>
  ({
    id: "p1",
    name: "Grace",
    archived_at: null,
    first_met_date: null,
    created_at: "2026-06-01T10:00:00.000Z",
    ...o,
  }) as Person;

const conv = (person_id: string, date: string) =>
  ({ id: `c-${person_id}-${date}`, person_id, conversation_date: date }) as Conversation;

const visit = (o: Partial<ReturnVisit>) =>
  ({
    id: "v1",
    person_id: "p1",
    status: "completed",
    scheduled_date: "2026-06-10",
    completed_at: null,
    ...o,
  }) as ReturnVisit;

const none = {
  conversations: [] as Conversation[],
  returnVisits: [] as ReturnVisit[],
  bibleStudies: [] as BibleStudy[],
  studySessions: [] as BibleStudySession[],
};

describe("lastActivityDate", () => {
  it("is when they were added if nothing else happened", () => {
    expect(lastActivityDate(person({}), none, TODAY)).toBe("2026-06-01");
  });

  it("uses the latest of conversations, visits and study sessions", () => {
    const last = lastActivityDate(
      person({}),
      {
        ...none,
        conversations: [conv("p1", "2026-07-04")],
        returnVisits: [visit({ scheduled_date: "2026-08-15" })],
        studySessions: [
          { person_id: "p1", session_date: "2026-09-09" } as BibleStudySession,
        ],
      },
      TODAY
    );
    expect(last).toBe("2026-09-09");
  });

  it("treats a coming appointment as activity", () => {
    const last = lastActivityDate(
      person({}),
      { ...none, returnVisits: [visit({ status: "planned", scheduled_date: "2026-12-20" })] },
      TODAY
    );
    expect(last).toBe("9999-12-31");
  });

  it("ignores cancelled visits", () => {
    const last = lastActivityDate(
      person({}),
      { ...none, returnVisits: [visit({ status: "cancelled", scheduled_date: "2026-11-30" })] },
      TODAY
    );
    expect(last).toBe("2026-06-01");
  });
});

describe("suggestArchiving", () => {
  it("suggests only contacts idle for 90 days or more, longest idle first", () => {
    const people = [
      person({ id: "old", name: "Old", created_at: "2026-05-01T00:00:00.000Z" }),
      person({ id: "older", name: "Older", created_at: "2026-03-01T00:00:00.000Z" }),
      person({ id: "recent", name: "Recent", created_at: "2026-11-15T00:00:00.000Z" }),
      person({ id: "edge", name: "Edge", created_at: "2026-09-02T00:00:00.000Z" }), // exactly 90 days
      person({ id: "just", name: "Just", created_at: "2026-09-03T00:00:00.000Z" }), // 89 days
    ];
    const out = suggestArchiving({ people, ...none, today: TODAY });
    expect(out.map((s) => s.person.id)).toEqual(["older", "old", "edge"]);
    expect(out[2].idleDays).toBe(90);
  });

  it("does not suggest someone with recent activity, an appointment ahead, or already archived", () => {
    const people = [
      person({ id: "talked", created_at: "2026-01-01T00:00:00.000Z" }),
      person({ id: "booked", created_at: "2026-01-01T00:00:00.000Z" }),
      person({ id: "gone", created_at: "2026-01-01T00:00:00.000Z", archived_at: "2026-10-01T00:00:00.000Z" }),
    ];
    const out = suggestArchiving({
      people,
      ...none,
      conversations: [conv("talked", "2026-11-20")],
      returnVisits: [visit({ id: "x", person_id: "booked", status: "planned", scheduled_date: "2026-12-10" })],
      today: TODAY,
    });
    expect(out).toEqual([]);
  });
});
