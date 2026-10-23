/**
 * Ministry days: the days of the week a publisher usually visits or meets a
 * person. This only organises People. It never creates a visit, study,
 * calendar event or notification; appointments and reminders are scheduled
 * separately.
 */

export const MINISTRY_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type MinistryDay = (typeof MINISTRY_DAYS)[number];

export const DAY_LABELS: Record<MinistryDay, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export const DAY_SHORT: Record<MinistryDay, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

/** The People filter: everyone, one day, or people with no day yet. */
export type DayFilter = "all" | "none" | MinistryDay;

type HasDays = { ministry_days?: readonly string[] | null };

const isDay = (d: string): d is MinistryDay =>
  (MINISTRY_DAYS as readonly string[]).includes(d);

/** A person's days: valid, no repeats, in week order. Missing means none. */
export function daysOf(person: HasDays): MinistryDay[] {
  const have = new Set(person.ministry_days ?? []);
  return MINISTRY_DAYS.filter((d) => have.has(d) && isDay(d));
}

/** Adds the day if it is not there, removes it if it is. Stays in week order. */
export function toggleDay(days: readonly MinistryDay[], day: MinistryDay): MinistryDay[] {
  const next = new Set(days);
  if (next.has(day)) next.delete(day);
  else next.add(day);
  return MINISTRY_DAYS.filter((d) => next.has(d));
}

export function sameDays(a: readonly string[], b: readonly string[]): boolean {
  const x = daysOf({ ministry_days: a });
  const y = daysOf({ ministry_days: b });
  return x.length === y.length && x.every((d, i) => d === y[i]);
}

/** "Wed · Sat" */
export function describeDays(days: readonly MinistryDay[]): string {
  return days.map((d) => DAY_SHORT[d]).join(" · ");
}

/** The weekday of a date as a ministry day. */
export function dayOfDate(date: Date): MinistryDay {
  // getDay(): 0 is Sunday.
  return MINISTRY_DAYS[(date.getDay() + 6) % 7];
}

/** How many people are on each day. A person on two days counts on both. */
export function countByDay(people: HasDays[]): Record<MinistryDay, number> {
  const counts = Object.fromEntries(MINISTRY_DAYS.map((d) => [d, 0])) as Record<
    MinistryDay,
    number
  >;
  for (const p of people) for (const d of daysOf(p)) counts[d]++;
  return counts;
}

export function matchesDay(person: HasDays, filter: DayFilter): boolean {
  if (filter === "all") return true;
  const days = daysOf(person);
  return filter === "none" ? days.length === 0 : days.includes(filter);
}
