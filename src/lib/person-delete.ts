import type { DemoData } from "@/lib/demo-data";

/**
 * Permanently removes a person, and everything recorded about them, from the
 * practice (demo) data. Mirrors what `delete_person_permanently` does in the
 * database (migration 021). Changes `data` in place, like the other demo helpers.
 */
export function removePersonFromDemoData(data: DemoData, personId: string): void {
  const goneConversations = new Set(
    data.conversations.filter((c) => c.person_id === personId).map((c) => c.id)
  );
  const goneVisits = new Set(
    data.returnVisits.filter((v) => v.person_id === personId).map((v) => v.id)
  );
  const goneStudies = new Set(
    data.bibleStudies.filter((s) => s.person_id === personId).map((s) => s.id)
  );

  data.people = data.people
    .filter((p) => p.id !== personId)
    .map((p) => (p.merged_into_id === personId ? { ...p, merged_into_id: null } : p));
  data.conversations = data.conversations.filter((c) => !goneConversations.has(c.id));
  data.scriptures = data.scriptures.filter((s) => !goneConversations.has(s.conversation_id));
  data.returnVisits = data.returnVisits.filter((v) => !goneVisits.has(v.id));
  data.reminders = data.reminders.filter(
    (r) => !r.return_visit_id || !goneVisits.has(r.return_visit_id)
  );
  data.bibleStudies = data.bibleStudies.filter((s) => !goneStudies.has(s.id));
  data.studySessions = data.studySessions.filter(
    (s) => !goneStudies.has(s.bible_study_id) && s.person_id !== personId
  );
  data.ministryEvents = data.ministryEvents.filter((e) => e.person_id !== personId);
  data.personPhotos = data.personPhotos.filter((p) => p.person_id !== personId);
  data.personMerges = data.personMerges.filter(
    (m) => m.kept_person_id !== personId && m.merged_person_id !== personId
  );
  data.personalReminders = data.personalReminders.filter((r) => r.person_id !== personId);
}

/** What deleting someone permanently takes with it, in plain words, for the confirmation. */
export function describeDeletion(
  name: string,
  counts: { conversations: number; visits: number; studies: number; photos: number }
): string {
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };
  add(counts.conversations, "conversation", "conversations");
  add(counts.visits, "visit", "visits");
  add(counts.studies, "Bible study", "Bible studies");
  add(counts.photos, "photo", "photos");
  const list = parts.length ? ` This includes ${parts.join(", ")}.` : "";
  return `${name} and everything you recorded about them, including notes, visits, studies, photos and reminders, will be deleted for good.${list} This cannot be undone.`;
}
