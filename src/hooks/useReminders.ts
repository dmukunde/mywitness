"use client";

import { useApp } from "@/lib/app-context";

/**
 * The in-app follow-up alerts (overdue visits, studies, "prepare for…"). They
 * stay visible inside MyWitness, but they never send a phone or browser
 * notification. Notifications are only for reminders the user schedules
 * themselves: see `useReminderAlerts` and the reminders push service.
 */
export function useReminders() {
  const { reminders, dismissReminder } = useApp();
  return { reminders, dismissReminder };
}
