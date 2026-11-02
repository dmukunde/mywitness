import type { DemoData } from "@/lib/demo-data";
import type { UserSettings } from "@/lib/types";
import type { KeyValueStore } from "@/lib/offline/store";

/**
 * The copy of one person's records kept on their phone so the app can open and
 * be read with no signal. It is exactly the server's rows (before the screen
 * lays waiting changes on top), in the same shape the demo mode already uses,
 * so one function turns it into what the screens show.
 *
 * Privacy: this is private ministry information stored in the browser's own
 * database. It is protected by the phone's lock, not encrypted separately, and
 * it is removed when the person signs out or deletes their account.
 */

export const SNAPSHOT_VERSION = 1;

export interface Snapshot {
  version: number;
  userId: string;
  email: string | null;
  displayName: string;
  settings: UserSettings | null;
  /** When the server last confirmed these records (ISO time). */
  savedAt: string;
  data: DemoData;
}

/** Who the stored copy belongs to, so the app can open it before it can ask the server. */
export interface LastUser {
  userId: string;
  email: string | null;
}

export const keys = {
  snapshot: (uid: string) => `snapshot:${uid}`,
  outbox: (uid: string) => `outbox:${uid}`,
  lastUser: "last-user",
} as const;

export async function saveSnapshot(store: KeyValueStore, snapshot: Snapshot): Promise<void> {
  await store.set(keys.snapshot(snapshot.userId), snapshot);
  const last: LastUser = { userId: snapshot.userId, email: snapshot.email };
  await store.set(keys.lastUser, last);
}

/** The stored copy for this person, or null if there is none or it is from an incompatible version. */
export async function loadSnapshot(store: KeyValueStore, userId: string): Promise<Snapshot | null> {
  const snap = await store.get<Snapshot>(keys.snapshot(userId));
  if (!snap || snap.version !== SNAPSHOT_VERSION || snap.userId !== userId) return null;
  if (!snap.data || !Array.isArray(snap.data.people)) return null;
  return snap;
}

export async function loadLastUser(store: KeyValueStore): Promise<LastUser | null> {
  const last = await store.get<LastUser>(keys.lastUser);
  return last && typeof last.userId === "string" ? last : null;
}

/** Removes everything stored for one person (their records copy and any unsent changes). */
export async function clearUserData(store: KeyValueStore, userId: string): Promise<void> {
  await store.delete(keys.snapshot(userId));
  await store.delete(keys.outbox(userId));
  const last = await loadLastUser(store);
  if (last?.userId === userId) await store.delete(keys.lastUser);
}

/**
 * When someone new signs in on a phone, removes other people's copies so their
 * records don't linger. A copy that still has unsent changes is kept, because
 * deleting it would lose work the other person has not been able to send yet.
 */
export async function removeOtherUsersData(
  store: KeyValueStore,
  keepUserId: string
): Promise<string[]> {
  const removed: string[] = [];
  const ids = new Set<string>();
  for (const k of await store.keys("snapshot:")) ids.add(k.slice("snapshot:".length));
  for (const k of await store.keys("outbox:")) ids.add(k.slice("outbox:".length));
  for (const uid of ids) {
    if (uid === keepUserId) continue;
    const pending = await store.get<unknown[]>(keys.outbox(uid));
    if (Array.isArray(pending) && pending.length > 0) continue;
    await clearUserData(store, uid);
    removed.push(uid);
  }
  return removed;
}
