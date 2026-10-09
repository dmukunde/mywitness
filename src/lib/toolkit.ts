import type {
  ToolkitEntry,
  ToolkitFormData,
  ToolkitKind,
} from "@/lib/types";

/**
 * Plain, predictable search over the fields a person would remember an entry
 * by. Matches the app's existing "load everything, filter on the device"
 * approach (see lib/study-notes.ts) — a personal library is small, and this
 * keeps search instant and working with no signal in the field.
 */
export function searchToolkit(
  entries: ToolkitEntry[],
  query: string
): ToolkitEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) =>
    [
      e.title,
      e.explanation,
      e.suggested_response,
      e.personal_notes,
      e.category,
      ...e.scripture_refs,
      ...e.follow_up_questions,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
}

/** Favourites first, then alphabetical — a stable, scannable order. */
export function sortToolkit(entries: ToolkitEntry[]): ToolkitEntry[] {
  return [...entries].sort((a, b) => {
    if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

export function favoriteEntries(entries: ToolkitEntry[]): ToolkitEntry[] {
  return sortToolkit(entries.filter((e) => e.is_favorite));
}

/** Most recently opened first. */
export function recentEntries(
  entries: ToolkitEntry[],
  limit = 5
): ToolkitEntry[] {
  return entries
    .filter((e) => e.last_used_at)
    .sort((a, b) => Date.parse(b.last_used_at!) - Date.parse(a.last_used_at!))
    .slice(0, limit);
}

/** The categories already in use (optionally within one kind), alphabetical. */
export function toolkitCategories(
  entries: ToolkitEntry[],
  kind?: ToolkitKind
): string[] {
  const seen = new Map<string, string>();
  for (const e of entries) {
    if (kind && e.kind !== kind) continue;
    const c = e.category?.trim();
    if (c && !seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c);
  }
  return [...seen.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

/** Splits a textarea into trimmed, non-empty lines. */
export function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * References are one per line; a semicolon also separates them, since people
 * type "Matt 24:14; Rev 21:4". Commas are left alone — they belong to
 * references like "Matt 24:3, 14".
 */
export function splitReferences(value: string): string[] {
  return value
    .split(/[\n;]/)
    .map((r) => r.trim())
    .filter(Boolean);
}

/** What gets saved: trimmed text, empty fields as null, lists as arrays. */
export function toolkitPayload(form: ToolkitFormData) {
  const text = (v: string) => (v.trim() ? v.trim() : null);
  return {
    kind: form.kind,
    title: form.title.trim(),
    explanation: text(form.explanation),
    scripture_refs: splitReferences(form.scripture_refs),
    suggested_response: text(form.suggested_response),
    follow_up_questions: splitLines(form.follow_up_questions),
    personal_notes: text(form.personal_notes),
    category: text(form.category),
    is_favorite: form.is_favorite,
  };
}

export function toolkitEntryToForm(entry: ToolkitEntry): ToolkitFormData {
  return {
    kind: entry.kind,
    title: entry.title,
    explanation: entry.explanation ?? "",
    scripture_refs: entry.scripture_refs.join("\n"),
    suggested_response: entry.suggested_response ?? "",
    follow_up_questions: entry.follow_up_questions.join("\n"),
    personal_notes: entry.personal_notes ?? "",
    category: entry.category ?? "",
    is_favorite: entry.is_favorite,
  };
}
