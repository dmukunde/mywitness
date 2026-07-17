import { describe, expect, it } from "vitest";
import { parseISO } from "date-fns";
import {
  resolveRelativeDatePhrase,
  findAndResolveReturnVisit,
} from "../relative-dates";
import {
  enrichExtraction,
  extractQuestions,
  extractScriptures,
  normalizeAndParseExtraction,
} from "../extract-pipeline";

const REF = "2026-07-17"; // Friday
const CTX = {
  localDate: REF,
  localDay: "Friday",
  timezone: "Africa/Kampala",
};

describe("relative date resolution", () => {
  it("resolves next Friday from Friday 2026-07-17 → 2026-07-24", () => {
    const r = resolveRelativeDatePhrase("next Friday", REF);
    expect(r.date).toBe("2026-07-24");
    expect(r.originalPhrase).toBe("next Friday");
  });

  it("resolves tomorrow afternoon", () => {
    const r = resolveRelativeDatePhrase("tomorrow afternoon", REF);
    expect(r.date).toBe("2026-07-18");
    expect(r.timePeriod).toBe("Afternoon");
    expect(r.originalPhrase).toBe("tomorrow afternoon");
  });

  it("resolves next Tuesday morning", () => {
    const r = resolveRelativeDatePhrase("next Tuesday morning", REF);
    expect(r.date).toBe("2026-07-21");
    expect(r.timePeriod).toBe("Morning");
  });

  it("resolves in two weeks", () => {
    const r = resolveRelativeDatePhrase("in two weeks", REF);
    expect(r.date).toBe("2026-07-31");
  });

  it("finds return phrase in transcript", () => {
    const r = findAndResolveReturnVisit(
      "We promised to return next Friday to discuss hope.",
      parseISO(REF)
    );
    expect(r.date).toBe("2026-07-24");
    expect(r.originalPhrase?.toLowerCase()).toContain("next friday");
  });
});

describe("scripture and question extraction", () => {
  it("extracts multiple scriptures", () => {
    const refs = extractScriptures(
      "We read James 1:13 and also Revelation 21:3, 4 together."
    );
    expect(refs).toContain("James 1:13");
    expect(refs.some((r) => r.startsWith("Revelation 21"))).toBe(true);
  });

  it("extracts a question embedded in a longer sentence", () => {
    const qs = extractQuestions(
      "She asked who is responsible for suffering during our discussion."
    );
    expect(qs.length).toBeGreaterThan(0);
    expect(qs[0].toLowerCase()).toContain("who is responsible for suffering");
  });
});

describe("Justine example pipeline", () => {
  const transcript =
    "We met Justine in Kira and she was interested in studying. We discussed whether Jehovah causes suffering and read James 1:13. She asked who is responsible for suffering. We left her a brochure and promised to return next Friday to discuss who is responsible for suffering and why suffering will end.";

  it("fills structured fields from empty AI output via enrich", () => {
    const empty = normalizeAndParseExtraction({});
    const result = enrichExtraction(empty, transcript, CTX);

    expect(result.person_name).toBe("Justine");
    expect(result.general_location).toBe("Kira");
    expect(result.main_discussion_topic.toLowerCase()).toContain(
      "whether jehovah causes suffering"
    );
    expect(result.scriptures_discussed).toEqual(["James 1:13"]);
    expect(result.questions_raised[0].toLowerCase()).toContain(
      "who is responsible for suffering"
    );
    expect(result.proposed_return_visit_date).toBe("2026-07-24");
    expect(result.proposed_return_visit_date_phrase?.toLowerCase()).toContain(
      "next friday"
    );
    expect(result.next_planned_topic.toLowerCase()).toContain(
      "who is responsible for suffering"
    );
    expect(result.next_planned_topic.toLowerCase()).toContain(
      "why suffering will end"
    );
    expect(result.materials_shared).toEqual(["Brochure"]);
    expect(result.summary.length).toBeGreaterThan(20);
    expect(result.summary).toContain("Justine");
    expect(result.summary).toContain("Kira");
  });

  it("normalizes alternate AI keys", () => {
    const parsed = normalizeAndParseExtraction({
      main_topic: "Suffering",
      scriptures: ["James 1:13"],
      questions_asked: "Who is responsible?",
      return_date: "2026-07-24",
      next_topic: "Hope",
      publications_shared: "Brochure",
    });
    expect(parsed.main_discussion_topic).toBe("Suffering");
    expect(parsed.scriptures_discussed).toEqual(["James 1:13"]);
    expect(parsed.questions_raised).toEqual(["Who is responsible?"]);
    expect(parsed.proposed_return_visit_date).toBe("2026-07-24");
    expect(parsed.next_planned_topic).toBe("Hope");
    expect(parsed.materials_shared).toEqual(["Brochure"]);
  });
});
