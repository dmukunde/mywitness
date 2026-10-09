import { describe, expect, it } from "vitest";
import {
  buildCompletionForm,
  hasVisitRecord,
  nextVisitDateProblem,
  visitNotesFor,
  type CompletionInput,
} from "@/lib/return-visit-completion";
import type { Conversation, ReturnVisit } from "@/lib/types";

const person = { id: "p1", name: "Grace", general_location: "Kiwatule" };

const input = (o: Partial<CompletionInput> = {}): CompletionInput => ({
  visitDate: "2026-10-09",
  topic: "",
  notes: "",
  nextTopic: "",
  nextDate: "",
  nextTime: "",
  nextPrep: "",
  ...o,
});

function visit(o: Partial<ReturnVisit> = {}): ReturnVisit {
  return {
    id: "rv1",
    user_id: "u",
    person_id: "p1",
    conversation_id: null,
    scheduled_date: "2026-10-09",
    scheduled_time: null,
    status: "completed",
    last_topic: null,
    question_to_answer: null,
    next_planned_topic: null,
    general_location: null,
    preparation_notes: null,
    completed_at: null,
    is_demo: false,
    created_at: "2026-10-02T10:00:00.000Z",
    updated_at: "2026-10-02T10:00:00.000Z",
    ...o,
  };
}

function conv(o: Partial<Conversation>): Conversation {
  return {
    id: "c1",
    user_id: "u",
    person_id: "p1",
    session_id: null,
    conversation_date: "2026-10-09",
    approximate_time: null,
    general_location: null,
    how_met: null,
    main_topic: "Hope",
    questions_asked: null,
    concerns_circumstances: null,
    publications_shared: null,
    interest_level: null,
    promised_follow_up_date: null,
    promised_follow_up_time: null,
    next_topic: null,
    action_required: null,
    additional_notes: null,
    summary: "Talked about hope",
    next_visit_preparation: null,
    source: "manual",
    audio_path: null,
    keep_audio: false,
    transcript: null,
    is_demo: false,
    created_at: "2026-10-09T10:00:00.000Z",
    updated_at: "2026-10-09T10:00:00.000Z",
    ...o,
  };
}

describe("completing a visit", () => {
  it("logs history only when there is something to record", () => {
    expect(hasVisitRecord(input())).toBe(false);
    expect(hasVisitRecord(input({ topic: "  " , notes: " " }))).toBe(false);
    expect(hasVisitRecord(input({ topic: "Hope" }))).toBe(true);
    expect(hasVisitRecord(input({ notes: "Warm welcome" }))).toBe(true);
  });

  it("builds a manual conversation for the same person, with the visit's notes", () => {
    const form = buildCompletionForm(
      person,
      input({ topic: " Hope ", notes: " She asked about suffering " }),
      "id-1"
    );
    expect(form).toMatchObject({
      person_id: "p1",
      person_name: "Grace",
      general_location: "Kiwatule",
      conversation_date: "2026-10-09",
      main_topic: "Hope",
      summary: "She asked about suffering",
      source: "manual",
      client_id: "id-1",
    });
  });

  it("does not ask for a next visit unless a date is chosen", () => {
    const none = buildCompletionForm(person, input({ nextTopic: "Why suffering" }), "x");
    expect(none.schedule_return_visit).toBe(false);
    const some = buildCompletionForm(
      person,
      input({
        nextTopic: "Why suffering",
        nextDate: "2026-10-16",
        nextTime: "Morning",
        nextPrep: "Bring the tract",
      }),
      "x"
    );
    expect(some).toMatchObject({
      schedule_return_visit: true,
      promised_follow_up_date: "2026-10-16",
      promised_follow_up_time: "Morning",
      next_topic: "Why suffering",
      next_visit_preparation: "Bring the tract",
    });
  });

  it("will not accept a next visit before this one", () => {
    expect(nextVisitDateProblem(input({ nextDate: "2026-10-08" }))).toMatch(/before/);
    expect(nextVisitDateProblem(input({ nextDate: "2026-10-09" }))).toBeNull();
    expect(nextVisitDateProblem(input({ nextDate: "2026-10-16" }))).toBeNull();
    expect(nextVisitDateProblem(input())).toBeNull();
  });
});

describe("a completed visit's own notes", () => {
  it("are the conversation saved after the visit was scheduled", () => {
    const v = visit({ conversation_id: "c1" });
    const notes = visitNotesFor(v, [conv({ id: "c1" })]);
    expect(notes?.summary).toBe("Talked about hope");
  });

  it("are not the earlier conversation the visit merely followed up", () => {
    const v = visit({ conversation_id: "c0", created_at: "2026-10-05T10:00:00.000Z" });
    const earlier = conv({ id: "c0", created_at: "2026-10-02T09:00:00.000Z" });
    expect(visitNotesFor(v, [earlier])).toBeNull();
  });

  it("only exist for completed visits", () => {
    const v = visit({ status: "planned", conversation_id: "c1" });
    expect(visitNotesFor(v, [conv({ id: "c1" })])).toBeNull();
  });

  it("are absent when the visit was completed without notes", () => {
    expect(visitNotesFor(visit({ conversation_id: null }), [conv({})])).toBeNull();
  });
});
