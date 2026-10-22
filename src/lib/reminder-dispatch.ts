import type { SupabaseClient } from "@supabase/supabase-js";
import { reminderPushPayload, type PushPayload } from "@/lib/reminders";

/**
 * Sends due reminders as push notifications.
 *
 * Run once a minute by a scheduler. The rules that matter:
 *  - A reminder is *claimed* (notified_at set) in one atomic step BEFORE it is
 *    sent, so two overlapping runs can never both send it.
 *  - A user with no registered device is skipped without claiming, so a device
 *    registered later still gets reminders that fall due after that.
 *  - If no send succeeded, the claim is released so the reminder isn't lost:
 *    a brief outage is retried next run; if every device was removed the
 *    reminder waits (unclaimed) for a new device or the app itself.
 *  - Devices the push service says are gone (404/410) are removed.
 *  - Anything more than a day late is not announced — it is already waiting,
 *    overdue, in the app.
 */

export interface DueReminder {
  id: string;
  user_id: string;
  text: string;
  due_at: string;
}

export interface DeviceSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  private_mode: boolean;
}

export type SendResult = { ok: true } | { ok: false; gone: boolean };
export type Sender = (sub: DeviceSubscription, payload: PushPayload) => Promise<SendResult>;

export interface ReminderDb {
  listDue(now: Date, userId?: string): Promise<DueReminder[]>;
  subscriptionsFor(userId: string): Promise<DeviceSubscription[]>;
  /** Atomically marks it notified; true only for the one caller that got it. */
  claim(r: DueReminder, now: Date): Promise<boolean>;
  release(r: DueReminder): Promise<void>;
  deleteSubscription(id: string): Promise<void>;
  markDelivered(subscriptionId: string, now: Date): Promise<void>;
}

export interface DispatchSummary {
  considered: number;
  sent: number;
  skippedNoDevice: number;
  stale: number;
  retryLater: number;
  removedDevices: number;
}

const STALE_AFTER_MS = 24 * 3_600_000;

export async function dispatchDueReminders(deps: {
  db: ReminderDb;
  send: Sender;
  now?: Date;
  userId?: string;
}): Promise<DispatchSummary> {
  const { db, send, userId } = deps;
  const now = deps.now ?? new Date();
  const summary: DispatchSummary = {
    considered: 0,
    sent: 0,
    skippedNoDevice: 0,
    stale: 0,
    retryLater: 0,
    removedDevices: 0,
  };

  const due = await db.listDue(now, userId);
  const devices = new Map<string, DeviceSubscription[]>();

  for (const r of due) {
    summary.considered++;

    if (!devices.has(r.user_id)) {
      devices.set(r.user_id, await db.subscriptionsFor(r.user_id));
    }
    const subs = devices.get(r.user_id)!;
    if (!subs.length) {
      summary.skippedNoDevice++;
      continue;
    }

    if (now.getTime() - Date.parse(r.due_at) > STALE_AFTER_MS) {
      // Too late to be useful as an alert; stop considering it, send nothing.
      if (await db.claim(r, now)) summary.stale++;
      continue;
    }

    if (!(await db.claim(r, now))) continue; // another run has it

    const results = await Promise.all(
      subs.map(async (sub) => ({
        sub,
        result: await send(
          sub,
          reminderPushPayload(r, { privateMode: sub.private_mode })
        ).catch((): SendResult => ({ ok: false, gone: false })),
      }))
    );

    for (const { sub, result } of results) {
      if (result.ok) {
        await db.markDelivered(sub.id, now);
      } else if (result.gone) {
        await db.deleteSubscription(sub.id);
        summary.removedDevices++;
      }
    }

    if (results.some((x) => x.result.ok)) {
      summary.sent++;
    } else {
      // Nobody was notified. Release the claim so it isn't silently lost: if a
      // device only failed for now, the next run retries; if every device was
      // removed, the next run finds none (and skips without claiming), so a
      // device registered later — or the app itself, when opened — still
      // announces it, up to a day late.
      await db.release(r);
      if (!results.every((x) => !x.result.ok && x.result.gone)) summary.retryLater++;
    }
  }
  return summary;
}

/** The real database behind the dispatcher (service-role client). */
export function supabaseReminderDb(service: SupabaseClient): ReminderDb {
  return {
    async listDue(now, userId) {
      let q = service
        .from("personal_reminders")
        .select("id, user_id, text, due_at")
        .lte("due_at", now.toISOString())
        .is("notified_at", null)
        .is("done_at", null)
        .is("dismissed_at", null)
        .order("due_at", { ascending: true })
        .limit(200);
      if (userId) q = q.eq("user_id", userId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DueReminder[];
    },
    async subscriptionsFor(userId) {
      const { data, error } = await service
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth, private_mode")
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? []) as DeviceSubscription[];
    },
    async claim(r, now) {
      const { data, error } = await service
        .from("personal_reminders")
        .update({ notified_at: now.toISOString() })
        .eq("id", r.id)
        .eq("due_at", r.due_at) // still the time we read (not just moved)
        .is("notified_at", null)
        .is("done_at", null)
        .is("dismissed_at", null)
        .select("id");
      if (error) throw error;
      return (data?.length ?? 0) === 1;
    },
    async release(r) {
      await service
        .from("personal_reminders")
        .update({ notified_at: null })
        .eq("id", r.id)
        .eq("due_at", r.due_at);
    },
    async deleteSubscription(id) {
      await service.from("push_subscriptions").delete().eq("id", id);
    },
    async markDelivered(id, now) {
      await service
        .from("push_subscriptions")
        .update({ last_success_at: now.toISOString() })
        .eq("id", id);
    },
  };
}
