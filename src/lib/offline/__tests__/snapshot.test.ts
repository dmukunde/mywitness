import { describe, expect, it } from "vitest";
import {
  SNAPSHOT_VERSION,
  clearUserData,
  keys,
  loadLastUser,
  loadSnapshot,
  removeOtherUsersData,
  saveSnapshot,
  type Snapshot,
} from "@/lib/offline/snapshot";
import { createMemoryStore } from "@/lib/offline/store";
import { createDemoData } from "@/lib/demo-data";

const snap = (userId: string, over: Partial<Snapshot> = {}): Snapshot => ({
  version: SNAPSHOT_VERSION,
  userId,
  email: `${userId}@example.com`,
  displayName: "Test",
  settings: null,
  savedAt: "2026-11-02T08:00:00.000Z",
  data: createDemoData(),
  ...over,
});

describe("the copy kept on the phone", () => {
  it("round-trips the records and remembers who they belong to", async () => {
    const store = createMemoryStore();
    await saveSnapshot(store, snap("u1"));
    const loaded = await loadSnapshot(store, "u1");
    expect(loaded?.userId).toBe("u1");
    expect(loaded?.data.people.length).toBeGreaterThan(0);
    expect(await loadLastUser(store)).toEqual({ userId: "u1", email: "u1@example.com" });
  });

  it("never shows one person's copy to another", async () => {
    const store = createMemoryStore();
    await saveSnapshot(store, snap("u1"));
    expect(await loadSnapshot(store, "u2")).toBeNull();
    // even if the stored copy was somehow filed under the wrong name
    await store.set(keys.snapshot("u2"), snap("u1"));
    expect(await loadSnapshot(store, "u2")).toBeNull();
  });

  it("ignores a copy from an incompatible version or with damaged contents", async () => {
    const store = createMemoryStore();
    await store.set(keys.snapshot("u1"), snap("u1", { version: SNAPSHOT_VERSION + 1 }));
    expect(await loadSnapshot(store, "u1")).toBeNull();
    await store.set(keys.snapshot("u1"), { ...snap("u1"), data: null });
    expect(await loadSnapshot(store, "u1")).toBeNull();
    await store.set(keys.snapshot("u1"), "junk");
    expect(await loadSnapshot(store, "u1")).toBeNull();
  });
});

describe("removing a person's data from the phone", () => {
  it("clears their records, their waiting changes and the pointer to them", async () => {
    const store = createMemoryStore();
    await saveSnapshot(store, snap("u1"));
    await store.set(keys.outbox("u1"), [{ id: "x" }]);
    await clearUserData(store, "u1");
    expect(await store.keys()).toEqual([]);
  });

  it("leaves another person's data alone", async () => {
    const store = createMemoryStore();
    await saveSnapshot(store, snap("u1"));
    await saveSnapshot(store, snap("u2"));
    await clearUserData(store, "u1");
    expect(await loadSnapshot(store, "u2")).not.toBeNull();
  });

  it("when someone new signs in, removes others' copies but keeps any with unsent changes", async () => {
    const store = createMemoryStore();
    await saveSnapshot(store, snap("old-clean"));
    await saveSnapshot(store, snap("old-pending"));
    await store.set(keys.outbox("old-pending"), [{ id: "unsent" }]);
    await saveSnapshot(store, snap("current"));

    const removed = await removeOtherUsersData(store, "current");

    expect(removed).toEqual(["old-clean"]);
    expect(await loadSnapshot(store, "old-clean")).toBeNull();
    expect(await loadSnapshot(store, "old-pending")).not.toBeNull();
    expect(await loadSnapshot(store, "current")).not.toBeNull();
  });
});
