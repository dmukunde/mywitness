import type {
  BibleStudy,
  BibleStudySession,
  Conversation,
  MinistryEventStatus,
  ReturnVisit,
  ScheduledMinistryEvent,
} from "@/lib/types";

/**
 * Single source of truth for "what is scheduled, and what state is it in" —
 * the same role ministry-time.ts plays for ministry-time totals. People,
 * the person profile, Home, Calendar, Return Visits, Bible Studies and
 * Activity all read through here, so they can never disagree.
 *
 * Lifecycle: Scheduled -> Due (today) -> Overdue (missed) -> Completed.
 * "Overdue" is derived from an *unresolved* scheduled activity, never
 * stored. An activity counts as resolved when any of these is true:
 *   - it was explicitly completed (return visit / calendar event status)
 *   - a conversation was recorded with that person after it was scheduled,
 *     dated on/after its scheduled date (return visits)
 *   - a study session was recorded on/after its scheduled date (studies)
 * The last two mean data that got stuck before explicit resolution
 * existed heals itself without a migration.
 */

export type ActivityState = "upcoming" | "due" | "overdue" | "completed";

export type ScheduledActivity = ScheduledMinistryEvent & {
  state: ActivityState;
};

export interface ScheduleInput {
  events: ScheduledMinistryEvent[];
  returnVisits: ReturnVisit[];
  bibleStudies: BibleStudy[];
  conversations: Conversation[];
  studySessions: BibleStudySession[];
  today: string;
}

/** The most "resolved" of two statuses wins, so a drifted mirror can't resurrect an item. */
function mergeStatus(
  a: MinistryEventStatus,
  b: MinistryEventStatus | undefined
): MinistryEventStatus {
  const all = [a, b].filter(Boolean) as MinistryEventStatus[];
  if (all.includes("cancelled")) return "cancelled";
  if (all.includes("completed")) return "completed";
  if (all.includes("rescheduled")) return "rescheduled";
  return "planned";
}

function stateOf(
  status: MinistryEventStatus,
  date: string,
  today: string
): ActivityState {
  if (status !== "planned") return "completed";
  if (date > today) return "upcoming";
  if (date === today) return "due";
  return "overdue";
}

/** A later conversation with the same person, recorded after this visit was scheduled. */
function returnVisitFulfilled(
  rv: ReturnVisit,
  conversations: Conversation[]
): boolean {
  const scheduledAt = Date.parse(rv.created_at);
  return conversations.some(
    (c) =>
      c.person_id === rv.person_id &&
      c.id !== rv.conversation_id &&
      c.conversation_date >= rv.scheduled_date &&
      Date.parse(c.created_at) > scheduledAt
  );
}

function studyOccurrenceFulfilled(
  study: BibleStudy,
  date: string,
  studySessions: BibleStudySession[]
): boolean {
  return studySessions.some(
    (s) => s.bible_study_id === study.id && s.session_date >= date
  );
}

