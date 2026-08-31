import type { StudyNote } from "@/lib/types";

/**
 * Simple, reliable substring search over the fields a user would actually
 * remember a note by. Matches the app's existing "fetch everything, filter
 * client-side" architecture (see people/bible-studies search) rather than
 * introducing a new server-side full-text query path for a personal,
 * small-scale dataset.
 */
export function searchStudyNotes(
  notes: StudyNote[],
  query: string
): StudyNote[] {
  const q = query.trim().toLowerCase();
  if (!q) return notes;
  return notes.filter((n) =>
    [n.title, n.session_label, n.scripture_refs, n.references_text, n.body]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
}

/** One line of a references field, with a URL only if the whole line is one. */
export interface ReferenceLine {
  text: string;
  url: string | null;
}

/**
 * Splits a references field into lines, marking a line as a link only when
 * the *entire* trimmed line is a valid http(s) URL — deliberately simple
 * (no inline link detection inside sentences) so plain reference text never
 * gets mangled.
 */
export function parseReferenceLines(value: string | null | undefined): ReferenceLine[] {
  if (!value) return [];
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ text, url: safeHttpUrl(text) }));
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
