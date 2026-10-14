import type {
  BibleStudy,
  BibleStudySession,
  Conversation,
  Person,
  ReturnVisit,
} from "@/lib/types";

/** How long without any activity before a contact is suggested for archiving. */
export const IDLE_DAYS = 90;

const DAY_MS = 86_400_000;

function dayNumber(iso: string): number {
  return Math.floor(Date.parse(iso.slice(0, 10)) / DAY_MS);
}

export interface ArchiveSuggestion {
  person: Person;
  /** ISO date of the most recent thing that happened with them. */
  lastActivity: string;
  idleDays: number;
}

interface Input {
  people: Person[];
  conversations: Conversation[];
  returnVisits: ReturnVisit[];
  bibleStudies: BibleStudy[];
  studySessions: BibleStudySession[];
  today: string;
}

/**
 * The most recent date anything happened with a person: a conversation, a
 * visit (held or scheduled), a Bible study session — or when they were added.
 * Returns "9999-12-31" if they still have something coming up, because a
 * contact with an appointment ahead is plainly not idle.
 */
export function lastActivityDate(
  person: Person,
  data: Omit<Input, "people" | "today">,
  today: string
): string {
  const dates: string[] = [person.created_at.slice(0, 10)];
  if (person.first_met_date) dates.push(person.first_met_date);
  for (const c of data.conversations) {
    if (c.person_id === person.id) dates.push(c.conversation_date);
  }
  for (const rv of data.returnVisits) {
    if (rv.person_id !== person.id || rv.status === "cancelled") continue;
    if (rv.status === "planned" && rv.scheduled_date >= today) return "9999-12-31";
    dates.push(rv.scheduled_date);
    if (rv.completed_at) dates.push(rv.completed_at.slice(0, 10));
  }
  for (const s of data.bibleStudies) {
    if (s.person_id !== person.id) continue;
    if (s.status === "active" && s.next_study_date && s.next_study_date >= today) {
      return "9999-12-31";
    }
    if (s.last_study_date) dates.push(s.last_study_date);
  }
  for (const s of data.studySessions) {
    if (s.person_id === person.id) dates.push(s.session_date);
  }
  return dates.sort().at(-1)!;
}

/**
 * Contacts with no activity for `days` days, longest idle first. Only ever a
 * suggestion — nothing is archived (let alone deleted) automatically.
 */
export function suggestArchiving(
  input: Input,
  days = IDLE_DAYS
): ArchiveSuggestion[] {
  const { people, today, ...data } = input;
  const out: ArchiveSuggestion[] = [];
  for (const person of people) {
    if (person.archived_at) continue;
    const last = lastActivityDate(person, data, today);
    const idle = dayNumber(today) - dayNumber(last);
    if (idle >= days) {
      out.push({ person, lastActivity: last, idleDays: idle });
    }
  }
  return out.sort((a, b) => b.idleDays - a.idleDays);
}
