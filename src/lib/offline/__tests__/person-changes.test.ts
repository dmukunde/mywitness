import { describe, expect, it } from "vitest";
import { buildPersonInsert, buildPersonUpdate, withDetails } from "@/lib/offline/person-changes";
import { Outbox, applyOps, createOp } from "@/lib/offline/outbox";
import { DUPLICATE_PERSON_MESSAGE, describeRefusal } from "@/lib/offline/errors";
import { createMemoryStore } from "@/lib/offline/store";
import type { Area, Person } from "@/lib/types";

const NOW = "2026-11-03T08:00:00.000Z";
const TODAY = "2026-11-03";
const opts = { id: "p-new", userId: "u1", now: NOW, today: TODAY };

describe("a new person, added with no signal", () => {
  it("sends only what the person entered, with the usual defaults", () => {
    const { payload } = buildPersonInsert({ name: "Mary", phone_number: "0772 123456" }, opts);
    expect(payload).toMatchObject({
      id: "p-new",
      user_id: "u1",
      name: "Mary",
      phone_number: "0772 123456",
      first_met_date: TODAY,
      interest_level: "unknown",
      general_location: null,
      area_id: null,
    });
  });

  it("keeps a date and interest level the person chose", () => {
    const { payload } = buildPersonInsert(
      { name: "Joan", first_met_date: "2026-10-30", interest_level: "high" },
      opts
    );
    expect(payload).toMatchObject({ first_met_date: "2026-10-30", interest_level: "high" });
  });

  it("only sends ministry days when some were chosen (so a database without that column still works)", () => {
    expect("ministry_days" in buildPersonInsert({ name: "A" }, opts).payload).toBe(false);
    expect(buildPersonInsert({ name: "A", ministry_days: [] }, opts).payload).not.toHaveProperty("ministry_days");
    expect(buildPersonInsert({ name: "A", ministry_days: ["wed", "sat"] }, opts).payload).toMatchObject({
      ministry_days: ["wed", "sat"],
    });
  });

  it("marks a same-name person as confirmed different only when the person said so", () => {
    expect(buildPersonInsert({ name: "Mary" }, opts).payload).not.toHaveProperty("distinct_confirmed");
    expect(buildPersonInsert({ name: "Mary" }, { ...opts, confirmedDistinct: true }).payload).toMatchObject({
      distinct_confirmed: true,
    });
  });

  it("shows the new person at once, looking like a saved one", () => {
    const { row } = buildPersonInsert({ name: "Mary", ministry_days: ["wed"] }, opts);
    expect(row).toMatchObject({
      id: "p-new",
      name: "Mary",
      ministry_days: ["wed"],
      archived_at: null,
      is_demo: false,
      interest_level: "unknown",
      created_at: NOW,
      updated_at: NOW,
    });
  });
});

describe("editing a person with no signal", () => {
  it("sends only the changed details, never the id, and stamps the time", () => {
    const changes = buildPersonUpdate({ id: "p1", name: "Mary K", phone_number: "0700" }, NOW);
    expect(changes).toEqual({ name: "Mary K", phone_number: "0700", updated_at: NOW });
  });

  it("does not send the neighbourhood or photos that are only attached for display", () => {
    const changes = buildPersonUpdate(
      { id: "p1", name: "Mary", area: { id: "a1" } as Area, photos: [] } as never,
      NOW
    );
    expect(changes).not.toHaveProperty("area");
    expect(changes).not.toHaveProperty("photos");
    expect(changes).not.toHaveProperty("id");
  });
});

describe("what the screens expect of a person", () => {
  const area = { id: "a1", name: "Kiwatule" } as Area;
  const person = (o: Partial<Person> = {}) => buildPersonInsert({ name: "Mary", ...o }, opts).row;

  it("attaches the neighbourhood, including one created offline a moment ago", () => {
    expect(withDetails(person({ area_id: "a1" }), [area], []).area?.name).toBe("Kiwatule");
    expect(withDetails(person(), [area], []).area).toBeNull();
    expect(withDetails(person({ area_id: "gone" }), [area], []).area).toBeNull();
  });
});

describe("waiting people and areas are laid over the saved list", () => {
  const saved = [{ id: "p-old", name: "Elena" }];

  it("shows a new person and an edit before they are sent", () => {
    const { payload, row } = buildPersonInsert({ name: "Mary" }, opts);
    const ops = [
      createOp({ table: "people", kind: "insert", rowId: "p-new", payload, row: row as never }),
      createOp({ table: "people", kind: "update", rowId: "p-old", payload: { name: "Elena K" } }),
    ];
    const shown = applyOps(saved, ops, "people");
    expect(shown.map((p) => p.name)).toEqual(["Mary", "Elena K"]);
  });

  it("does not touch the people list when the waiting changes are about areas", () => {
    const ops = [createOp({ table: "areas", kind: "insert", rowId: "a1", row: { id: "a1", name: "Kiwatule" } })];
    expect(applyOps(saved, ops, "people")).toEqual(saved);
    expect(applyOps([] as { id: string }[], ops, "areas")).toHaveLength(1);
  });
});

describe("a new area and the person in it", () => {
  it("are stored together, in that order, so one can't arrive without the other", async () => {
    const store = createMemoryStore();
    const outbox = new Outbox(store, "u1");
    await outbox.load();
    await outbox.enqueueAll([
      createOp({ table: "areas", kind: "insert", rowId: "a1", payload: { id: "a1", name: "Kiwatule" } }),
      createOp({ table: "people", kind: "insert", rowId: "p1", payload: { id: "p1", area_id: "a1" } }),
    ]);
    // closing the app and reopening it finds both
    const reopened = new Outbox(store, "u1");
    expect((await reopened.load()).map((o) => `${o.table}:${o.kind}`)).toEqual(["areas:insert", "people:insert"]);

    const sent: string[] = [];
    const result = await reopened.flush(async (op) => {
      sent.push(op.table);
    });
    expect(sent).toEqual(["areas", "people"]);
    expect(result).toMatchObject({ sent: 2, pending: 0, failed: 0 });
  });

  it("when the area is refused, the person is kept too and the reason is shown", async () => {
    const outbox = new Outbox(createMemoryStore(), "u1");
    await outbox.load();
    await outbox.enqueueAll([
      createOp({ table: "areas", kind: "insert", rowId: "a1" }),
      createOp({ table: "people", kind: "insert", rowId: "p1" }),
    ]);
    await outbox.flush(async (op) => {
      if (op.table === "areas") throw { message: "x", code: "23514", status: 400 };
      throw { message: "insert or update violates foreign key constraint", code: "23503", status: 409 };
    });
    expect(outbox.all().map((o) => o.status)).toEqual(["failed", "failed"]);
  });
});

describe("why the server refused, in plain words", () => {
  it("explains a same-name person", () => {
    expect(describeRefusal({ message: "possible_duplicate_person", code: "P0001" })).toBe(DUPLICATE_PERSON_MESSAGE);
    expect(DUPLICATE_PERSON_MESSAGE).toMatch(/different person/);
  });

  it("explains a missing neighbourhood and a sign-in problem", () => {
    expect(describeRefusal({ code: "23503", message: "violates foreign key constraint" })).toMatch(/no longer on your account/);
    expect(describeRefusal({ code: "42501", message: "permission denied for table people" })).toMatch(/sign in again/i);
  });

  it("keeps other readable messages", () => {
    expect(describeRefusal({ message: "new row violates check constraint" })).toBe("new row violates check constraint");
  });
});
