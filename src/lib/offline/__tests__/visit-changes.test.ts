import { describe, expect, it } from "vitest";
import {
  buildCancel,
  buildVisitCreate,
  buildVisitUpdate,
  eventFields,
  visitPatchPayload,
  withEventPerson,
  withVisitDetails,
  type VisitInput,
} from "@/lib/offline/visit-changes";
import { Outbox, applyOps, createOp } from "@/lib/offline/outbox";
import { CLASH_MESSAGE, describeRefusal } from "@/lib/offline/errors";
import { createMemoryStore } from "@/lib/offline/store";
import type { Person, ReturnVisit, ScheduledMinistryEvent } from "@/lib/types";

const NOW = "2026-11-03T08:00:00.000Z";
const ids = { visitId: "v1", eventId: "e1", userId: "u1" };

const input = (o: Partial<VisitInput> = {}): VisitInput => ({
  person_id: "p1",
  conversation_id: null,
  scheduled_date: "2026-11-07",
  scheduled_time: "Afternoon",
  status: "planned",
  last_topic: "Hope",
  question_to_answer: null,
  next_planned_topic: "God's Kingdom",
  general_location: "Near the pharmacy",
  preparation_notes: "Bring tract",
  completed_at: null,
  ...o,
});

const visit = (o: Partial<ReturnVisit> = {}): ReturnVisit =>
  buildVisitCreate(input(o), ids, NOW).visit.row;
const event = (o: Partial<ScheduledMinistryEvent> = {}): ScheduledMinistryEvent =>
  ({ ...buildVisitCreate(input(), ids, NOW).event.row, ...o }) as ScheduledMinistryEvent;

describe("scheduling a visit with no signal", () => {
  it("makes the visit and its calendar entry together, with the entry pointing at the visit", () => {
    const { visit: v, event: e } = buildVisitCreate(input(), ids, NOW);
    expect(v.payload).toMatchObject({ id: "v1", user_id: "u1", person_id: "p1", scheduled_date: "2026-11-07", status: "planned" });
    expect(e.payload).toMatchObject({
      id: "e1",
      user_id: "u1",
      return_visit_id: "v1",
      person_id: "p1",
      event_type: "return_visit",
      scheduled_date: "2026-11-07",
      scheduled_time: "Afternoon",
      topic_or_lesson: "God's Kingdom",
      preparation_notes: "Bring tract",
      general_location: "Near the pharmacy",
      status: "planned",
    });
  });

  it("keeps the entry in step with the visit, whatever the visit says", () => {
    const { visit: v, event: e } = buildVisitCreate(input({ scheduled_time: null, next_planned_topic: null }), ids, NOW);
    expect(e.payload).toMatchObject(eventFields(v.row));
    expect(e.payload.scheduled_time).toBeNull();
    expect(e.payload.topic_or_lesson).toBeNull();
  });

  it("never sends the person or conversation attached for display", () => {
    const withExtras = { ...input(), person: { id: "p1" } as Person, conversation: { id: "c" } } as unknown as VisitInput;
    const { visit: v } = buildVisitCreate(withExtras, ids, NOW);
    expect(v.payload).not.toHaveProperty("person");
    expect(v.payload).not.toHaveProperty("conversation");
  });

  it("shows both on screen at once, looking like saved ones", () => {
    const { visit: v, event: e } = buildVisitCreate(input(), ids, NOW);
    expect(v.row).toMatchObject({ id: "v1", is_demo: false, created_at: NOW, updated_at: NOW });
    expect(e.row).toMatchObject({ id: "e1", return_visit_id: "v1", is_demo: false, created_at: NOW });
  });
});

describe("moving a visit with no signal", () => {
  it("changes the visit and moves its calendar entry with it", () => {
    const u = buildVisitUpdate(
      visit(),
      { scheduled_date: "2026-11-10", scheduled_time: "10:00 AM", status: "planned" },
      event(),
      { newEventId: "new", userId: "u1" },
      NOW
    );
    expect(u.visitPayload).toEqual({ scheduled_date: "2026-11-10", scheduled_time: "10:00 AM", status: "planned", updated_at: NOW });
    expect(u.event).toMatchObject({ kind: "update", id: "e1" });
    expect(u.event.payload).toMatchObject({
      scheduled_date: "2026-11-10",
      scheduled_time: "10:00 AM",
      topic_or_lesson: "God's Kingdom", // unchanged details are carried over
      status: "planned",
    });
    expect(u.merged.scheduled_date).toBe("2026-11-10");
  });

  it("marking a visit done also marks its entry done", () => {
    const u = buildVisitUpdate(visit(), { status: "completed", completed_at: NOW }, event(), { newEventId: "n", userId: "u1" }, NOW);
    expect(u.visitPayload).toMatchObject({ status: "completed", completed_at: NOW });
    expect(u.event.payload).toMatchObject({ status: "completed" });
  });

  it("putting a visit back (undo) puts its entry back", () => {
    const done = visit({ status: "completed", completed_at: NOW });
    const u = buildVisitUpdate(done, { status: "planned", completed_at: null }, event({ status: "completed" }), { newEventId: "n", userId: "u1" }, NOW);
    expect(u.visitPayload).toMatchObject({ status: "planned", completed_at: null });
    expect(u.event.payload).toMatchObject({ status: "planned" });
  });

  it("creates the entry if an older visit never had one", () => {
    const u = buildVisitUpdate(visit(), { scheduled_date: "2026-11-12" }, undefined, { newEventId: "fresh", userId: "u1" }, NOW);
    expect(u.event).toMatchObject({ kind: "insert", id: "fresh" });
    expect(u.event.payload).toMatchObject({ return_visit_id: "v1", user_id: "u1", scheduled_date: "2026-11-12" });
  });

  it("sends only what changed for the visit, never its id or who it belongs to", () => {
    const payload = visitPatchPayload(
      { id: "x", user_id: "y", created_at: "z", person: {} as Person, scheduled_date: "2026-11-09" } as Partial<ReturnVisit>,
      NOW
    );
    expect(payload).toEqual({ scheduled_date: "2026-11-09", updated_at: NOW });
  });
});

