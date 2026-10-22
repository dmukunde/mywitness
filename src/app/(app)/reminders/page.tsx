"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { Button, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { AddReminderSheet } from "@/components/AddReminderSheet";
import { NotificationSetup } from "@/components/NotificationSetup";
import { ReminderList } from "@/components/ReminderList";
import { describeWhen, isOpen, reminderState, sortOpen } from "@/lib/reminders";

function RemindersInner() {
  const { personalReminders, people, archivedPeople, updatePersonalReminder } = useApp();
  const highlight = useSearchParams().get("reminder");
  const [adding, setAdding] = useState(false);
  const [now] = useState(() => new Date());

  const open = sortOpen(personalReminders);
  const overdue = open.filter((r) => reminderState(r, now) === "overdue");
  // Finished (not dismissed) in the last 60 days — newest first.
  const finished = personalReminders
    .filter((r) => !isOpen(r) && r.done_at && !r.dismissed_at)
    .sort((a, b) => Date.parse(b.done_at!) - Date.parse(a.done_at!));

  const nameOf = (id: string | null) =>
    id ? [...people, ...archivedPeople].find((p) => p.id === id)?.name : undefined;

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        title="Reminders"
        subtitle="Follow-ups at just the right time"
        action={
          <Button size="sm" className="whitespace-nowrap" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        }
      />

      <NotificationSetup />

      {open.length === 0 && (
        <EmptyState
          title="No reminders"
          description="Set one to follow up with someone — for example, to invite Mary to Sunday's meeting."
          action={<Button onClick={() => setAdding(true)}>Add a reminder</Button>}
        />
      )}

      {open.length > 0 && (
        <SectionTitle title={overdue.length ? `Due now · ${overdue.length}` : "Coming up"} />
      )}
      {/* One list, soonest first (anything due now is marked in red), always in
          the same spot so its Undo banner survives the last item going. */}
      <ReminderList reminders={open} highlightId={highlight} />

      {finished.length > 0 && (
        <section className="space-y-2">
          <SectionTitle title="Done recently" />
          <ul className="divide-y divide-stone-100 rounded-2xl bg-white px-3.5 ring-1 ring-stone-200/70">
            {finished.slice(0, 10).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 text-sm text-stone-600">
                  <span className="block truncate line-through decoration-stone-300">{r.text}</span>
                  <span className="block text-xs text-stone-400">
                    {nameOf(r.person_id) ? `${nameOf(r.person_id)} · ` : ""}
                    {describeWhen(new Date(r.done_at!))}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void updatePersonalReminder(r.id, { done_at: null })}
                >
                  Reopen
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {adding && <AddReminderSheet onClose={() => setAdding(false)} />}
    </div>
  );
}

export default function RemindersPage() {
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
      <RemindersInner />
    </Suspense>
  );
}
