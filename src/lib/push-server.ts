import webpush from "web-push";
import { timingSafeEqual } from "node:crypto";
import type { PushPayload } from "@/lib/reminders";
import type { DeviceSubscription, Sender } from "@/lib/reminder-dispatch";

/**
 * Server-only Web Push setup. Needs three settings (see DEPLOY.md):
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 * Without them push is simply "not set up yet" — the rest of the app works.
 */

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function pushConfig(): PushConfig | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/** A sender that talks to the real push services (Apple, Google, Mozilla…). */
export function makeSender(config: PushConfig): Sender {
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return async (sub: DeviceSubscription, payload: PushPayload) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 6 * 3600, urgency: "high" }
      );
      return { ok: true };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410: the device unsubscribed or the app was removed.
      return { ok: false, gone: status === 404 || status === 410 };
    }
  };
}

/** Checks the scheduler's secret without leaking timing information. */
export function isAuthorizedCron(header: string | null): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !header) return false;
  const given = header.startsWith("Bearer ") ? header.slice(7) : header;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
