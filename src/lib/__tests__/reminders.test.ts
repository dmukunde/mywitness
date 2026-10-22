import { describe, expect, it } from "vitest";
import {
  buildIcs,
  completionPatch,
  defaultWhen,
  describeWhen,
  googleCalendarUrl,
  isOpen,
  nextOccurrence,
  reminderPushPayload,
  reminderState,
  snoozeChoices,
  sortOpen,
  whenChoices,
  type PersonalReminder,
} from "@/lib/reminders";

// Wednesday 14 Oct 2026, 10:00 local time.
const NOW = new Date(2026, 9, 14, 10, 0, 0);

function reminder(o: Partial<PersonalReminder> = {}): PersonalReminder {
  return {
    id: "r1",
    user_id: "u",
    person_id: "p1",
    text: "Remind Mary about Sunday's meeting",
    due_at: new Date(2026, 9, 17, 19, 0, 0).toISOString(),
    repeat: "none",
    notified_at: null,
    done_at: null,
    dismissed_at: null,
    last_done_at: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...o,
  };
}

const hm = (d: Date) => `${d.getDay()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;

describe("open and overdue", () => {
  it("treats done and dismissed reminders as closed", () => {
    expect(isOpen(reminder())).toBe(true);
    expect(isOpen(reminder({ done_at: NOW.toISOString() }))).toBe(false);
    expect(isOpen(reminder({ dismissed_at: NOW.toISOString() }))).toBe(false);
  });

  it("is overdue once its time has come, until dealt with", () => {
    expect(reminderState(reminder(), NOW)).toBe("upcoming");
    expect(reminderState(reminder({ due_at: new Date(2026, 9, 14, 9, 0).toISOString() }), NOW)).toBe("overdue");
    expect(reminderState(reminder({ due_at: NOW.toISOString() }), NOW)).toBe("overdue");
  });

  it("lists open reminders soonest first", () => {
    const sorted = sortOpen([
      reminder({ id: "late", due_at: new Date(2026, 9, 20, 9).toISOString() }),
      reminder({ id: "done", done_at: NOW.toISOString() }),
      reminder({ id: "soon", due_at: new Date(2026, 9, 15, 9).toISOString() }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["soon", "late"]);
  });
});

describe("choosing when", () => {
  it("offers sensible quick times, all in the future", () => {
    const choices = whenChoices(NOW);
    expect(choices.map((c) => c.id)).toEqual(["hour", "tonight", "tomorrow", "saturday"]);
    expect(choices.every((c) => c.at.getTime() > NOW.getTime())).toBe(true);
    expect(hm(choices[1].at)).toBe("3 19:00"); // tonight 7 PM
    expect(hm(choices[2].at)).toBe("4 9:00"); // tomorrow 9 AM
    expect(hm(choices[3].at)).toBe("6 19:00"); // Saturday 7 PM
  });

  it("drops 'tonight' once 7 PM has passed, and defaults to tomorrow morning", () => {
    const late = new Date(2026, 9, 14, 20, 30);
    expect(whenChoices(late).map((c) => c.id)).not.toContain("tonight");
    expect(defaultWhen(late).id).toBe("tomorrow");
  });

  it("defaults to this evening earlier in the day", () => {
    expect(defaultWhen(NOW).id).toBe("tonight");
  });

  it("does not list two choices for the same moment", () => {
    // Friday 20:00: 'tomorrow 9 AM' and 'Saturday 7 PM' are different, but an
    // hour from 18:00 equals 19:00 'tonight'.
    const six = new Date(2026, 9, 14, 18, 0);
    const ids = whenChoices(six).map((c) => c.id);
    expect(ids).toContain("tonight");
    expect(ids).not.toContain("hour");
  });

  it("offers snooze times that are still ahead", () => {
    const ids = snoozeChoices(new Date(2026, 9, 14, 20, 0)).map((c) => c.id);
    expect(ids).toEqual(["10min", "1hour", "tomorrow"]);
  });
});

describe("repeating reminders", () => {
  it("finds the next weekly and monthly occurrence after now", () => {
    const due = new Date(2026, 9, 3, 19, 0); // Sat 3 Oct 7 PM
    expect(nextOccurrence(due, "weekly", NOW)!.toDateString()).toBe(new Date(2026, 9, 17).toDateString());
    expect(nextOccurrence(due, "monthly", NOW)!.toDateString()).toBe(new Date(2026, 10, 3).toDateString());
    expect(nextOccurrence(due, "none", NOW)).toBeNull();
  });

  it("does not drift on short months", () => {
    const jan31 = new Date(2026, 0, 31, 9, 0);
    const next = nextOccurrence(jan31, "monthly", new Date(2026, 0, 31, 12, 0))!;
    expect(next.getMonth()).toBe(1); // February
    const after = nextOccurrence(jan31, "monthly", new Date(2026, 1, 28, 12, 0))!;
    expect(after.getMonth()).toBe(2); // March
    expect(after.getDate()).toBe(31);
  });

  it("moves a full period ahead even when finished early, before it was due", () => {
    const due = new Date(2026, 9, 17, 19, 0); // Sat, three days ahead of NOW
    expect(nextOccurrence(due, "weekly", NOW)!.getTime()).toBe(new Date(2026, 9, 24, 19, 0).getTime());
    expect(nextOccurrence(due, "monthly", NOW)!.getTime()).toBe(new Date(2026, 10, 17, 19, 0).getTime());
    const patch = completionPatch(reminder({ repeat: "weekly", due_at: due.toISOString() }), NOW);
    expect(new Date(patch.due_at!).getTime()).toBe(new Date(2026, 9, 24, 19, 0).getTime());
  });

  it("finishes a one-off but keeps a repeating one open, moved on", () => {
    const once = completionPatch(reminder(), NOW);
    expect(once.done_at).toBeTruthy();
    expect(once.due_at).toBeUndefined();

    const weekly = completionPatch(
      reminder({ repeat: "weekly", due_at: new Date(2026, 9, 10, 19).toISOString() }),
      NOW
    );
    expect(weekly.done_at).toBeUndefined();
    expect(weekly.last_done_at).toBeTruthy();
    expect(new Date(weekly.due_at!).getTime()).toBeGreaterThan(NOW.getTime());
  });
});

describe("notification text", () => {
  it("says what the reminder says, tagged so repeats collapse into one", () => {
    const p = reminderPushPayload(reminder());
    expect(p.body).toBe("Remind Mary about Sunday's meeting");
    expect(p.tag).toBe("reminder-r1");
    expect(p.url).toContain("r1");
  });

  it("shows nothing identifying in private mode", () => {
    const p = reminderPushPayload(reminder(), { privateMode: true });
    expect(p.body).toBe("You have a reminder.");
    expect(JSON.stringify(p)).not.toMatch(/Mary/);
  });
});

describe("calendar fallback", () => {
  it("builds a calendar entry with an alarm at the right moment", () => {
    const r = reminder({ due_at: "2026-10-17T16:00:00.000Z" });
    const ics = buildIcs(r, { contactName: "Mary", now: new Date("2026-10-14T08:00:00Z") });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("UID:r1@mywitness");
    expect(ics).toContain("DTSTART:20261017T160000Z");
    expect(ics).toContain("DTEND:20261017T161500Z");
    expect(ics).toContain("SUMMARY:Remind Mary about Sunday's meeting");
    expect(ics).toContain("TRIGGER:PT0M");
    expect(ics).not.toContain("RRULE");
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("escapes characters calendar files treat specially and adds repeats", () => {
    const ics = buildIcs(reminder({ text: "Call; ask, then\nshare", repeat: "weekly" }));
    expect(ics).toContain("SUMMARY:Call\\; ask\\, then\\nshare");
    expect(ics).toContain("RRULE:FREQ=WEEKLY");
  });

  it("links to Google Calendar with the same time", () => {
    const url = googleCalendarUrl(reminder({ due_at: "2026-10-17T16:00:00.000Z", repeat: "monthly" }), {
      contactName: "Mary",
    });
    expect(url).toContain("calendar.google.com/calendar/render");
    expect(url).toContain("dates=20261017T160000Z%2F20261017T161500Z");
    expect(url).toContain("recur=RRULE%3AFREQ%3DMONTHLY");
  });
});

describe("describeWhen", () => {
  it("reads naturally for today, tomorrow and later", () => {
    const today = new Date();
    today.setHours(19, 0, 0, 0);
    expect(describeWhen(today)).toBe("Today · 7:00 PM");
    const tomorrow = new Date(today.getTime() + 86_400_000);
    tomorrow.setHours(9, 5, 0, 0);
    expect(describeWhen(tomorrow)).toBe("Tomorrow · 9:05 AM");
    expect(describeWhen(new Date(2030, 0, 5, 7, 30))).toBe("Sat, Jan 5 · 7:30 AM");
  });
});