describe("cancelling a visit", () => {
  it("cancels the visit and a planned entry", () => {
    const c = buildCancel(event(), NOW);
    expect(c.visitPayload).toEqual({ status: "cancelled", updated_at: NOW });
    expect(c.event).toEqual({ id: "e1", payload: { status: "cancelled", updated_at: NOW } });
  });

  it("leaves a finished entry alone as history, and copes with a visit that has none", () => {
    expect(buildCancel(event({ status: "completed" }), NOW).event).toBeNull();
    expect(buildCancel(undefined, NOW).event).toBeNull();
  });
});

describe("what the screens expect", () => {
  it("attaches the person and the earlier conversation", () => {
    const people = [{ id: "p1", name: "Mary" } as Person];
    const shown = withVisitDetails(visit({ conversation_id: "c1" }), people, [{ id: "c1" }]);
    expect(shown.person?.name).toBe("Mary");
    expect(shown.conversation).toMatchObject({ id: "c1" });
    expect(withVisitDetails(visit(), [], []).person).toBeNull();
    expect(withEventPerson(event(), people).person?.name).toBe("Mary");
  });

  it("lays a waiting visit and entry over the saved lists", () => {
    const { visit: v, event: e } = buildVisitCreate(input(), ids, NOW);
    const shownVisits = applyOps(
      [] as { id: string }[],
      [createOp({ table: "return_visits", kind: "insert", rowId: "v1", payload: v.payload, row: v.row as never })],
      "return_visits"
    );
    const shownEvents = applyOps(
      [] as { id: string }[],
      [createOp({ table: "scheduled_ministry_events", kind: "insert", rowId: "e1", payload: e.payload, row: e.row as never })],
      "scheduled_ministry_events"
    );
    expect(shownVisits).toHaveLength(1);
    expect(shownEvents).toHaveLength(1);
  });
});

describe("the entry is never sent without its visit", () => {
  async function queued() {
    const outbox = new Outbox(createMemoryStore(), "u1");
    await outbox.load();
    const c = buildVisitCreate(input(), ids, NOW);
    await outbox.enqueueAll([
      createOp({ table: "return_visits", kind: "insert", rowId: "v1", payload: c.visit.payload }),
      createOp({ table: "scheduled_ministry_events", kind: "insert", rowId: "e1", payload: c.event.payload, dependsOn: "v1" }),
    ]);
    return outbox;
  }

  it("sends the visit first, then its entry", async () => {
    const outbox = await queued();
    const sent: string[] = [];
    await outbox.flush(async (op) => {
      sent.push(op.table);
    });
    expect(sent).toEqual(["return_visits", "scheduled_ministry_events"]);
  });

  it("when the visit is refused, its entry is kept but not sent", async () => {
    const outbox = await queued();
    const sent: string[] = [];
    const result = await outbox.flush(async (op) => {
      sent.push(op.table);
      throw { message: "duplicate key value violates unique constraint", code: "23505", status: 409 };
    });
    expect(sent).toEqual(["return_visits"]); // the entry was never attempted
    expect(result).toMatchObject({ sent: 0, failed: 2 });
    expect(outbox.all().map((o) => o.status)).toEqual(["failed", "failed"]);
  });

  it("a refusal of something unrelated does not hold the entry back", async () => {
    const outbox = await queued();
    await outbox.enqueue(createOp({ table: "people", kind: "update", rowId: "p9", payload: { name: "x" } }));
    const sent: string[] = [];
    await outbox.flush(async (op) => {
      sent.push(op.table);
      if (op.table === "people") throw { message: "no", code: "23514", status: 400 };
    });
    expect(sent).toEqual(["return_visits", "scheduled_ministry_events", "people"]);
  });
});

describe("explaining a clash", () => {
  it("says a visit at the same date and time already exists, in plain words", () => {
    expect(describeRefusal({ code: "23505", message: "duplicate key value violates unique constraint" })).toBe(CLASH_MESSAGE);
    expect(CLASH_MESSAGE).toMatch(/same person at the same date and time/);
  });
});
