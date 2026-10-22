import { describe, expect, it } from "vitest";
import {
  dispatchDueReminders,
  type DeviceSubscription,
  type DueReminder,
  type ReminderDb,
  type Sender,
} from "@/lib/reminder-dispatch";

const NOW = new Date("2026-10-17T16:00:30.000Z"); // Saturday 7:00 PM East Africa

const reminder = (o: Partial<DueReminder> = {}): DueReminder => ({
  id: "r1",
  user_id: "u1",
  text: "Remind Mary about Sunday's meeting",
  due_at: "2026-10-17T16:00:00.000Z",
  ...o,
});

const device = (o: Partial<DeviceSubscription> = {}): DeviceSubscription => ({
  id: "d1",
  endpoint: "https://push.example/d1",
  p256dh: "k",
  auth: "a",
  private_mode: false,
  ...o,
});

/** An in-memory stand-in for the database, with the same claim-once rule. */
function fakeDb(reminders: DueReminder[], subs: Record<string, DeviceSubscription[]>) {
  const notified = new Set<string>();
  const removed: string[] = [];
  const delivered: string[] = [];
  const db: ReminderDb = {
    listDue: async () => reminders.filter((r) => !notified.has(r.id)),
    subscriptionsFor: async (u) => subs[u] ?? [],
    claim: async (r) => {
      if (notified.has(r.id)) return false;
      notified.add(r.id);
      return true;
    },
    release: async (r) => void notified.delete(r.id),
    deleteSubscription: async (id) => void removed.push(id),
    markDelivered: async (id) => void delivered.push(id),
  };
  return { db, notified, removed, delivered };
}

