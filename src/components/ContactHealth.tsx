"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/lib/app-context";
import { Button, Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { formatDbError } from "@/lib/db-errors";
import { findDuplicatePairs } from "@/lib/person-match";
import { formatDisplayDate } from "@/lib/utils";

interface MergeRow {
  id: string;
  kept: string;
  merged: string;
  at: string;
}

/**
 * Reconciling what is already there, without deleting anything:
 *  - visits that were followed up (a later conversation, a Bible study begun…)
 *    but are still stored as "planned" get marked completed;
 *  - recent contact merges, each with Undo;
 *  - a pointer to the possible duplicate contacts on the People screen.
 */
export function ContactHealth() {
  const { user, people, returnVisits, activities, updateReturnVisit, undoMerge } =
    useApp();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [merges, setMerges] = useState<MergeRow[] | null>(null);

  // Stored as planned, but the schedule already treats them as followed up.
  const stale = useMemo(
    () =>
      returnVisits.filter(
        (rv) =>
          rv.status === "planned" &&
          activities.find((a) => a.return_visit_id === rv.id)?.state === "completed"
      ),
    [returnVisits, activities]
  );
  const pairs = useMemo(() => findDuplicatePairs(people), [people]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setError(formatDbError("tidy contacts", err, "Something went wrong."));
    } finally {
      setBusy(false);
    }
  };

  const tidyVisits = () =>
    run(async () => {
      const now = new Date().toISOString();
      for (const rv of stale) {
        await updateReturnVisit(rv.id, { status: "completed", completed_at: now });
      }
      setMessage(
        `${stale.length} visit${stale.length === 1 ? "" : "s"} marked completed.`
      );
    });

  const loadMerges = () =>
    run(async () => {
      if (!user) return;
      const supabase = createClient();
      const { data: logs, error: e1 } = await supabase
        .from("person_merges")
        .select("id, kept_person_id, merged_person_id, created_at")
        .eq("user_id", user.id)
        .is("undone_at", null)
        .order("created_at", { ascending: false })
        .limit(10);
      if (e1) throw e1;
      const ids = [
        ...new Set((logs ?? []).flatMap((l) => [l.kept_person_id, l.merged_person_id])),
      ];
      const { data: names, error: e2 } = ids.length
        ? await supabase.from("people").select("id, name").in("id", ids)
        : { data: [], error: null };
      if (e2) throw e2;
      const nameOf = (id: string) =>
        (names ?? []).find((n: { id: string; name: string }) => n.id === id)?.name ??
        "Contact";
      setMerges(
        (logs ?? []).map((l) => ({
          id: l.id,
          kept: nameOf(l.kept_person_id),
          merged: nameOf(l.merged_person_id),
          at: l.created_at,
        }))
      );
    });

  const undo = (row: MergeRow) =>
    run(async () => {
      await undoMerge(row.id);
      setMerges((prev) => (prev ?? []).filter((m) => m.id !== row.id));
      setMessage(`${row.merged} and ${row.kept} are separate contacts again.`);
    });

  return (
    <Card className="mt-3 space-y-3">
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-stone-900">Follow-ups already done</p>
        {stale.length === 0 ? (
          <p className="text-sm text-stone-500">
            No visits are stuck as overdue after being followed up.
          </p>
        ) : (
          <>
            <p className="text-sm text-stone-600">
              {stale.length} visit{stale.length === 1 ? " was" : "s were"} followed
              up (a later conversation or Bible study) but still{" "}
              {stale.length === 1 ? "is" : "are"} stored as planned. They no longer
              show as overdue; this marks them completed so the records agree.
            </p>
            <Button
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() => void tidyVisits()}
            >
              Mark {stale.length === 1 ? "it" : "them"} completed
            </Button>
          </>
        )}
      </div>

      <div className="space-y-1.5 border-t border-stone-100 pt-3">
        <p className="text-sm font-medium text-stone-900">Duplicate contacts</p>
        <p className="text-sm text-stone-600">
          {pairs.length === 0
            ? "No contacts look like the same person."
            : `${pairs.length} pair${pairs.length === 1 ? "" : "s"} of contacts may be the same person. You decide — nothing merges on its own.`}
        </p>
        {pairs.length > 0 && (
          <Link href="/people" className="block">
            <Button variant="secondary" className="w-full">
              Review on the People screen
            </Button>
          </Link>
        )}
      </div>

      <div className="space-y-1.5 border-t border-stone-100 pt-3">
        <p className="text-sm font-medium text-stone-900">Recent merges</p>
        {merges === null ? (
          <Button
            variant="secondary"
            className="w-full"
            disabled={busy}
            onClick={() => void loadMerges()}
          >
            Show recent merges
          </Button>
        ) : merges.length === 0 ? (
          <p className="text-sm text-stone-500">No merges to undo.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {merges.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 text-sm text-stone-700">
                  <span className="font-medium">{m.merged}</span> into{" "}
                  <span className="font-medium">{m.kept}</span>
                  <span className="block text-xs text-stone-400">
                    {formatDisplayDate(m.at.slice(0, 10))}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void undo(m)}
                >
                  Undo
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {message && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}
    </Card>
  );
}
