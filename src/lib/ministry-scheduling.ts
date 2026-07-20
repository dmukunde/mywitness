import type {
  MinistryEventType,
  ScheduledMinistryEvent,
} from "@/lib/types";

/** Same person + type + date + time (empty time treated as equal). */
export function findDuplicateMinistryEvent(
  events: ScheduledMinistryEvent[],
  candidate: {
    person_id: string;
    event_type: MinistryEventType;
    scheduled_date: string;
    scheduled_time?: string | null;
  },
  excludeId?: string
): ScheduledMinistryEvent | undefined {
  const time = (candidate.scheduled_time || "").trim().toLowerCase();
  return events.find((e) => {
    if (excludeId && e.id === excludeId) return false;
    if (e.status === "cancelled") return false;
    if (e.person_id !== candidate.person_id) return false;
    if (e.event_type !== candidate.event_type) return false;
    if (e.scheduled_date !== candidate.scheduled_date) return false;
    return (e.scheduled_time || "").trim().toLowerCase() === time;
  });
}