describe("dispatchDueReminders", () => {
  it("sends a due reminder once, with the reminder's own text", async () => {
    const { db, notified } = fakeDb([reminder()], { u1: [device()] });
    const sent: { body: string; tag: string }[] = [];
    const send: Sender = async (_s, p) => {
      sent.push({ body: p.body, tag: p.tag });
      return { ok: true };
    };
    const out = await dispatchDueReminders({ db, send, now: NOW });
    expect(out.sent).toBe(1);
    expect(sent).toEqual([{ body: "Remind Mary about Sunday's meeting", tag: "reminder-r1" }]);
    expect(notified.has("r1")).toBe(true);
  });

  it("never sends the same reminder twice, even when two runs overlap", async () => {
    const { db } = fakeDb([reminder()], { u1: [device()] });
    let count = 0;
    const send: Sender = async () => {
      count++;
      return { ok: true };
    };
    // Both runs read the reminder as due before either has claimed it.
    const listed = await db.listDue(NOW);
    const dbBothSee: ReminderDb = { ...db, listDue: async () => listed };
    await Promise.all([
      dispatchDueReminders({ db: dbBothSee, send, now: NOW }),
      dispatchDueReminders({ db: dbBothSee, send, now: NOW }),
    ]);
    expect(count).toBe(1);
  });

  it("sends to every device the person has, in private mode where asked", async () => {
    const { db, delivered } = fakeDb([reminder()], {
      u1: [device({ id: "phone" }), device({ id: "tablet", private_mode: true })],
    });
    const bodies: Record<string, string> = {};
    const send: Sender = async (s, p) => {
      bodies[s.id] = p.body;
      return { ok: true };
    };
    await dispatchDueReminders({ db, send, now: NOW });
    expect(bodies.phone).toContain("Mary");
    expect(bodies.tablet).toBe("You have a reminder.");
    expect(delivered.sort()).toEqual(["phone", "tablet"]);
  });

  it("does not claim a reminder when the person has no device yet", async () => {
    const { db, notified } = fakeDb([reminder()], { u1: [] });
    const out = await dispatchDueReminders({ db, send: async () => ({ ok: true }), now: NOW });
    expect(out.skippedNoDevice).toBe(1);
    expect(out.sent).toBe(0);
    expect(notified.size).toBe(0); // still waiting for a device
  });

  it("removes devices the push service says are gone", async () => {
    const { db, removed } = fakeDb([reminder()], {
      u1: [device({ id: "dead" }), device({ id: "alive" })],
    });
    const send: Sender = async (s) => (s.id === "dead" ? { ok: false, gone: true } : { ok: true });
    const out = await dispatchDueReminders({ db, send, now: NOW });
    expect(removed).toEqual(["dead"]);
    expect(out.removedDevices).toBe(1);
    expect(out.sent).toBe(1);
  });

  it("releases the claim to retry when every send failed but might work later", async () => {
    const { db, notified } = fakeDb([reminder()], { u1: [device()] });
    const send: Sender = async () => ({ ok: false, gone: false });
    const out = await dispatchDueReminders({ db, send, now: NOW });
    expect(out.retryLater).toBe(1);
    expect(notified.has("r1")).toBe(false); // next run tries again
  });

  it("treats a sender that throws as a failure to retry, not a crash", async () => {
    const { db, notified } = fakeDb([reminder()], { u1: [device()] });
    const send: Sender = async () => {
      throw new Error("network down");
    };
    const out = await dispatchDueReminders({ db, send, now: NOW });
    expect(out.retryLater).toBe(1);
    expect(notified.has("r1")).toBe(false);
  });

  it("does not lose a reminder when its only device was just removed", async () => {
    const subs: Record<string, DeviceSubscription[]> = { u1: [device()] };
    const { db, notified, removed } = fakeDb([reminder()], subs);
    const dbWithRemoval: ReminderDb = {
      ...db,
      deleteSubscription: async (id) => {
        await db.deleteSubscription(id);
        subs.u1 = subs.u1.filter((d) => d.id !== id);
      },
    };
    const first = await dispatchDueReminders({
      db: dbWithRemoval,
      send: async () => ({ ok: false, gone: true }),
      now: NOW,
    });
    expect(removed).toEqual(["d1"]);
    expect(first.retryLater).toBe(0); // nothing left to retry on
    expect(notified.has("r1")).toBe(false); // still unannounced, not lost

    // Next minute: no device, so it waits without being claimed or retried.
    const second = await dispatchDueReminders({ db: dbWithRemoval, send: async () => ({ ok: true }), now: NOW });
    expect(second.skippedNoDevice).toBe(1);
    expect(notified.has("r1")).toBe(false);

    // A device registered later still gets it.
    subs.u1 = [device({ id: "new-phone" })];
    const third = await dispatchDueReminders({ db: dbWithRemoval, send: async () => ({ ok: true }), now: NOW });
    expect(third.sent).toBe(1);
  });

  it("does not announce a reminder that is more than a day late", async () => {
    const { db, notified } = fakeDb(
      [reminder({ due_at: "2026-10-15T16:00:00.000Z" })],
      { u1: [device()] }
    );
    let sent = 0;
    const out = await dispatchDueReminders({
      db,
      send: async () => {
        sent++;
        return { ok: true };
      },
      now: NOW,
    });
    expect(sent).toBe(0);
    expect(out.stale).toBe(1);
    expect(notified.has("r1")).toBe(true); // not reconsidered every minute
  });

  it("keeps each person's reminders on that person's devices", async () => {
    const { db } = fakeDb(
      [reminder({ id: "a", user_id: "u1" }), reminder({ id: "b", user_id: "u2" })],
      { u1: [device({ id: "d-u1" })], u2: [device({ id: "d-u2" })] }
    );
    const sentTo: string[] = [];
    await dispatchDueReminders({
      db,
      send: async (s, p) => {
        sentTo.push(`${s.id}:${p.tag}`);
        return { ok: true };
      },
      now: NOW,
    });
    expect(sentTo.sort()).toEqual(["d-u1:reminder-a", "d-u2:reminder-b"]);
  });
});
