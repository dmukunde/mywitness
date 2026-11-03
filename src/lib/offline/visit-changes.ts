import type {
  Person,
  ReturnVisit,
  ScheduledMinistryEvent,
} from "@/lib/types";

/**
 * Building the records for a return visit scheduled, moved or cancelled with no
 * signal. Every visit has exactly one calendar entry that mirrors it, so a
 * change to a visit always comes with the matching change to its entry. Kept
 * here, apart from the app's big data file, so the exact rules can be tested.
 */

/** What the screens hand over when scheduling a visit. */
export type VisitInput = Omit<
  ReturnVisit,
  "id" | "user_id" | "created_at" | "updated_at" | "is_demo"
>;

/** The columns a visit has in the database (never the people and conversations attached for display). */
function visitColumns(v: Partial<ReturnVisit>) {
  const { person: _person, conversation: _conversation, ...columns } = v;
  void _person;
  void _conversation;
  return columns;
}

type EventSource = Pick<
  ReturnVisit,
  | "person_id"
  | "scheduled_date"
  | "scheduled_time"
  | "general_location"
  | "next_planned_topic"
  | "preparation_notes"
  | "status"
>;

/** The calendar entry's own details, copied from its visit. */
export function eventFields(visit: EventSource) {
  return {
    person_id: visit.person_id,
    event_type: "return_visit" as const,
    bible_study_id: null,
    scheduled_date: visit.scheduled_date,
    scheduled_time: visit.scheduled_time,
    general_location: visit.general_location,
    topic_or_lesson: visit.next_planned_topic,
    preparation_notes: visit.preparation_notes,
    status: visit.status,
  };
}

export interface VisitCreate {
  visit: { payload: Record<string, unknown>; row: ReturnVisit };
  event: { payload: Record<string, unknown>; row: ScheduledMinistryEvent };
}

/** A new visit and its calendar entry: what to send, and what to show meanwhile. */
export function buildVisitCreate(
  input: VisitInput,
  ids: { visitId: string; eventId: string; userId: string },
  now: string
): VisitCreate {
  const columns = visitColumns(input);
  const row = {
    ...columns,
    id: ids.visitId,
    user_id: ids.userId,
    is_demo: false,
    created_at: now,
    updated_at: now,
  } as ReturnVisit;
  const payload = { ...columns, id: ids.visitId, user_id: ids.userId };

  const eventPayload = {
    id: ids.eventId,
    user_id: ids.userId,
    return_visit_id: ids.visitId,
    ...eventFields(row),
  };
  const eventRow = {
    ...eventPayload,
    is_demo: false,
    created_at: now,
    updated_at: now,
  } as ScheduledMinistryEvent;

  return {
    visit: { payload, row },
    event: { payload: eventPayload, row: eventRow },
  };
}

export type EventChange =
  | { kind: "update"; id: string; payload: Record<string, unknown> }
  | { kind: "insert"; id: string; payload: Record<string, unknown>; row: ScheduledMinistryEvent };

export interface VisitUpdate {
  /** What to send for the visit itself. */
  visitPayload: Record<string, unknown>;
  /** The visit as it will look. */
  merged: ReturnVisit;
  /** What to do to its calendar entry. */
  event: EventChange;
}

/** The changes to send for an edit: only what was given, never the id, and stamped with the time. */
export function visitPatchPayload(patch: Partial<ReturnVisit>, now: string): Record<string, unknown> {
  const { id: _id, user_id: _u, created_at: _c, ...rest } = visitColumns(patch);
  void _id;
  void _u;
  void _c;
  return { ...rest, updated_at: now };
}

/**
 * Moving a visit, changing its details, or changing its status (done, put back,
 * replaced): the change to the visit, and the same change to its calendar entry.
 * If the visit has no entry (an old record), one is created.
 */
export function buildVisitUpdate(
  existing: ReturnVisit,
  patch: Partial<ReturnVisit>,
  existingEvent: ScheduledMinistryEvent | undefined,
  ids: { newEventId: string; userId: string },
  now: string
): VisitUpdate {
  const visitPayload = visitPatchPayload(patch, now);
  const merged = { ...existing, ...(visitPayload as Partial<ReturnVisit>) } as ReturnVisit;
  const fields = eventFields(merged);

  if (existingEvent) {
    return {
      visitPayload,
      merged,
      event: { kind: "update", id: existingEvent.id, payload: { ...fields, updated_at: now } },
    };
  }
  const payload = {
    id: ids.newEventId,
    user_id: ids.userId,
    return_visit_id: existing.id,
    ...fields,
  };
  return {
    visitPayload,
    merged,
    event: {
      kind: "insert",
      id: ids.newEventId,
      payload,
      row: { ...payload, is_demo: false, created_at: now, updated_at: now } as ScheduledMinistryEvent,
    },
  };
}

/**
 * Cancelling ("let go" / delete) a visit: the visit becomes cancelled, and its
 * calendar entry too, but only if the entry is still planned (a finished one
 * stays as history).
 */
export function buildCancel(
  existingEvent: ScheduledMinistryEvent | undefined,
  now: string
): { visitPayload: Record<string, unknown>; event: { id: string; payload: Record<string, unknown> } | null } {
  return {
    visitPayload: { status: "cancelled", updated_at: now },
    event:
      existingEvent && existingEvent.status === "planned"
        ? { id: existingEvent.id, payload: { status: "cancelled", updated_at: now } }
        : null,
  };
}

/** A visit with the person and conversation attached, the way every screen expects to find it. */
export function withVisitDetails(
  visit: ReturnVisit,
  people: Person[],
  conversations: { id: string }[]
): ReturnVisit {
  return {
    ...visit,
    person: visit.person ?? people.find((p) => p.id === visit.person_id) ?? null,
    conversation:
      visit.conversation ??
      ((conversations.find((c) => c.id === visit.conversation_id) as ReturnVisit["conversation"]) ??
        null),
  };
}

/** A calendar entry with the person attached. */
export function withEventPerson(event: ScheduledMinistryEvent, people: Person[]): ScheduledMinistryEvent {
  return { ...event, person: event.person ?? people.find((p) => p.id === event.person_id) ?? null };
}
