import { describe, expect, it } from "vitest";
import {
  favoriteEntries,
  recentEntries,
  searchToolkit,
  sortToolkit,
  splitReferences,
  toolkitCategories,
  toolkitEntryToForm,
  toolkitPayload,
} from "@/lib/toolkit";
import { EMPTY_TOOLKIT_FORM, type ToolkitEntry } from "@/lib/types";

function entry(o: Partial<ToolkitEntry>): ToolkitEntry {
  return {
    id: "e1",
    user_id: "u",
    kind: "faq",
    title: "Why does God allow suffering?",
    explanation: null,
    scripture_refs: [],
    suggested_response: null,
    follow_up_questions: [],
    personal_notes: null,
    category: null,
    is_favorite: false,
    last_used_at: null,
    created_at: "2026-10-01T10:00:00.000Z",
    updated_at: "2026-10-01T10:00:00.000Z",
    ...o,
  };
}

describe("searchToolkit", () => {
  const entries = [
    entry({ id: "1", title: "Why suffering?", suggested_response: "Start with hope" }),
    entry({ id: "2", title: "Opener", kind: "starter", personal_notes: "Works at the market" }),
    entry({ id: "3", title: "Hope", kind: "scripture", scripture_refs: ["Rev 21:4"] }),
    entry({ id: "4", title: "Other", follow_up_questions: ["What gives you comfort?"], category: "Comfort" }),
  ];

  it("returns everything for an empty search", () => {
    expect(searchToolkit(entries, "  ")).toHaveLength(4);
  });

  it("finds a word in any field, ignoring case", () => {
    expect(searchToolkit(entries, "HOPE").map((e) => e.id)).toEqual(["1", "3"]);
    expect(searchToolkit(entries, "market").map((e) => e.id)).toEqual(["2"]);
    expect(searchToolkit(entries, "rev 21").map((e) => e.id)).toEqual(["3"]);
    expect(searchToolkit(entries, "comfort").map((e) => e.id)).toEqual(["4"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(searchToolkit(entries, "zzz")).toEqual([]);
  });
});

describe("ordering, favourites and recents", () => {
  it("lists favourites first, then alphabetically", () => {
    const sorted = sortToolkit([
      entry({ id: "b", title: "banana" }),
      entry({ id: "z", title: "Zebra", is_favorite: true }),
      entry({ id: "a", title: "Apple" }),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["z", "a", "b"]);
  });

  it("picks out favourites", () => {
    const favs = favoriteEntries([
      entry({ id: "1", is_favorite: true }),
      entry({ id: "2" }),
    ]);
    expect(favs.map((e) => e.id)).toEqual(["1"]);
  });

  it("shows the most recently opened first and skips never-opened entries", () => {
    const recent = recentEntries(
      [
        entry({ id: "old", last_used_at: "2026-10-01T10:00:00.000Z" }),
        entry({ id: "never" }),
        entry({ id: "new", last_used_at: "2026-10-08T10:00:00.000Z" }),
        entry({ id: "mid", last_used_at: "2026-10-05T10:00:00.000Z" }),
      ],
      2
    );
    expect(recent.map((e) => e.id)).toEqual(["new", "mid"]);
  });
});

describe("categories", () => {
  it("lists the ones in use once each, ignoring case, optionally for one kind", () => {
    const entries = [
      entry({ kind: "faq", category: "Hope" }),
      entry({ kind: "faq", category: "hope" }),
      entry({ kind: "starter", category: "Comfort" }),
      entry({ kind: "faq", category: "  " }),
      entry({ kind: "faq", category: null }),
    ];
    expect(toolkitCategories(entries)).toEqual(["Comfort", "Hope"]);
    expect(toolkitCategories(entries, "faq")).toEqual(["Hope"]);
  });
});

describe("saving an entry", () => {
  it("separates references by line or semicolon but keeps comma lists whole", () => {
    expect(splitReferences("Matt 24:14; Rev 21:4\nPs 83:18")).toEqual([
      "Matt 24:14",
      "Rev 21:4",
      "Ps 83:18",
    ]);
    expect(splitReferences("Matt 24:3, 14")).toEqual(["Matt 24:3, 14"]);
  });

  it("trims text, nulls empty fields and turns lists into arrays", () => {
    const payload = toolkitPayload({
      ...EMPTY_TOOLKIT_FORM,
      kind: "starter",
      title: "  Ask about their day ",
      explanation: "   ",
      scripture_refs: "John 3:16;\n\n Ps 23 ",
      follow_up_questions: "What do you enjoy?\n  \nWhat worries you?",
      category: " Warm-up ",
      is_favorite: true,
    });
    expect(payload).toEqual({
      kind: "starter",
      title: "Ask about their day",
      explanation: null,
      scripture_refs: ["John 3:16", "Ps 23"],
      suggested_response: null,
      follow_up_questions: ["What do you enjoy?", "What worries you?"],
      personal_notes: null,
      category: "Warm-up",
      is_favorite: true,
    });
  });

  it("round-trips an entry through the form", () => {
    const e = entry({
      explanation: "Short",
      scripture_refs: ["John 3:16", "Ps 23"],
      follow_up_questions: ["Q1", "Q2"],
      category: "Hope",
      is_favorite: true,
    });
    const back = toolkitPayload(toolkitEntryToForm(e));
    expect(back).toMatchObject({
      explanation: "Short",
      scripture_refs: ["John 3:16", "Ps 23"],
      follow_up_questions: ["Q1", "Q2"],
      category: "Hope",
      is_favorite: true,
    });
  });
});
