import { describe, expect, it } from "vitest";
import { createDemoData } from "@/lib/demo-data";
import { describeDeletion, removePersonFromDemoData } from "@/lib/person-delete";

describe("deleting a person for good (practice data)", () => {
  it("removes the person and everything recorded about them, and nothing else", () => {
    const data = createDemoData();
    const person = data.people.find((p) => data.returnVisits.some((v) => v.person_id === p.id))!;
    const other = data.people.find((p) => p.id !== person.id)!;
    const before = {
      people: data.people.length,
      otherVisits: data.returnVisits.filter((v) => v.person_id !== person.id).length,
      otherConversations: data.conversations.filter((c) => c.person_id !== person.id).length,
    };

    removePersonFromDemoData(data, person.id);

    expect(data.people).toHaveLength(before.people - 1);
    expect(data.people.some((p) => p.id === person.id)).toBe(false);
    expect(data.people.some((p) => p.id === other.id)).toBe(true);
    expect(data.returnVisits.some((v) => v.person_id === person.id)).toBe(false);
    expect(data.returnVisits).toHaveLength(before.otherVisits);
    expect(data.conversations.some((c) => c.person_id === person.id)).toBe(false);
    expect(data.conversations).toHaveLength(before.otherConversations);
    expect(data.ministryEvents.some((e) => e.person_id === person.id)).toBe(false);
    expect(data.bibleStudies.some((s) => s.person_id === person.id)).toBe(false);
    expect(data.personPhotos.some((p) => p.person_id === person.id)).toBe(false);
  });

  it("leaves no scripture or reminder pointing at something that was removed", () => {
    const data = createDemoData();
    const person = data.people.find((p) => data.conversations.some((c) => c.person_id === p.id))!;
    removePersonFromDemoData(data, person.id);
    const conversationIds = new Set(data.conversations.map((c) => c.id));
    const visitIds = new Set(data.returnVisits.map((v) => v.id));
    expect(data.scriptures.every((s) => conversationIds.has(s.conversation_id))).toBe(true);
    expect(data.reminders.every((r) => !r.return_visit_id || visitIds.has(r.return_visit_id))).toBe(true);
  });

  it("does nothing for someone who is not there", () => {
    const data = createDemoData();
    const people = data.people.length;
    removePersonFromDemoData(data, "nobody");
    expect(data.people).toHaveLength(people);
  });
});

describe("saying what will be deleted", () => {
  it("lists what is recorded, in plain words, and says it cannot be undone", () => {
    const text = describeDeletion("Mary", { conversations: 3, visits: 1, studies: 2, photos: 0 });
    expect(text).toContain("Mary");
    expect(text).toContain("3 conversations, 1 visit, 2 Bible studies");
    expect(text).not.toMatch(/\d photos?/); // nothing to count, so none listed
    expect(text).toMatch(/cannot be undone/);
  });

  it("still says it clearly when nothing is recorded", () => {
    const text = describeDeletion("Sam", { conversations: 0, visits: 0, studies: 0, photos: 0 });
    expect(text).not.toContain("This includes");
    expect(text).toMatch(/for good/);
  });
});
