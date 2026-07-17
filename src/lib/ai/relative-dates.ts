import {
  addDays,
  addWeeks,
  format,
  nextDay,
  parseISO,
  type Day,
} from "date-fns";

export type ResolvedRelativeDate = {
  date: string | null;
  timePeriod: string;
  originalPhrase: string | null;
};

const WEEKDAY: Record<string, Day> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const TIME_PERIOD =
  /\b(morning|afternoon|evening|night)\b/i;

/**
 * Resolve a relative date/time phrase against a local calendar reference date.
 * "next Friday" on a Friday always means the following week's Friday (+7).
 */
export function resolveRelativeDatePhrase(
  phrase: string,
  referenceDate: Date | string
): ResolvedRelativeDate {
  const ref =
    typeof referenceDate === "string" ? parseISO(referenceDate) : referenceDate;
  const text = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) {
    return { date: null, timePeriod: "", originalPhrase: null };
  }

  const timeMatch = text.match(TIME_PERIOD);
  const timePeriod = timeMatch
    ? capitalize(timeMatch[1].toLowerCase())
    : "";

  // in N weeks / in two weeks
  const weeksMatch = text.match(
    /\bin\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+weeks?\b/
  );
  if (weeksMatch) {
    const n = parseNumberWord(weeksMatch[1]);
    return {
      date: format(addWeeks(ref, n), "yyyy-MM-dd"),
      timePeriod,
      originalPhrase: phrase.trim(),
    };
  }

  // in N days
  const daysMatch = text.match(
    /\bin\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+days?\b/
  );
  if (daysMatch) {
    const n = parseNumberWord(daysMatch[1]);
    return {
      date: format(addDays(ref, n), "yyyy-MM-dd"),
      timePeriod,
      originalPhrase: phrase.trim(),
    };
  }

  if (/\btomorrow\b/.test(text)) {
    return {
      date: format(addDays(ref, 1), "yyyy-MM-dd"),
      timePeriod,
      originalPhrase: phrase.trim(),
    };
  }

  if (/\btoday\b/.test(text)) {
    return {
      date: format(ref, "yyyy-MM-dd"),
      timePeriod,
      originalPhrase: phrase.trim(),
    };
  }

  // next <weekday> [time]
  const nextWeekday = text.match(
    /\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/
  );
  if (nextWeekday) {
    const target = WEEKDAY[nextWeekday[1]];
    return {
      date: format(nextWeekdayFrom(ref, target), "yyyy-MM-dd"),
      timePeriod,
      originalPhrase: phrase.trim(),
    };
  }

  // this <weekday>
  const thisWeekday = text.match(
    /\bthis\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/
  );
  if (thisWeekday) {
    const target = WEEKDAY[thisWeekday[1]];
    const days = (target - ref.getDay() + 7) % 7;
    return {
      date: format(addDays(ref, days === 0 ? 0 : days), "yyyy-MM-dd"),
      timePeriod,
      originalPhrase: phrase.trim(),
    };
  }

  // bare weekday with "return" context handled by caller; still resolve weekday
  const bareWeekday = text.match(
    /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+(morning|afternoon|evening|night))?$/
  );
  if (bareWeekday) {
    const target = WEEKDAY[bareWeekday[1]];
    return {
      date: format(nextWeekdayFrom(ref, target), "yyyy-MM-dd"),
      timePeriod: bareWeekday[2]
        ? capitalize(bareWeekday[2])
        : timePeriod,
      originalPhrase: phrase.trim(),
    };
  }

  return {
    date: null,
    timePeriod,
    originalPhrase: phrase.trim() || null,
  };
}

/**
 * Scan transcript for common relative return-visit phrases and resolve them.
 */
export function findAndResolveReturnVisit(
  transcript: string,
  referenceDate: Date | string
): ResolvedRelativeDate {
  const patterns: RegExp[] = [
    /\b(?:return|come\s+back|visit(?:\s+again)?|follow[\s-]?up)\s+(?:on\s+)?(next\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+(?:morning|afternoon|evening|night))?)/i,
    /\bpromised\s+to\s+return\s+(next\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+(?:morning|afternoon|evening|night))?)/i,
    /\b(?:return|come\s+back|visit)\s+(tomorrow(?:\s+(?:morning|afternoon|evening|night))?)/i,
    /\b(?:return|come\s+back|visit)\s+(in\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+weeks?(?:\s+(?:morning|afternoon|evening|night))?)/i,
    /\b(?:return|come\s+back|visit)\s+(in\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+days?(?:\s+(?:morning|afternoon|evening|night))?)/i,
    /\b(next\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(?:morning|afternoon|evening|night))\b/i,
    /\b(next\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday))\b/i,
    /\b(tomorrow\s+(?:morning|afternoon|evening|night))\b/i,
    /\b(tomorrow)\b/i,
    /\b(in\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+weeks?)\b/i,
  ];

  for (const re of patterns) {
    const m = transcript.match(re);
    if (m?.[1]) {
      return resolveRelativeDatePhrase(m[1], referenceDate);
    }
  }

  return { date: null, timePeriod: "", originalPhrase: null };
}

/** Next occurrence of weekday; if today is that weekday, jump +7 days. */
export function nextWeekdayFrom(from: Date, target: Day): Date {
  const day = from.getDay() as Day;
  if (day === target) {
    return addDays(from, 7);
  }
  // date-fns nextDay returns the next occurrence strictly after `from`
  return nextDay(from, target);
}

function parseNumberWord(value: string): number {
  const map: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  const lower = value.toLowerCase();
  if (map[lower] != null) return map[lower];
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
