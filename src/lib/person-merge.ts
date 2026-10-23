import type { PersonalReminder } from "@/lib/reminders";
import type {
  BibleStudy,
  BibleStudySession,
  Conversation,
  Person,
  PersonMergeLog,
  PersonPhoto,
  ReturnVisit,
  ScheduledMinistryEvent,
} from "@/lib/types";
import { MINISTRY_DAYS, daysOf } from "@/lib/ministry-days";

/**
 * Merging two contacts: everything that belonged to one moves to the other,
 * the merged contact is hidden (never deleted), and a log records exactly what
 * moved so the merge can be undone.
 *
 * Against the database this is the `merge_people` / `unmerge_people` SQL
 * functions (one all-or-nothing step). This module is the same logic for the
 * local demo data, and the counts shown in the merge preview for both.
 */

export interface MergeableData {
  people: Person[];
  conversations: Conversation[];
  returnVisits: ReturnVisit[];
  bibleStudies: BibleStudy[];
  studySessions: BibleStudySession[];
  ministryEvents: ScheduledMinistryEvent[];
  personPhotos: PersonPhoto[];
  personMerges?: PersonMergeLog[];
  /** Reminders about the contact move with them. */
  personalReminders?: PersonalReminder[];
}

/** Details copied onto the kept contact only where it has none of its own. */
const FILLABLE = [
  "phone_number",
  "general_location",
  "area_id",
  "location_lat",
  "location_lng",
  "preferred_contact_time",
  "current_discussion_theme",
  "key_questions",
  "private_notes",
] as const;
/** Where both contacts have notes, keep both. */
const APPENDABLE = new Set<string>(["private_notes", "key_questions"]);

type PersonRecord = Record<string, unknown>;

const blank = (v: unknown) => v === null || v === undefined || v === "";

/** What a contact has attached to them, for the merge preview. */
export function contactSummary(
  personId: string,
  data: Pick<
    MergeableData,
    "conversations" | "returnVisits" | "bibleStudies" | "personPhotos"
  >
) {
  return {
    conversations: data.conversations.filter((c) => c.person_id === personId).length,
    visits: data.returnVisits.filter(
      (r) => r.person_id === personId && r.status !== "cancelled"
    ).length,
    studies: data.bibleStudies.filter((s) => s.person_id === personId).length,
    photos: data.personPhotos.filter((p) => p.person_id === personId).length,
  };
}

function ids<T extends { id: string; person_id: string | null }>(
  rows: T[],
  from: string
) {
  return rows.filter((r) => r.person_id === from).map((r) => r.id);
}

function repoint<T extends { id: string; person_id: string | null }>(
  rows: T[],
  moveIds: Set<string>,
  to: string
): T[] {
  return rows.map((r) => (moveIds.has(r.id) ? { ...r, person_id: to } : r));
}

