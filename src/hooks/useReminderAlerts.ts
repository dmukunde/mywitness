"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/lib/app-context";
import { readyRegistration, usePushStatus } from "@/hooks/usePushStatus";
import { isOpen, reminderPushPayload } from "@/lib/reminders";

const SEEN_KEY = "mywitness-reminder-alerts";
const CHECK_EVERY_MS = 30_000;

function readSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

/**
 * Two small jobs that keep reminders reliable on this device:
 *
 *  1. If push is on, quietly re-register this device when the browser has
 *     dropped its subscription (it happens), so reminders keep arriving.
 *  2. If push ISN'T available (not set up, or an unsupported browser) but
 *     notifications are allowed, alert while the app is open when a reminder
 *     comes due. When push is working the server already notifies, so the
 *     app stays quiet — no double alerts.
 *
 * Either way a due reminder stays on Home and the Reminders screen until it is
 * done or dismissed.
 */
export function useReminderAlerts() {
  const { personalReminders, settings } = useApp();
  const push = usePushStatus();
  const reminders = useRef(personalReminders);
  const registered = useRef(false);

  useEffect(() => {
    reminders.current = personalReminders;
  }, [personalReminders]);

  // 1. Keep this device registered.
  useEffect(() => {
    if (registered.current || push.loading || push.busy) return;
    if (
      push.support === "ready" &&
      push.serverConfigured &&
      push.permission === "granted" &&
      !push.subscribed
    ) {
      registered.current = true;
      void push.enable();
    }
  }, [push]);

  // 2. Fallback alerts while the app is open.
  const pushWorks = push.subscribed && push.serverConfigured;
  const allowed = settings?.browser_notifications_enabled !== false;
  useEffect(() => {
    if (push.loading || pushWorks || !allowed) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const check = async () => {
      const seen = new Set(readSeen());
      const due = reminders.current.filter(
        (r) => isOpen(r) && !r.notified_at && Date.parse(r.due_at) <= Date.now()
      );
      let changed = false;
      for (const r of due) {
        const key = `${r.id}@${r.due_at}`;
        if (seen.has(key)) continue;
        seen.add(key);
        changed = true;
        const payload = reminderPushPayload(r);
        const options = { body: payload.body, tag: payload.tag, data: { url: payload.url } };
        try {
          // Works on phones, where `new Notification()` is not allowed.
          const reg = await readyRegistration(1500);
          if (reg) await reg.showNotification(payload.title, options);
          else new Notification(payload.title, options);
        } catch {
          // An alert that can't be shown is still on Home.
        }
      }
      if (changed) {
        try {
          localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
        } catch {
          // fine
        }
      }
    };

    void check();
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [push.loading, pushWorks, allowed]);
}
