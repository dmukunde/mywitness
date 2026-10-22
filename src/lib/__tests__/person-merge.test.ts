import { describe, expect, it } from "vitest";
import {
  contactSummary,
  mergePeopleInData,
  unmergePeopleInData,
  type MergeableData,
} from "@/lib/person-merge";
import type { PersonalReminder } from "@/lib/reminders";
import type {
  Conversation,
  Person,
  ReturnVisit,
  ScheduledMinistryEvent,
} from "@/lib/types";

function person(o: Partial<Person>): Person {
  return {
    id: "p1",
    user_id: "u",
    name: "Lilian",
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
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-01T10:00:00.000Z",
    ...o,
  };
}

function visit(o: Partial<ReturnVisit>): ReturnVisit {
  return {
    id: "v1",
    user_id: "u",
    person_id: "p1",
    conversation_id: null,
    scheduled_date: "2026-10-20",
    scheduled_time: "Morning",
    status: "planned",
    last_topic: null,
    question_to_answer: null,
    next_planned_topic: null,
    general_location: null,
    preparation_notes: null,
    completed_at: null,
    is_demo: false,
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-01T10:00:00.000Z",
    ...o,
  };
}

function event(o: Partial<ScheduledMinistryEvent>): ScheduledMinistryEvent {
  return {
    id: "e1",
    user_id: "u",
    person_id: "p1",
    event_type: "return_visit",
    return_visit_id: "v1",
    bible_study_id: null,
    scheduled_date: "2026-10-20",
    scheduled_time: "Morning",
    general_location: null,
    topic_or_lesson: null,
    preparation_notes: null,
    status: "planned",
    is_demo: false,
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-01T10:00:00.000Z",
    ...o,
  };
}

const conv = (id: string, person_id: string): Conversation =>
  ({ id, person_id, user_id: "u", conversation_date: "2026-09-02" }) as Conversation;

function data(o: Partial<MergeableData> = {}): MergeableData {
  return {
    people: [
      person({ id: "keep", name: "Lilian" }),
      person({ id: "dupe", name: "Lillian" }),
    ],
    conversations: [conv("c1", "keep"), conv("c2", "dupe")],
    returnVisits: [],
    bibleStudies: [],
    studySessions: [],
    ministryEvents: [],
    personPhotos: [],
    ...o,
  };
}

describe("mergePeopleInData", () => {
  it("moves everything onto the kept contact and hides (not deletes) the other", () => {
    const d = data({
      returnVisits: [visit({ id: "v-dupe", person_id: "dupe", scheduled_date: "2026-10-25" })],
      ministryEvents: [event({ id: "e-dupe", person_id: "dupe", return_visit_id: "v-dupe" })],
    });
    mergePeopleInData(d, "keep", "dupe");

    expect(d.conversations.map((c) => c.person_id)).toEqual(["keep", "keep"]);
    expect(d.returnVisits[0].person_id).toBe("keep");
    expect(d.ministryEvents[0].person_id).toBe("keep");
    const gone = d.people.find((p) => p.id === "dupe")!;
    expect(gone.archived_at).toBeTruthy();
    expect(gone.merged_into_id).toBe("keep");
    expect(d.people).toHaveLength(2); // nothing deleted
  });

  it("cancels (rather than duplicates) an identical planned visit", () => {
    const d = data({
      returnVisits: [
        visit({ id: "v-keep", person_id: "keep" }),
        visit({ id: "v-dupe", person_id: "dupe" }),
      ],
      ministryEvents: [event({ id: "e-dupe", person_id: "dupe", return_visit_id: "v-dupe" })],
    });
    mergePeopleInData(d, "keep", "dupe");
    expect(d.returnVisits.find((v) => v.id === "v-dupe")!.status).toBe("cancelled");
    expect(d.returnVisits.find((v) => v.id === "v-keep")!.status).toBe("planned");
    expect(d.ministryEvents[0].status).toBe("cancelled");
    // exactly one planned visit left in that slot
    expect(d.returnVisits.filter((v) => v.status === "planned")).toHaveLength(1);
  });

  it("fills details the kept contact lacks and keeps both sets of notes", () => {
    const d = data({
      people: [
        person({ id: "keep", phone_number: null, private_notes: "Likes tea", general_location: "Kiwatule" }),
        person({ id: "dupe", phone_number: "0772 123456", private_notes: "Works nights", general_location: "Ntinda" }),
      ],
    });
    mergePeopleInData(d, "keep", "dupe");
    const kept = d.people.find((p) => p.id === "keep")!;
    expect(kept.phone_number).toBe("0772 123456"); // filled
    expect(kept.general_location).toBe("Kiwatule"); // kept's own wins
    expect(kept.private_notes).toBe("Likes tea\n\nWorks nights"); // both kept
  });

  it("refuses to merge a contact with itself or one that is not there", () => {
    expect(() => mergePeopleInData(data(), "keep", "keep")).toThrow();
    expect(() => mergePeopleInData(data(), "keep", "nobody")).toThrow();
  });
});

