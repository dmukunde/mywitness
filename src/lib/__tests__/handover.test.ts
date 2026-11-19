import { describe, expect, it } from "vitest";
import type { BibleStudy, Person } from "@/lib/types";
import {
  buildHandover,
  handoverMessage,
  handoverToStudyForm,
  replyMessage,
  replyToSessionForm,
  decodeHandover,
  decodeReply,
  encodeHandover,
  handoverHasEnded,
  handoverLink,
  replyLink,
  tokenFromHash,
  type Handover,
  type Reply,
} from "@/lib/handover";

const STUDY_ID = "11111111-2222-4333-8444-555555555555";

const handover = (o: Partial<Handover> = {}): Handover => ({
  v: 1,
  kind: "handover",
  studyId: STUDY_ID,
  from: "Doreen",
  to: "Ruth",
  start: "2026-11-25",
  end: "2026-12-20",
  person: { name: "Mary Nakato", phone: "0772 123456", place: "Near the pharmacy, Kiwatule" },
  study: {
    publication: "Enjoy Life Forever!",
    lessonNumber: 13,
    lesson: "Lesson 13 — Who is God?",
    totalLessons: 60,
    frequency: "weekly",
    preferredDay: "Saturday",
    preferredTime: "Afternoon",
    nextDate: "2026-11-28",
    nextTime: "3:00 PM",
    lastDate: "2026-11-21",
    status: "active",
    prep: "Bring the tablet",
  },
  ...o,
});

const reply = (o: Partial<Reply> = {}): Reply => ({
  v: 1,
  kind: "reply",
  studyId: STUDY_ID,
  person: "Mary Nakato",
  by: "Ruth",
  lessonNumber: 16,
  lesson: "Lesson 16",
  status: "active",
  nextDate: "2026-12-22",
  nextTime: "Morning",
  note: "She asked about the resurrection.",
  at: "2026-12-19",
  ...o,
});

describe("a handover in a link", () => {
  it("comes back exactly as it was sent, including names with accents and emoji", () => {
    const sent = handover({ from: "Zoë 🌿", person: { name: "Nakato Évelyne", phone: null, place: "Ntinda — Plot 5" } });
    const back = decodeHandover(encodeHandover(sent));
    expect(back).toEqual({ ok: true, value: sent });
  });

  it("makes a link whose details sit after the # (so they never reach a server)", () => {
    const link = handoverLink("https://mywitness.vercel.app", handover());
    expect(link.startsWith("https://mywitness.vercel.app/handover#")).toBe(true);
    const token = tokenFromHash(new URL(link).hash);
    expect(decodeHandover(token).ok).toBe(true);
    expect(new URL(link).search).toBe("");
    expect(new URL(link).pathname).toBe("/handover");
  });

  it("keeps a typical handover short enough to share", () => {
    expect(handoverLink("https://mywitness.vercel.app", handover()).length).toBeLessThan(1500);
  });

  it("knows when the handover has ended, without ever switching the link off", () => {
    expect(handoverHasEnded({ end: "2026-12-20" }, "2026-12-20")).toBe(false);
    expect(handoverHasEnded({ end: "2026-12-20" }, "2026-12-21")).toBe(true);
    expect(decodeHandover(encodeHandover(handover())).ok).toBe(true);
  });
});

describe("a quick update in a link", () => {
  it("comes back exactly as it was sent", () => {
    expect(decodeReply(encodeHandover(reply()))).toEqual({ ok: true, value: reply() });
  });

  it("links to the update screen", () => {
    expect(replyLink("https://x.test", reply()).startsWith("https://x.test/handover/reply#")).toBe(true);
  });

  it("accepts paused and finished, with no next date or note", () => {
    const r = decodeReply(encodeHandover(reply({ status: "paused", nextDate: null, nextTime: null, note: null, lesson: null })));
    expect(r).toMatchObject({ ok: true, value: { status: "paused", nextDate: null, note: null } });
    expect(decodeReply(encodeHandover(reply({ status: "completed" })))).toMatchObject({ ok: true });
  });

  it("is not a handover, and a handover is not an update", () => {
    expect(decodeHandover(encodeHandover(reply())).ok).toBe(false);
    expect(decodeReply(encodeHandover(handover())).ok).toBe(false);
  });
});

