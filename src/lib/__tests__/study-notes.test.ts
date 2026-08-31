import { describe, expect, it } from "vitest";
import { parseReferenceLines, searchStudyNotes } from "@/lib/study-notes";
import type { StudyNote } from "@/lib/types";

function makeNote(overrides: Partial<StudyNote>): StudyNote {
  return {
    id: "note-1",
    user_id: "user-1",
    note_type: "family_worship",
    title: "Untitled",
    session_label: null,
    note_date: "2026-08-31",
    scripture_refs: null,
    references_text: null,
    body: null,
    is_comment: false,
    archived_at: null,
    created_at: "2026-08-31T00:00:00.000Z",
    updated_at: "2026-08-31T00:00:00.000Z",
    ...overrides,
  };
}

describe("searchStudyNotes", () => {
  const notes = [
    makeNote({ id: "1", title: "Paul's example in the ministry" }),
    makeNote({ id: "2", title: "Hope", body: "Discussed suffering and hope for the future" }),
    makeNote({ id: "3", title: "Unrelated", scripture_refs: "Romans 12:12" }),
    makeNote({ id: "4", title: "Another", references_text: "https://www.jw.org/some-article" }),
  ];

  it("returns everything for an empty query", () => {
    expect(searchStudyNotes(notes, "")).toHaveLength(4);
    expect(searchStudyNotes(notes, "   ")).toHaveLength(4);
  });

  it("matches on title, case-insensitively", () => {
    const result = searchStudyNotes(notes, "PAUL");
    expect(result.map((n) => n.id)).toEqual(["1"]);
  });

  it("matches on body text", () => {
    const result = searchStudyNotes(notes, "suffering");
    expect(result.map((n) => n.id)).toEqual(["2"]);
  });

  it("matches on scripture references", () => {
    const result = searchStudyNotes(notes, "Romans");
    expect(result.map((n) => n.id)).toEqual(["3"]);
  });

  it("matches on references text", () => {
    const result = searchStudyNotes(notes, "jw.org");
    expect(result.map((n) => n.id)).toEqual(["4"]);
  });

  it("returns nothing when no field matches", () => {
    expect(searchStudyNotes(notes, "nonexistent-topic-xyz")).toHaveLength(0);
  });
});

describe("parseReferenceLines", () => {
  it("returns an empty list for empty input", () => {
    expect(parseReferenceLines(null)).toEqual([]);
    expect(parseReferenceLines("")).toEqual([]);
  });

  it("marks a line that is entirely a URL as a link", () => {
    const [line] = parseReferenceLines("https://www.jw.org/en/library/");
    expect(line.url).toBe("https://www.jw.org/en/library/");
  });

  it("does not treat a sentence merely containing a URL as a link", () => {
    const [line] = parseReferenceLines(
      "See the article at https://www.jw.org for more."
    );
    expect(line.url).toBeNull();
  });

  it("rejects non-http(s) schemes", () => {
    const [line] = parseReferenceLines("javascript:alert(1)");
    expect(line.url).toBeNull();
  });

  it("skips blank lines and trims whitespace", () => {
    const lines = parseReferenceLines("  Some notes  \n\n  https://www.jw.org  ");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ text: "Some notes", url: null });
    expect(lines[1].url).toBe("https://www.jw.org/");
  });
});
