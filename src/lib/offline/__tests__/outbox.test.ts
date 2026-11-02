import { describe, expect, it } from "vitest";
import { Outbox, applyOps, createOp, type OutboxOp } from "@/lib/offline/outbox";
import { createMemoryStore } from "@/lib/offline/store";
import { keys } from "@/lib/offline/snapshot";

const UID = "user-1";

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  start_time: "2026-11-02T08:00:00.000Z",
  end_time: null as string | null,
  duration_minutes: null as number | null,
  ...extra,
});

const insert = (id: string) =>
  createOp({ table: "ministry_sessions", kind: "insert", rowId: id, payload: { id }, row: row(id) });
const update = (id: string, payload: Record<string, unknown>) =>
  createOp({ table: "ministry_sessions", kind: "update", rowId: id, payload });
const remove = (id: string) => createOp({ table: "ministry_sessions", kind: "delete", rowId: id });

const offline = () => Object.assign(new TypeError("Failed to fetch"), {});
const refused = (message = "violates check constraint") => ({ message, code: "23514", status: 400 });

async function setup() {
  const store = createMemoryStore();
  const outbox = new Outbox(store, UID);
  await outbox.load();
  return { store, outbox };
}

describe("applyOps (what the screen shows)", () => {
  it("shows a timer started offline straight away", () => {
    const result = applyOps([row("a")], [insert("b")], "ministry_sessions");
    expect(result.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("shows a stop, an edit and a delete before they are sent", () => {
    const ops = [update("a", { end_time: "2026-11-02T09:00:00.000Z", duration_minutes: 60 }), remove("c")];
    const result = applyOps([row("a"), row("c")], ops, "ministry_sessions");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "a", end_time: "2026-11-02T09:00:00.000Z", duration_minutes: 60 });
  });

  it("start then stop, both offline, shows one finished entry", () => {
    const ops = [insert("t"), update("t", { end_time: "2026-11-02T09:30:00.000Z", duration_minutes: 90 })];
    const result = applyOps([], ops, "ministry_sessions");
    expect(result).toEqual([
      expect.objectContaining({ id: "t", end_time: "2026-11-02T09:30:00.000Z", duration_minutes: 90 }),
    ]);
  });

  it("does not show an entry twice once the server already has it", () => {
    const result = applyOps([row("t")], [insert("t")], "ministry_sessions");
    expect(result).toHaveLength(1);
  });

  it("does not show changes the server refused", () => {
    const failed: OutboxOp = { ...update("a", { duration_minutes: 5 }), status: "failed" };
    expect(applyOps([row("a")], [failed], "ministry_sessions")[0]).toMatchObject({ duration_minutes: null });
  });

  it("leaves the original rows untouched", () => {
    const rows = [row("a")];
    applyOps(rows, [update("a", { duration_minutes: 5 })], "ministry_sessions");
    expect(rows[0].duration_minutes).toBeNull();
  });
});

describe("the outbox keeps changes safe", () => {
  it("stores a change on the phone before returning, so closing the app loses nothing", async () => {
    const { store, outbox } = await setup();
    await outbox.enqueue(insert("t"));
    const reopened = new Outbox(store, UID);
    const restored = await reopened.load();
    expect(restored.map((o) => o.rowId)).toEqual(["t"]);
    expect(reopened.pendingCount).toBe(1);
  });

  it("keeps each person's waiting changes separate", async () => {
    const { store, outbox } = await setup();
    await outbox.enqueue(insert("t"));
    const other = new Outbox(store, "user-2");
    expect(await other.load()).toEqual([]);
  });

  it("ignores damaged stored data instead of crashing", async () => {
    const store = createMemoryStore();
    await store.set(keys.outbox(UID), "garbage");
    expect(await new Outbox(store, UID).load()).toEqual([]);
  });
});

describe("sending", () => {
  it("sends in the order the changes were made, then clears them", async () => {
    const { store, outbox } = await setup();
    await outbox.enqueue(insert("t"));
    await outbox.enqueue(update("t", { duration_minutes: 45 }));
    await outbox.enqueue(remove("old"));
    const order: string[] = [];
    const result = await outbox.flush(async (op) => {
      order.push(`${op.kind}:${op.rowId}`);
    });
    expect(order).toEqual(["insert:t", "update:t", "delete:old"]);
    expect(result).toEqual({ sent: 3, pending: 0, failed: 0, stoppedBy: null });
    expect(await store.get(keys.outbox(UID))).toEqual([]);
  });

  it("keeps everything when there is no signal, and sends it all later", async () => {
    const { outbox } = await setup();
    await outbox.enqueue(insert("t"));
    await outbox.enqueue(update("t", { duration_minutes: 45 }));

    const first = await outbox.flush(async () => {
      throw offline();
    });
    expect(first).toEqual({ sent: 0, pending: 2, failed: 0, stoppedBy: "network" });
    expect(outbox.all().every((o) => o.attempts === 0)).toBe(true);

    const sent: string[] = [];
    const second = await outbox.flush(async (op) => {
      sent.push(op.kind);
    });
    expect(sent).toEqual(["insert", "update"]);
    expect(second.pending).toBe(0);
  });

  it("keeps what was not sent when the signal drops part-way", async () => {
    const { outbox } = await setup();
    await outbox.enqueue(insert("a"));
    await outbox.enqueue(insert("b"));
    await outbox.enqueue(insert("c"));
    let calls = 0;
    const result = await outbox.flush(async () => {
      calls++;
      if (calls === 2) throw offline();
    });
    expect(result).toEqual({ sent: 1, pending: 2, failed: 0, stoppedBy: "network" });
    expect(outbox.all().map((o) => o.rowId)).toEqual(["b", "c"]);
  });

  it("stops and asks for sign-in when the session is no longer accepted, losing nothing", async () => {
    const { outbox } = await setup();
    await outbox.enqueue(insert("t"));
    const result = await outbox.flush(async () => {
      throw { status: 401, message: "JWT expired" };
    });
    expect(result).toMatchObject({ sent: 0, pending: 1, stoppedBy: "auth" });
    expect(outbox.all()[0].status).toBe("pending");
  });

  it("marks a refused change as failed, keeps it, and carries on with the others", async () => {
    const { outbox } = await setup();
    await outbox.enqueue(insert("bad"));
    await outbox.enqueue(insert("good"));
    const result = await outbox.flush(async (op) => {
      if (op.rowId === "bad") throw refused();
    });
    expect(result).toEqual({ sent: 1, pending: 0, failed: 1, stoppedBy: null });
    const left = outbox.all();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ rowId: "bad", status: "failed", attempts: 1, error: "violates check constraint" });
  });

  it("does not send later changes to an entry whose earlier change was refused", async () => {
    const { outbox } = await setup();
    await outbox.enqueue(insert("t"));
    await outbox.enqueue(update("t", { duration_minutes: 30 }));
    const sent: string[] = [];
    const result = await outbox.flush(async (op) => {
      sent.push(op.kind);
      if (op.kind === "insert") throw refused();
    });
    expect(sent).toEqual(["insert"]);
    expect(result.failed).toBe(2);
    expect(outbox.all().map((o) => o.status)).toEqual(["failed", "failed"]);
  });

  it("lets the person retry or discard refused changes", async () => {
    const { outbox } = await setup();
    await outbox.enqueue(insert("t"));
    await outbox.flush(async () => {
      throw refused();
    });
    expect(outbox.pendingCount).toBe(0);

    await outbox.retryFailed();
    expect(outbox.pendingCount).toBe(1);
    expect(outbox.all()[0].error).toBeUndefined();

    await outbox.flush(async () => {
      throw refused("still no");
    });
    await outbox.discardFailed();
    expect(outbox.all()).toEqual([]);
  });

  it("never runs two sends at once", async () => {
    const { outbox } = await setup();
    await outbox.enqueue(insert("t"));
    let running = 0;
    let peak = 0;
    const send = async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 10));
      running--;
    };
    const [a, b] = await Promise.all([outbox.flush(send), outbox.flush(send)]);
    expect(peak).toBe(1);
    expect(a).toBe(b); // the second caller shares the first run
  });

  it("sends a change added while it is already sending", async () => {
    const { outbox } = await setup();
    await outbox.enqueue(insert("a"));
    const sent: string[] = [];
    let added = false;
    await outbox.flush(async (op) => {
      sent.push(op.rowId);
      if (!added) {
        added = true;
        await outbox.enqueue(insert("late"));
      }
    });
    expect(sent).toEqual(["a", "late"]);
    expect(outbox.pendingCount).toBe(0);
  });

  it("tells listeners when the waiting count changes", async () => {
    const { outbox } = await setup();
    const counts: number[] = [];
    outbox.subscribe(() => counts.push(outbox.pendingCount));
    await outbox.enqueue(insert("t"));
    await outbox.flush(async () => undefined);
    expect(counts[0]).toBe(1);
    expect(counts[counts.length - 1]).toBe(0);
  });
});