describe("a link that cannot be trusted", () => {
  const bad = (payload: unknown) => decodeHandover(encodeHandover(payload as Handover));
  const wrongKind = (payload: unknown) => decodeReply(encodeHandover(payload as Reply));

  it("is refused when it is not a link we made", () => {
    for (const t of ["", "!!!", "abc", "e30", "bnVsbA", "W10", "a".repeat(7000)]) {
      expect(decodeHandover(t).ok).toBe(false);
      expect(decodeReply(t).ok).toBe(false);
    }
  });

  it("is refused when required details are missing or wrong", () => {
    expect(bad({ ...handover(), studyId: "nope" }).ok).toBe(false);
    expect(bad({ ...handover(), from: "" }).ok).toBe(false);
    expect(bad({ ...handover(), start: "2026-13-40" }).ok).toBe(false);
    expect(bad({ ...handover(), end: "2026-11-01" }).ok).toBe(false); // ends before it starts
    expect(bad({ ...handover(), person: { name: "", phone: null, place: null } }).ok).toBe(false);
    expect(bad({ ...handover(), v: 2 }).ok).toBe(false);
    const noStudy = { ...handover(), study: undefined };
    expect(bad(noStudy).ok).toBe(false);
    expect(bad({ ...handover(), study: { ...handover().study, status: "hacked" } }).ok).toBe(false);
    expect(bad({ ...handover(), study: { ...handover().study, lessonNumber: 0 } }).ok).toBe(false);
    expect(bad({ ...handover(), study: { ...handover().study, lessonNumber: 1.5 } }).ok).toBe(false);
    expect(wrongKind({ ...reply(), status: "gone" }).ok).toBe(false);
    expect(wrongKind({ ...reply(), lessonNumber: "16" }).ok).toBe(false);
    expect(wrongKind({ ...reply(), at: "yesterday" }).ok).toBe(false);
  });

  it("drops optional details that are the wrong type instead of trusting them", () => {
    const r = bad({ ...handover(), to: 42, person: { name: "Mary", phone: { a: 1 }, place: ["x"] }, study: { ...handover().study, nextDate: "soon", prep: 7 } });
    expect(r).toMatchObject({ ok: true, value: { to: null, person: { phone: null, place: null }, study: { nextDate: null, prep: null } } });
  });

  it("cuts over-long text and strips control characters", () => {
    const r = bad({ ...handover(), person: { name: "Ma\u0000ry\u0007", phone: null, place: "x".repeat(300) } });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.value.person.name).toBe("Mary");
      expect(r.value.person.place).toHaveLength(200);
    }
    const note = wrongKind({ ...reply(), note: "n".repeat(700) });
    expect(note.ok && note.value.note).toHaveLength(600);
    // A link far longer than anything we would make is refused outright.
    expect(wrongKind({ ...reply(), note: "n".repeat(7000) }).ok).toBe(false);
  });

  it("keeps markup as plain text (it is only ever shown as text) and ignores extra fields", () => {
    const r = bad({ ...handover(), from: "<img src=x onerror=alert(1)>", evil: "x", study: { ...handover().study, __proto__: { polluted: true } } });
    expect(r).toMatchObject({ ok: true, value: { from: "<img src=x onerror=alert(1)>" } });
    if (r.ok) {
      expect(r.value).not.toHaveProperty("evil");
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    }
  });
});

const study = (o: Partial<BibleStudy> = {}): BibleStudy =>
  ({
    id: STUDY_ID,
    user_id: "u1",
    person_id: "p1",
    publication: "Enjoy Life Forever!",
    starting_lesson: "Lesson 1",
    current_lesson: "Lesson 13 — Who is God?",
    current_lesson_number: 13,
    total_lessons: 60,
    study_frequency: "weekly",
    preferred_day: "Saturday",
    preferred_time: "Afternoon",
    first_study_date: "2026-08-01",
    next_study_date: "2026-11-28",
    next_study_time: "3:00 PM",
    last_study_date: "2026-11-21",
    general_location: "Near the pharmacy",
    status: "active",
    preparation_notes: "Bring the tablet",
    private_notes: "SECRET: she is nervous about her family",
    source_return_visit_id: null,
    archived_at: null,
    is_demo: false,
    created_at: "x",
    updated_at: "x",
    ...o,
  }) as BibleStudy;

const person = (o: Partial<Person> = {}): Person =>
  ({
    id: "p1",
    name: "Mary Nakato",
    phone_number: "0772 123456",
    general_location: "Kiwatule gate",
    area: { name: "Kiwatule" },
    ...o,
  }) as Person;