/** Merges `mergeId` into `keepId`. Returns the id of the log entry. */
export function mergePeopleInData(
  data: MergeableData,
  keepId: string,
  mergeId: string,
  now = new Date().toISOString()
): string {
  if (keepId === mergeId) throw new Error("cannot_merge_same_person");
  const keep = data.people.find((p) => p.id === keepId && !p.archived_at);
  const merge = data.people.find((p) => p.id === mergeId && !p.archived_at);
  if (!keep || !merge) throw new Error("contact_not_found");

  // A planned visit identical to one the kept contact already has would be a
  // duplicate appointment — cancel it (kept as history).
  const clash = data.returnVisits
    .filter(
      (rv) =>
        rv.person_id === mergeId &&
        rv.status === "planned" &&
        data.returnVisits.some(
          (k) =>
            k.person_id === keepId &&
            k.status === "planned" &&
            k.scheduled_date === rv.scheduled_date &&
            (k.scheduled_time || "") === (rv.scheduled_time || "")
        )
    )
    .map((rv) => rv.id);
  const clashSet = new Set(clash);
  data.returnVisits = data.returnVisits.map((rv) =>
    clashSet.has(rv.id) ? { ...rv, status: "cancelled", updated_at: now } : rv
  );
  data.ministryEvents = data.ministryEvents.map((e) =>
    e.return_visit_id && clashSet.has(e.return_visit_id) && e.status === "planned"
      ? { ...e, status: "cancelled", updated_at: now }
      : e
  );

  const moved = {
    cancelled_visits: clash,
    conversations: ids(data.conversations, mergeId),
    return_visits: ids(data.returnVisits, mergeId),
    bible_studies: ids(data.bibleStudies, mergeId),
    bible_study_sessions: ids(data.studySessions, mergeId),
    scheduled_ministry_events: ids(data.ministryEvents, mergeId),
    person_photos: ids(data.personPhotos, mergeId),
    personal_reminders: ids(data.personalReminders ?? [], mergeId),
  };
  data.conversations = repoint(data.conversations, new Set(moved.conversations), keepId);
  data.returnVisits = repoint(data.returnVisits, new Set(moved.return_visits), keepId);
  data.bibleStudies = repoint(data.bibleStudies, new Set(moved.bible_studies), keepId);
  data.studySessions = repoint(data.studySessions, new Set(moved.bible_study_sessions), keepId);
  data.ministryEvents = repoint(
    data.ministryEvents,
    new Set(moved.scheduled_ministry_events),
    keepId
  );
  data.personPhotos = repoint(data.personPhotos, new Set(moved.person_photos), keepId);
  if (data.personalReminders) {
    data.personalReminders = repoint(
      data.personalReminders,
      new Set(moved.personal_reminders),
      keepId
    );
  }

  // Fill what the kept contact is missing; keep both sets of notes.
  const kv = { ...(keep as unknown as PersonRecord) };
  const mv = merge as unknown as PersonRecord;
  const prev: PersonRecord = {};
  const changed: string[] = [];
  for (const f of FILLABLE) {
    if (blank(kv[f])) {
      if (!blank(mv[f])) {
        prev[f] = kv[f] ?? null;
        kv[f] = mv[f];
        changed.push(f);
      }
    } else if (APPENDABLE.has(f) && !blank(mv[f]) && mv[f] !== kv[f]) {
      prev[f] = kv[f];
      kv[f] = `${kv[f]}\n\n${mv[f]}`;
      changed.push(f);
    }
  }

  // Ministry days: the kept contact ends up with the days of both.
  const keepDays = daysOf(keep);
  const mergeDays = daysOf(merge);
  if (mergeDays.some((d) => !keepDays.includes(d))) {
    prev.ministry_days = keepDays;
    kv.ministry_days = MINISTRY_DAYS.filter(
      (d) => keepDays.includes(d) || mergeDays.includes(d)
    );
    changed.push("ministry_days");
  }

  data.people = data.people.map((p) => {
    if (p.id === keepId) {
      const filled: PersonRecord = {};
      for (const f of changed) filled[f] = kv[f];
      return { ...p, ...filled, updated_at: now } as Person;
    }
    if (p.id === mergeId) {
      return { ...p, archived_at: now, merged_into_id: keepId, updated_at: now };
    }
    return p;
  });

  const log: PersonMergeLog = {
    id: crypto.randomUUID(),
    user_id: keep.user_id,
    kept_person_id: keepId,
    merged_person_id: mergeId,
    moved: { ...moved, changed, prev },
    created_at: now,
    undone_at: null,
  };
  data.personMerges = [log, ...(data.personMerges || [])];
  return log.id;
}

/** Undoes a merge: puts back exactly what it moved. */
export function unmergePeopleInData(
  data: MergeableData,
  logId: string,
  now = new Date().toISOString()
): void {
  const log = (data.personMerges || []).find((l) => l.id === logId && !l.undone_at);
  if (!log) throw new Error("merge_not_found");
  const { kept_person_id: keepId, merged_person_id: mergeId, moved } = log;
  if (!data.people.some((p) => p.id === mergeId)) throw new Error("contact_not_found");

  const back = <T extends { id: string; person_id: string | null }>(
    rows: T[],
    movedIds: string[]
  ) => {
    const set = new Set(movedIds);
    // Only what is still with the kept contact: anything added since stays put.
    return rows.map((r) =>
      set.has(r.id) && r.person_id === keepId ? { ...r, person_id: mergeId } : r
    );
  };
  data.conversations = back(data.conversations, moved.conversations);
  data.returnVisits = back(data.returnVisits, moved.return_visits);
  data.bibleStudies = back(data.bibleStudies, moved.bible_studies);
  data.studySessions = back(data.studySessions, moved.bible_study_sessions);
  data.ministryEvents = back(data.ministryEvents, moved.scheduled_ministry_events);
  data.personPhotos = back(data.personPhotos, moved.person_photos);
  if (data.personalReminders) {
    data.personalReminders = back(
      data.personalReminders,
      moved.personal_reminders ?? []
    );
  }

  const cancelled = new Set(moved.cancelled_visits);
  data.returnVisits = data.returnVisits.map((rv) =>
    cancelled.has(rv.id) && rv.status === "cancelled"
      ? { ...rv, status: "planned", updated_at: now }
      : rv
  );
  data.ministryEvents = data.ministryEvents.map((e) =>
    e.return_visit_id && cancelled.has(e.return_visit_id) && e.status === "cancelled"
      ? { ...e, status: "planned", updated_at: now }
      : e
  );

  data.people = data.people.map((p) => {
    if (p.id === mergeId) {
      return { ...p, archived_at: null, merged_into_id: null, updated_at: now };
    }
    if (p.id === keepId) {
      const restored: PersonRecord = {};
      for (const f of moved.changed) restored[f] = moved.prev[f] ?? null;
      return { ...p, ...restored, updated_at: now } as Person;
    }
    return p;
  });
  data.personMerges = (data.personMerges || []).map((l) =>
    l.id === logId ? { ...l, undone_at: now } : l
  );
}
