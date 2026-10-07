import type {
  BibleStudy,
  Conversation,
  Person,
  ReturnVisit,
} from "@/lib/types";

/**
 * Detection of duplicates created by double taps and retried saves.
 *
 * Deliberately conservative: two people only count as duplicates when they
 * share a name AND were created within minutes of each other — the
 * signature of one action saved twice. Two people who merely share a name
 * (very common) are never touched.
 */

/** Two people with the same name created this close together are one action saved twice. */
export const PERSON_DUPLICATE_WINDOW_MINUTES = 60;
export const CONVERSATION_DUPLICATE_WINDOW_MINUTES = 10;

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function minutesApart(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 60000;
}

/** Splits items (already sorted by created_at) into runs where each is within `windowMinutes` of the previous. */
function clusterByTime<T extends { created_at: string }>(
  sorted: T[],
  windowMinutes: number
): T[][] {
  const clusters: T[][] = [];
  for (const item of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && minutesApart(last[last.length - 1].created_at, item.created_at) <= windowMinutes) {
      last.push(item);
    } else {
      clusters.push([item]);
    }
  }
  return clusters;
}

function byCreatedAt<T extends { created_at: string }>(a: T, b: T) {
  return Date.parse(a.created_at) - Date.parse(b.created_at);
}

// ---------- people ----------

export interface PersonDuplicateGroup {
  name: string;
  canonical: Person;
  duplicates: Person[];
}

export interface RelatedRecords {
  conversations: Conversation[];
  returnVisits: ReturnVisit[];
  bibleStudies: BibleStudy[];
}

function historySize(personId: string, r: RelatedRecords): number {
  return (
    r.conversations.filter((c) => c.person_id === personId).length +
    r.returnVisits.filter((v) => v.person_id === personId).length +
    r.bibleStudies.filter((s) => s.person_id === personId).length
  );
}

export function findDuplicatePeople(
  people: Person[],
  related: RelatedRecords
): PersonDuplicateGroup[] {
  const byName = new Map<string, Person[]>();
  for (const p of people) {
    if (p.archived_at) continue;
    const key = normalizeName(p.name);
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), p]);
  }

  const groups: PersonDuplicateGroup[] = [];
  for (const members of byName.values()) {
    if (members.length < 2) continue;
    const sorted = [...members].sort(byCreatedAt);
    for (const cluster of clusterByTime(sorted, PERSON_DUPLICATE_WINDOW_MINUTES)) {
      if (cluster.length < 2) continue;
      // Keep the entry with the most history; if tied, the oldest.
      const canonical = [...cluster].sort(
        (a, b) =>
          historySize(b.id, related) - historySize(a.id, related) ||
          byCreatedAt(a, b)
      )[0];
      groups.push({
        name: canonical.name,
        canonical,
        duplicates: cluster.filter((p) => p.id !== canonical.id),
      });
    }
  }
  return groups;
}

/** Maps every duplicate person id to the canonical id it will be merged into. */
export function personMergeMap(groups: PersonDuplicateGroup[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const g of groups) {
    for (const d of g.duplicates) map.set(d.id, g.canonical.id);
  }
  return map;
}

// ---------- scheduled visits ----------

export interface VisitDuplicateGroup {
  canonical: ReturnVisit;
  duplicates: ReturnVisit[];
}

/**
 * Planned visits for the same person, date and time. Only still-planned
 * visits are considered — completed ones are history and are never touched.
 * `merge` treats visits of to-be-merged duplicate people as the canonical
 * person's, so identical visits across the merge collapse too.
 */
export function findDuplicateVisits(
  returnVisits: ReturnVisit[],
  merge: Map<string, string> = new Map()
): VisitDuplicateGroup[] {
  const groups = new Map<string, ReturnVisit[]>();
  for (const v of returnVisits) {
    if (v.status !== "planned") continue;
    const person = merge.get(v.person_id) ?? v.person_id;
    const key = `${person}|${v.scheduled_date}|${norm(v.scheduled_time)}`;
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }

  const out: VisitDuplicateGroup[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    // Prefer the visit that carries the most information, then the oldest.
    const score = (v: ReturnVisit) =>
      (v.conversation_id ? 2 : 0) +
      (v.next_planned_topic ? 1 : 0) +
      (v.preparation_notes ? 1 : 0);
    const sorted = [...members].sort((a, b) => score(b) - score(a) || byCreatedAt(a, b));
    out.push({ canonical: sorted[0], duplicates: sorted.slice(1) });
  }
  return out;
}

// ---------- conversations ----------

export interface ConversationDuplicateGroup {
  canonical: Conversation;
  duplicates: Conversation[];
}

/**
 * Conversations that are exact copies of each other (same person, date and
 * all the text fields) saved within minutes — a save that was submitted
 * twice. Anything that differs at all is kept as separate history.
 */
export function findDuplicateConversations(
  conversations: Conversation[],
  merge: Map<string, string> = new Map()
): ConversationDuplicateGroup[] {
  const groups = new Map<string, Conversation[]>();
  for (const c of conversations) {
    if (!c.person_id) continue;
    const person = merge.get(c.person_id) ?? c.person_id;
    const key = [
      person,
      c.conversation_date,
      norm(c.main_topic),
      norm(c.summary),
      norm(c.questions_asked),
      norm(c.additional_notes),
      norm(c.next_topic),
      norm(c.publications_shared),
    ].join("|");
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }

  const out: ConversationDuplicateGroup[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const sorted = [...members].sort(byCreatedAt);
    for (const cluster of clusterByTime(sorted, CONVERSATION_DUPLICATE_WINDOW_MINUTES)) {
      if (cluster.length < 2) continue;
      out.push({ canonical: cluster[0], duplicates: cluster.slice(1) });
    }
  }
  return out;
}

// ---------- the whole plan ----------

export interface CleanupPlan {
  people: PersonDuplicateGroup[];
  visits: VisitDuplicateGroup[];
  conversations: ConversationDuplicateGroup[];
  /** Extra calendar-event copies beyond one per return visit. */
  extraEvents: number;
}

export function buildCleanupPlan(input: {
  people: Person[];
  returnVisits: ReturnVisit[];
  conversations: Conversation[];
  bibleStudies: BibleStudy[];
  eventVisitIds: Array<string | null>;
}): CleanupPlan {
  const people = findDuplicatePeople(input.people, input);
  const merge = personMergeMap(people);
  const perVisit = new Map<string, number>();
  for (const id of input.eventVisitIds) {
    if (id) perVisit.set(id, (perVisit.get(id) ?? 0) + 1);
  }
  let extraEvents = 0;
  for (const n of perVisit.values()) if (n > 1) extraEvents += n - 1;
  return {
    people,
    visits: findDuplicateVisits(input.returnVisits, merge),
    conversations: findDuplicateConversations(input.conversations, merge),
    extraEvents,
  };
}

export function planIsEmpty(plan: CleanupPlan): boolean {
  return (
    plan.people.length === 0 &&
    plan.visits.length === 0 &&
    plan.conversations.length === 0 &&
    plan.extraEvents === 0
  );
}
