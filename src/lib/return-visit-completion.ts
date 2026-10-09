import type {
  Conversation,
  ConversationFormData,
  Person,
  ReturnVisit,
} from "@/lib/types";
import { EMPTY_CONVERSATION_FORM } from "@/lib/types";

/** What the user fills in when they complete a visit. Everything is optional. */
export interface CompletionInput {
  /** Date the visit actually happened (defaults to today). */
  visitDate: string;
  /** Topic discussed — pre-filled from the topic that was planned. */
  topic: string;
  /** Notes: what was discussed, how they responded, anything to remember. */
  notes: string;
  /** Next visit (all optional; a date is what actually schedules it). */
  nextTopic: string;
  nextDate: string;
  nextTime: string;
  nextPrep: string;
}

/** A history entry is only worth writing when there is something to record. */
export function hasVisitRecord(input: CompletionInput): boolean {
  return Boolean(input.topic.trim() || input.notes.trim());
}

/** Next visit must not land before the visit being recorded. */
export function nextVisitDateProblem(input: CompletionInput): string | null {
  if (input.nextDate && input.nextDate < input.visitDate) {
    return "The next visit can't be before this visit.";
  }
  return null;
}

/**
 * The conversation entry for a completed visit, built for the existing
 * saveConversation. It carries the person's own name and location so
 * recording it can't rename or blank the person, and it asks for a next
 * visit only when a date was chosen.
 */
export function buildCompletionForm(
  person: Pick<Person, "id" | "name" | "general_location">,
  input: CompletionInput,
  clientId: string
): ConversationFormData {
  return {
    ...EMPTY_CONVERSATION_FORM,
    person_id: person.id,
    person_name: person.name,
    general_location: person.general_location ?? "",
    conversation_date: input.visitDate,
    main_topic: input.topic.trim(),
    summary: input.notes.trim(),
    next_topic: input.nextTopic.trim(),
    promised_follow_up_date: input.nextDate,
    promised_follow_up_time: input.nextTime,
    next_visit_preparation: input.nextPrep.trim(),
    schedule_return_visit: Boolean(input.nextDate),
    source: "manual",
    client_id: clientId,
  };
}

/**
 * The notes recorded AT a completed visit, if any.
 *
 * A visit's `conversation_id` normally points at the earlier conversation it
 * follows up on. Completing a visit with notes re-points it at the new entry.
 * Only a conversation saved after the visit was scheduled can be the visit's
 * own notes — an earlier one is just the conversation it followed up, so old
 * visits never show someone else's notes as theirs.
 */
export function visitNotesFor(
  visit: Pick<ReturnVisit, "status" | "conversation_id" | "created_at">,
  conversations: Conversation[]
): Conversation | null {
  if (visit.status !== "completed" || !visit.conversation_id) return null;
  const c = conversations.find((x) => x.id === visit.conversation_id);
  if (!c) return null;
  return Date.parse(c.created_at) >= Date.parse(visit.created_at) ? c : null;
}