const choices = (include = { phone: true, place: true, prep: true }) => ({
  to: "Ruth",
  start: "2026-11-25",
  end: "2026-12-20",
  include,
});

describe("building a handover from a study", () => {
  it("never contains the private notes, whatever is chosen", () => {
    const h = buildHandover(study(), person(), "Doreen", choices());
    expect(JSON.stringify(h)).not.toContain("SECRET");
    expect(JSON.stringify(h)).not.toContain("nervous");
  });

  it("leaves out the phone, place and prep notes when they are switched off", () => {
    const h = buildHandover(study(), person(), "Doreen", choices({ phone: false, place: false, prep: false }));
    expect(h.person).toEqual({ name: "Mary Nakato", phone: null, place: null });
    expect(h.study.prep).toBeNull();
  });

  it("includes them when they are on, and round-trips through a link", () => {
    const h = buildHandover(study(), person(), "Doreen", choices());
    expect(h.person.phone).toBe("0772 123456");
    expect(h.person.place).toBe("Near the pharmacy, Kiwatule");
    expect(h.study.prep).toBe("Bring the tablet");
    expect(decodeHandover(encodeHandover(h))).toEqual({ ok: true, value: h });
  });

  it("copes with a study that has little filled in", () => {
    const sparse = study({ current_lesson: null, next_study_date: null, next_study_time: null, preferred_day: null, preparation_notes: null, general_location: null, last_study_date: null });
    const h = buildHandover(sparse, person({ phone_number: null, general_location: null, area: null }), "", choices());
    expect(h.from).toBe("A friend");
    expect(decodeHandover(encodeHandover(h)).ok).toBe(true);
  });
});

describe("the study the person covering gets in their own app", () => {
  it("carries the lesson, the schedule and a note about who they are covering for", () => {
    const h = buildHandover(study(), person(), "Doreen", choices());
    const form = handoverToStudyForm(h, "mine-1");
    expect(form).toMatchObject({
      person_id: "mine-1",
      publication: "Enjoy Life Forever!",
      current_lesson_number: 13,
      next_study_date: "2026-11-28",
      status: "active",
      general_location: "Near the pharmacy, Kiwatule",
      private_notes: "",
    });
    expect(form.preparation_notes).toBe("Covering for Doreen until Dec 20. Bring the tablet");
  });
});

describe("bringing an update back into the study", () => {
  it("moves the study to the lesson they reached and records who covered it", () => {
    const form = replyToSessionForm(reply({ lesson: null }), study());
    expect(form).toMatchObject({
      bible_study_id: STUDY_ID,
      session_date: "2026-12-19",
      end_lesson: "Lesson 16",
      next_lesson: "Lesson 16",
      next_scheduled_date: "2026-12-22",
      next_scheduled_time: "Morning",
      source: "manual",
    });
    expect(form.summary).toBe("Update from Ruth: now on lesson 16. She asked about the resurrection.");
  });

  it("uses their lesson wording only when it agrees with the number", () => {
    expect(replyToSessionForm(reply({ lesson: "Lesson 16 — Hope" }), study()).end_lesson).toBe("Lesson 16 — Hope");
    expect(replyToSessionForm(reply({ lesson: "Lesson 99" }), study()).end_lesson).toBe("Lesson 16");
  });

  it("works with no note and no next date", () => {
    const form = replyToSessionForm(reply({ note: null, nextDate: null, nextTime: null }), study());
    expect(form.summary).toBe("Update from Ruth: now on lesson 16.");
    expect(form.next_scheduled_date).toBe("");
  });
});

describe("the messages", () => {
  it("asks politely, names the dates and the person, and includes the link", () => {
    const h = buildHandover(study(), person(), "Doreen", choices());
    const msg = handoverMessage(h, "https://x.test/handover#abc");
    expect(msg).toContain("Hi Ruth");
    expect(msg).toContain("Nov 25 to Dec 20");
    expect(msg).toContain("Mary Nakato");
    expect(msg).toContain("https://x.test/handover#abc");
  });

  it("says the lesson, whether they are still studying, and the next date", () => {
    const msg = replyMessage(reply({ status: "paused" }), "https://x.test/handover/reply#abc");
    expect(msg).toContain("now on lesson 16, paused, next study Dec 22");
    expect(msg).toContain("with Mary Nakato");
    expect(replyMessage(reply({ status: "completed", nextDate: null }), "l")).toContain("finished.");
  });
});
