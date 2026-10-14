import { describe, expect, it } from "vitest";
import {
  compareNames,
  findDuplicatePairs,
  findPersonMatches,
  normalizeName,
} from "@/lib/person-match";
import type { Person } from "@/lib/types";

function person(o: Partial<Person>): Person {
  return {
    id: "p1",
    user_id: "u",
    name: "Ronald",
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
    created_at: "2026-10-01T10:00:00.000Z",
    updated_at: "2026-10-01T10:00:00.000Z",
    ...o,
  };
}

describe("normalizeName", () => {
  it("ignores case, accents, punctuation and extra spaces", () => {
    expect(normalizeName("  José   O'Brien-Smith ")).toBe("jose o brien smith");
  });
});

describe("compareNames", () => {
  it("calls the same name, however typed, exact", () => {
    expect(compareNames("Ronald", "ronald")).toBe("exact");
    expect(compareNames("  Ronald  Mukasa", "ronald mukasa")).toBe("exact");
    expect(compareNames("José", "Jose")).toBe("exact");
  });

  it("catches common misspellings", () => {
    expect(compareNames("Lilian", "Lillian")).toBe("similar");
    expect(compareNames("Lillian", "Lilian")).toBe("similar");
    expect(compareNames("Catherine", "Katherine")).toBeNull(); // first letter differs
    expect(compareNames("Maria", "Mariah")).toBe("similar");
    expect(compareNames("John", "Jon")).toBe("similar");
    expect(compareNames("Micheal", "Michael")).toBe("similar"); // swapped letters
    expect(compareNames("Nakato Sarah", "Nakato Sara")).toBe("similar");
  });

  it("does not suggest names that are simply different", () => {
    expect(compareNames("Ronald", "Donald")).toBeNull();
    expect(compareNames("Eve", "Eva")).toBeNull();
    expect(compareNames("Miriam", "Victoria")).toBeNull();
    expect(compareNames("Grace", "Esther Mukasa")).toBeNull();
    expect(compareNames("Peter Okello", "Paul Okello")).toBeNull();
  });

  it("links a lone first name to a fuller name that starts with it", () => {
    expect(compareNames("Ronald", "Ronald Mukasa")).toBe("similar");
    expect(compareNames("Ronald Mukasa", "Ronald")).toBe("similar");
    expect(compareNames("Mary Ann Smith", "Mary Smith")).toBe("similar");
  });

  it("never matches empty names", () => {
    expect(compareNames("", "Ronald")).toBeNull();
    expect(compareNames("   ", "   ")).toBeNull();
  });
});

describe("findPersonMatches", () => {
  const people = [
    person({ id: "a", name: "Ronald", updated_at: "2026-10-01T00:00:00.000Z" }),
    person({ id: "b", name: "Ronnald", updated_at: "2026-10-05T00:00:00.000Z" }),
    person({ id: "c", name: "Donald" }),
    person({ id: "d", name: "Ronald", archived_at: "2026-09-01T00:00:00.000Z" }),
  ];

  it("lists exact matches before similar ones, skipping archived people", () => {
    const matches = findPersonMatches(people, "ronald");
    expect(matches.map((m) => [m.person.id, m.level])).toEqual([
      ["a", "exact"],
      ["b", "similar"],
    ]);
  });

  it("can leave one person out (so they don't match themselves)", () => {
    const matches = findPersonMatches(people, "Ronald", { excludeId: "a" });
    expect(matches.map((m) => m.person.id)).toEqual(["b"]);
  });

  it("finds nothing for a new name", () => {
    expect(findPersonMatches(people, "Esther")).toEqual([]);
  });
});

describe("findDuplicatePairs", () => {
  it("pairs up likely duplicates, exact first, ignoring archived people", () => {
    const pairs = findDuplicatePairs([
      person({ id: "1", name: "Lilian" }),
      person({ id: "2", name: "Lillian" }),
      person({ id: "3", name: "Justine" }),
      person({ id: "4", name: "Justine" }),
      person({ id: "5", name: "Justine", archived_at: "2026-10-01T00:00:00.000Z" }),
    ]);
    expect(pairs.map((p) => [p.a.id, p.b.id, p.level])).toEqual([
      ["3", "4", "exact"],
      ["1", "2", "similar"],
    ]);
  });
});
