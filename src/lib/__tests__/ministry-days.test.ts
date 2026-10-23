import { describe, expect, it } from "vitest";
import {
  countByDay,
  dayOfDate,
  daysOf,
  describeDays,
  matchesDay,
  sameDays,
  toggleDay,
} from "@/lib/ministry-days";

describe("daysOf", () => {
  it("is empty for a person with no days, or on a database without the column", () => {
    expect(daysOf({})).toEqual([]);
    expect(daysOf({ ministry_days: null })).toEqual([]);
    expect(daysOf({ ministry_days: [] })).toEqual([]);
  });

  it("returns valid days once each, in week order", () => {
    expect(daysOf({ ministry_days: ["sat", "wed", "sat", "funday"] })).toEqual(["wed", "sat"]);
  });
});

describe("toggleDay", () => {
  it("adds and removes days, keeping week order", () => {
    expect(toggleDay([], "sat")).toEqual(["sat"]);
    expect(toggleDay(["sat"], "wed")).toEqual(["wed", "sat"]);
    expect(toggleDay(["wed", "sat"], "wed")).toEqual(["sat"]);
  });
});

describe("sameDays / describeDays", () => {
  it("compares as sets, ignoring order and junk", () => {
    expect(sameDays(["sat", "wed"], ["wed", "sat"])).toBe(true);
    expect(sameDays([], ["wed"])).toBe(false);
  });
  it("describes days briefly", () => {
    expect(describeDays(["wed", "sat"])).toBe("Wed · Sat");
  });
});

describe("filtering by day", () => {
  const mary = { ministry_days: ["wed", "sat"] };
  const joan = { ministry_days: ["fri"] };
  const nobody = { ministry_days: [] as string[] };
  const old = {}; // an existing contact, never assigned

  it("shows a person under each of their days, without duplicating them", () => {
    const people = [mary, joan, nobody, old];
    expect(people.filter((p) => matchesDay(p, "wed"))).toEqual([mary]);
    expect(people.filter((p) => matchesDay(p, "sat"))).toEqual([mary]);
    expect(people.filter((p) => matchesDay(p, "fri"))).toEqual([joan]);
  });

  it("'all' keeps everyone and 'none' finds people with no day yet", () => {
    const people = [mary, joan, nobody, old];
    expect(people.filter((p) => matchesDay(p, "all"))).toHaveLength(4);
    expect(people.filter((p) => matchesDay(p, "none"))).toEqual([nobody, old]);
  });

  it("counts a person on every one of their days", () => {
    const counts = countByDay([mary, joan, old]);
    expect(counts.wed).toBe(1);
    expect(counts.sat).toBe(1);
    expect(counts.fri).toBe(1);
    expect(counts.mon).toBe(0);
  });
});

describe("dayOfDate", () => {
  it("maps dates to ministry days (week starts Monday)", () => {
    expect(dayOfDate(new Date(2026, 9, 24))).toBe("sat"); // Sat 24 Oct 2026
    expect(dayOfDate(new Date(2026, 9, 25))).toBe("sun");
    expect(dayOfDate(new Date(2026, 9, 26))).toBe("mon");
  });
});
