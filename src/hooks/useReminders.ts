"use client";

import { useEffect } from "react";
import { useApp } from "@/lib/app-context";
import { parseISO, isBefore, subMinutes } from "date-fns";

export function useReminders() {
  const { reminders, settings, returnVisits, dismissReminder } = useApp();

  useEffect(() => {
    if (!settings?.browser_notifications_enabled) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => undefined);
    }
  }, [settings?.browser_notifications_enabled]);

  useEffect(() => {
    if (!settings?.browser_notifications_enabled) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const notifiedKey = "mywitness-notified";
    const already = new Set(
      JSON.parse(localStorage.getItem(notifiedKey) || "[]") as string[]
    );

    for (const reminder of reminders) {
      if (already.has(reminder.id)) continue;
      if (isBefore(parseISO(reminder.due_at), new Date()) || true) {
        // Show due / overdue reminders
        const due = parseISO(reminder.due_at);
        if (due <= new Date()) {
          new Notification(reminder.title, {
            body: reminder.body || undefined,
            tag: reminder.id,
          });
          already.add(reminder.id);
        }
      }
    }

    // Preparation reminders for upcoming visits
    const minutesBefore = settings.reminder_minutes_before || 60;
    for (const visit of returnVisits.filter((v) => v.status === "planned")) {
      const key = `prep-${visit.id}`;
      if (already.has(key)) continue;
      if (!visit.scheduled_date) continue;
      const when = parseISO(
        `${visit.scheduled_date}T${visit.scheduled_time?.includes(":") ? visit.scheduled_time : "12:00"}:00`
      );
      const prepAt = subMinutes(when, minutesBefore);
      if (prepAt <= new Date() && when >= new Date()) {
        new Notification(`Prepare: ${visit.person?.name || "Return visit"}`, {
          body: visit.next_planned_topic || visit.preparation_notes || undefined,
          tag: key,
        });
        already.add(key);
      }
    }

    localStorage.setItem(notifiedKey, JSON.stringify([...already].slice(-100)));
  }, [reminders, returnVisits, settings]);

  return { reminders, dismissReminder };
}
