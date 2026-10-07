"use client";

import { useState } from "react";
import { Card, Button, ConfirmDialog } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { formatDbError } from "@/lib/db-errors";
import { planIsEmpty, type CleanupPlan } from "@/lib/duplicates";
import {
  applyCleanupPlan,
  scanForDuplicates,
  type CleanupResult,
} from "@/lib/duplicate-cleanup";
import { formatDisplayDate } from "@/lib/utils";

export function DuplicateCleanup() {
  const { user, people, refresh } = useApp();
  const [plan, setPlan] = useState<CleanupPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<CleanupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name || "Person";

  const scan = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      setPlan(await scanForDuplicates(createClient(), user.id));
    } catch (err) {
      setError(formatDbError("scan duplicates", err, "Could not check for duplicates."));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!user || !plan) return;
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      const result = await applyCleanupPlan(createClient(), user.id, plan);
      await refresh();
      setDone(result);
      setPlan(await scanForDuplicates(createClient(), user.id));
    } catch (err) {
      setError(formatDbError("clean duplicates", err, "Could not finish cleaning up."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <p className="text-sm text-stone-600">
        If a person or a scheduled visit shows up more than once, this finds
        the repeats and tidies them. You&rsquo;ll see exactly what it found
        before anything changes.
      </p>

      <Button
        variant="secondary"
        className="w-full"
        onClick={() => void scan()}
        disabled={busy}
      >
        {busy ? "Working…" : "Check for duplicates"}
      </Button>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {done && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Done — {done.peopleMerged} duplicate{" "}
          {done.peopleMerged === 1 ? "person" : "people"} merged,{" "}
          {done.visitsCancelled} repeated visit
          {done.visitsCancelled === 1 ? "" : "s"} cancelled,{" "}
          {done.conversationsRemoved} repeated conversation
          {done.conversationsRemoved === 1 ? "" : "s"} removed,{" "}
          {done.eventsRemoved} extra calendar cop
          {done.eventsRemoved === 1 ? "y" : "ies"} removed.
        </p>
      )}

      {plan && planIsEmpty(plan) && !done && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          No duplicates found.
        </p>
      )}

      {plan && !planIsEmpty(plan) && (
        <div className="space-y-3 text-sm text-stone-700">
          {plan.people.length > 0 && (
            <div>
              <p className="font-medium text-stone-900">
                People entered more than once
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {plan.people.map((g) => (
                  <li key={g.canonical.id}>
                    {g.name} — {g.duplicates.length + 1} entries created within
                    the hour; merged into one
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.visits.length > 0 && (
            <div>
              <p className="font-medium text-stone-900">
                Visits scheduled more than once
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {plan.visits.map((g) => (
                  <li key={g.canonical.id}>
                    {nameOf(g.canonical.person_id)} ·{" "}
                    {formatDisplayDate(g.canonical.scheduled_date)}
                    {g.canonical.scheduled_time ? ` · ${g.canonical.scheduled_time}` : ""}{" "}
                    — {g.duplicates.length + 1} copies; keeping 1
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.conversations.length > 0 && (
            <div>
              <p className="font-medium text-stone-900">
                Identical conversations saved twice
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {plan.conversations.map((g) => (
                  <li key={g.canonical.id}>
                    {g.canonical.person_id ? nameOf(g.canonical.person_id) : "Person"}{" "}
                    · {formatDisplayDate(g.canonical.conversation_date)} —{" "}
                    {g.duplicates.length + 1} identical copies; keeping 1
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.extraEvents > 0 && (
            <p>
              {plan.extraEvents} extra calendar cop
              {plan.extraEvents === 1 ? "y" : "ies"} of visits that are already
              on your calendar.
            </p>
          )}
          <p className="text-xs text-stone-500">
            Nothing from your history is lost: a repeated person is merged into
            the entry with the most history (their visits, studies, photos and
            conversations move across) and the extra entry is hidden, not
            deleted. Completed visits are never touched. Tip: download a backup
            first, from Backup &amp; Restore above.
          </p>
          <Button
            className="w-full"
            onClick={() => setConfirming(true)}
            disabled={busy}
          >
            Clean up these duplicates
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title="Clean up duplicates?"
        message="Repeated people are merged into one (nothing is deleted from their history), repeated scheduled visits are cancelled, and exact-copy conversations and extra calendar copies are removed."
        confirmLabel="Clean up"
        onConfirm={() => void apply()}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  );
}