export function buildActivities(input: ScheduleInput): ScheduledActivity[] {
  const { events, returnVisits, bibleStudies, conversations, studySessions, today } =
    input;
  const byKey = new Map<string, ScheduledMinistryEvent>();

  // Return visits: the return_visits row is the record; its calendar event
  // is only a mirror, so the row's own fields win when they differ.
  const eventByVisit = new Map(
    events.filter((e) => e.return_visit_id).map((e) => [e.return_visit_id!, e])
  );
  for (const rv of returnVisits) {
    const mirror = eventByVisit.get(rv.id);
    let status = mergeStatus(rv.status, mirror?.status);
    if (status === "cancelled" || status === "rescheduled") continue;
    if (status === "planned" && returnVisitFulfilled(rv, conversations)) {
      status = "completed";
    }
    byKey.set(`rv:${rv.id}`, {
      ...(mirror ?? {}),
      id: mirror?.id ?? `rv-${rv.id}`,
      user_id: rv.user_id,
      person_id: rv.person_id,
      event_type: "return_visit",
      return_visit_id: rv.id,
      bible_study_id: null,
      scheduled_date: rv.scheduled_date,
      scheduled_time: rv.scheduled_time,
      general_location: rv.general_location,
      // The topic planned for THIS visit — not the previous visit's.
      topic_or_lesson: rv.next_planned_topic,
      preparation_notes: rv.preparation_notes,
      status,
      is_demo: rv.is_demo,
      created_at: rv.created_at,
      updated_at: rv.updated_at,
    });
  }

  // Bible studies: past appointments are history (completed events); the
  // single upcoming appointment is whatever the study currently says it is.
  // A stale planned event can no longer mask a newer date.
  const studyIds = new Set(bibleStudies.map((s) => s.id));
  for (const e of events) {
    if (!e.bible_study_id || e.status !== "completed") continue;
    if (!studyIds.has(e.bible_study_id)) continue;
    byKey.set(`bs:${e.bible_study_id}:${e.scheduled_date}`, e);
  }
  for (const s of bibleStudies) {
    if (s.status !== "active" || !s.next_study_date) continue;
    const key = `bs:${s.id}:${s.next_study_date}`;
    if (byKey.has(key)) continue;
    const mirror = events.find(
      (e) => e.bible_study_id === s.id && e.status === "planned"
    );
    const fulfilled = studyOccurrenceFulfilled(s, s.next_study_date, studySessions);
    byKey.set(key, {
      ...(mirror ?? {}),
      id: mirror?.id ?? `bs-${s.id}`,
      user_id: s.user_id,
      person_id: s.person_id,
      event_type: "bible_study",
      return_visit_id: null,
      bible_study_id: s.id,
      scheduled_date: s.next_study_date,
      scheduled_time: s.next_study_time,
      general_location: s.general_location,
      topic_or_lesson: s.current_lesson,
      preparation_notes: s.preparation_notes,
      status: fulfilled ? "completed" : "planned",
      is_demo: s.is_demo,
      created_at: s.created_at,
      updated_at: s.updated_at,
    });
  }

  return [...byKey.values()]
    .map((e) => ({ ...e, state: stateOf(e.status, e.scheduled_date, today) }))
    .sort((a, b) => {
      const d = a.scheduled_date.localeCompare(b.scheduled_date);
      if (d !== 0) return d;
      return (a.scheduled_time || "").localeCompare(b.scheduled_time || "");
    });
}

/** Everything not yet resolved (upcoming, due, or overdue). */
export function unresolved(activities: ScheduledActivity[]): ScheduledActivity[] {
  return activities.filter((a) => a.state !== "completed");
}

/**
 * What a person's card should show: their earliest unresolved activity.
 * An old overdue item can only appear here if it truly was never followed up.
 */
export function nextActivityForPerson(
  activities: ScheduledActivity[],
  personId: string
): ScheduledActivity | null {
  return (
    unresolved(activities).find((a) => a.person_id === personId) ?? null
  );
}

/**
 * The planned visit already occupying a person's date/time slot, if any.
 * Saving a conversation whose follow-up lands on an existing scheduled visit
 * should update that visit, not fail or create a second one.
 */
export function findPlannedVisitInSlot(
  returnVisits: ReturnVisit[],
  personId: string,
  date: string,
  time: string | null
): ReturnVisit | undefined {
  return returnVisits.find(
    (rv) =>
      rv.person_id === personId &&
      rv.status === "planned" &&
      rv.scheduled_date === date &&
      (rv.scheduled_time || null) === (time || null)
  );
}

/** Planned return visits for a person on/before a date — to resolve when that person is visited. */
export function returnVisitsToComplete(
  returnVisits: ReturnVisit[],
  personId: string,
  throughDate: string,
  excludeIds: string[] = []
): ReturnVisit[] {
  return returnVisits.filter(
    (rv) =>
      rv.person_id === personId &&
      rv.status === "planned" &&
      rv.scheduled_date <= throughDate &&
      !excludeIds.includes(rv.id)
  );
}

/** Overdue planned return visits for a person — superseded when a new one is scheduled. */
export function returnVisitsToSupersede(
  returnVisits: ReturnVisit[],
  personId: string,
  today: string,
  excludeIds: string[] = []
): ReturnVisit[] {
  return returnVisits.filter(
    (rv) =>
      rv.person_id === personId &&
      rv.status === "planned" &&
      rv.scheduled_date < today &&
      !excludeIds.includes(rv.id)
  );
}