describe("unmergePeopleInData", () => {
  it("puts everything back exactly as it was", () => {
    const d = data({
      people: [
        person({ id: "keep", phone_number: null, private_notes: "Likes tea" }),
        person({ id: "dupe", phone_number: "0772 123456", private_notes: "Works nights" }),
      ],
      returnVisits: [
        visit({ id: "v-keep", person_id: "keep" }),
        visit({ id: "v-dupe", person_id: "dupe" }),
        visit({ id: "v-other", person_id: "dupe", scheduled_date: "2026-11-01" }),
      ],
      ministryEvents: [event({ id: "e-dupe", person_id: "dupe", return_visit_id: "v-dupe" })],
    });
    const before = structuredClone(d);
    const log = mergePeopleInData(d, "keep", "dupe");
    unmergePeopleInData(d, log);

    expect(d.conversations.map((c) => [c.id, c.person_id])).toEqual([
      ["c1", "keep"],
      ["c2", "dupe"],
    ]);
    expect(d.returnVisits.map((v) => [v.id, v.person_id, v.status])).toEqual(
      before.returnVisits.map((v) => [v.id, v.person_id, v.status])
    );
    expect(d.ministryEvents[0].person_id).toBe("dupe");
    expect(d.ministryEvents[0].status).toBe("planned");
    const kept = d.people.find((p) => p.id === "keep")!;
    expect(kept.phone_number).toBeNull();
    expect(kept.private_notes).toBe("Likes tea");
    const back = d.people.find((p) => p.id === "dupe")!;
    expect(back.archived_at).toBeNull();
    expect(back.merged_into_id).toBeNull();
    expect(d.personMerges![0].undone_at).toBeTruthy();
  });

  it("leaves anything added to the kept contact since the merge where it is", () => {
    const d = data();
    const log = mergePeopleInData(d, "keep", "dupe");
    d.conversations.push(conv("c3", "keep")); // recorded after the merge
    unmergePeopleInData(d, log);
    expect(d.conversations.find((c) => c.id === "c3")!.person_id).toBe("keep");
    expect(d.conversations.find((c) => c.id === "c2")!.person_id).toBe("dupe");
  });

  it("cannot be undone twice", () => {
    const d = data();
    const log = mergePeopleInData(d, "keep", "dupe");
    unmergePeopleInData(d, log);
    expect(() => unmergePeopleInData(d, log)).toThrow();
  });
});

describe("contactSummary", () => {
  it("counts what is attached to a contact, ignoring cancelled visits", () => {
    const d = data({
      returnVisits: [
        visit({ id: "a", person_id: "keep" }),
        visit({ id: "b", person_id: "keep", status: "cancelled", scheduled_date: "2026-10-01" }),
      ],
    });
    expect(contactSummary("keep", d)).toEqual({
      conversations: 1,
      visits: 1,
      studies: 0,
      photos: 0,
    });
  });
});

describe("reminders and merging", () => {
  const reminder = (id: string, person_id: string | null) =>
    ({ id, person_id, text: "Call", due_at: "2026-10-25T16:00:00.000Z" }) as PersonalReminder;

  it("moves reminders about the merged contact onto the kept one, and back on undo", () => {
    const d = data({
      personalReminders: [reminder("r-dupe", "dupe"), reminder("r-keep", "keep"), reminder("r-none", null)],
    });
    const log = mergePeopleInData(d, "keep", "dupe");
    expect(d.personalReminders!.map((r) => [r.id, r.person_id])).toEqual([
      ["r-dupe", "keep"],
      ["r-keep", "keep"],
      ["r-none", null],
    ]);
    unmergePeopleInData(d, log);
    expect(d.personalReminders!.map((r) => [r.id, r.person_id])).toEqual([
      ["r-dupe", "dupe"],
      ["r-keep", "keep"],
      ["r-none", null],
    ]);
  });
});
