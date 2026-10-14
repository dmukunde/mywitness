"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/lib/app-context";
import { Button, Sheet } from "@/components/ui";
import { useSingleFlight } from "@/hooks/useSingleFlight";
import { formatDbError } from "@/lib/db-errors";
import { compareNames } from "@/lib/person-match";
import { contactSummary } from "@/lib/person-merge";
import type { Person } from "@/lib/types";

type Step = "pick" | "review" | "done" | "undone";

/**
 * Merge two contacts into one. The user chooses which profile to keep, sees
 * exactly what will move, and can undo it afterwards. Nothing is deleted: the
 * merged contact is hidden, and the database records what moved.
 */
export function MergeContactsSheet({
  keepId,
  otherId,
  onClose,
  onMerged,
  allowSwap = true,
}: {
  /** The contact to start from (the one whose profile is open, or one of a pair). */
  keepId: string;
  /** If known (a suggested pair), skips straight to the review. */
  otherId?: string;
  onClose: () => void;
  /** Called with the id of the profile that now holds everything. */
  onMerged?: (keptId: string) => void;
  /**
   * Whether the user may flip which profile is kept. Off when opened from a
   * profile page, so that page is never the one that disappears.
   */
  allowSwap?: boolean;
}) {
  const {
    people,
    conversations,
    returnVisits,
    bibleStudies,
    personPhotos,
    mergePeople,
    undoMerge,
  } = useApp();
  const guard = useSingleFlight();
  const [keep, setKeep] = useState(keepId);
  const [other, setOther] = useState<string | null>(otherId ?? null);
  const [step, setStep] = useState<Step>(otherId ? "review" : "pick");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logId, setLogId] = useState<string | null>(null);
  // The merged contact leaves the People list, so remember who was who.
  const [names, setNames] = useState<{ keep: string; other: string } | null>(null);

  const byId = (id: string | null) => people.find((p) => p.id === id) ?? null;
  const keepPerson = byId(keep);
  const otherPerson = byId(other);

  // Other contacts to choose from: people with a similar name first.
  const candidates = useMemo(() => {
    const me = people.find((p) => p.id === keepId);
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => p.id !== keepId && !p.archived_at)
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .map((p) => ({
        person: p,
        similar: me ? compareNames(me.name, p.name) !== null : false,
      }))
      .sort(
        (a, b) =>
          Number(b.similar) - Number(a.similar) ||
          a.person.name.localeCompare(b.person.name)
      );
  }, [people, keepId, query]);

  const summary = (p: Person) =>
    contactSummary(p.id, { conversations, returnVisits, bibleStudies, personPhotos });

  // Identical still-planned visits would be a double appointment: they are kept once.
  const clashes =
    keepPerson && otherPerson
      ? returnVisits.filter(
          (rv) =>
            rv.person_id === otherPerson.id &&
            rv.status === "planned" &&
            returnVisits.some(
              (k) =>
                k.person_id === keepPerson.id &&
                k.status === "planned" &&
                k.scheduled_date === rv.scheduled_date &&
                (k.scheduled_time || "") === (rv.scheduled_time || "")
            )
        ).length
      : 0;

  const doMerge = async () => {
    if (!keepPerson || !otherPerson) return;
    setBusy(true);
    setError(null);
    setNames({ keep: keepPerson.name, other: otherPerson.name });
    try {
      const id = await mergePeople(keepPerson.id, otherPerson.id);
      setLogId(id);
      setStep("done");
      onMerged?.(keepPerson.id);
    } catch (err) {
      setError(
        formatDbError("merge contacts", err, "Could not merge these contacts.")
      );
    } finally {
      setBusy(false);
    }
  };

  const doUndo = async () => {
    if (!logId) return;
    setBusy(true);
    setError(null);
    try {
      await undoMerge(logId);
      setStep("undone");
    } catch (err) {
      setError(formatDbError("undo merge", err, "Could not undo the merge."));
    } finally {
      setBusy(false);
    }
  };

  const errorBox = error && (
    <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
  );

  if (step === "pick") {
    return (
      <Sheet
        open
        title={`Merge ${keepPerson?.name ?? "contact"} with…`}
        subtitle="Choose the other entry for the same person. You'll review before anything changes."
        onClose={onClose}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search contacts…"
          aria-label="Search contacts"
          className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
        />
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {candidates.length === 0 && (
            <li className="px-1 py-2 text-sm text-stone-500">No other contacts.</li>
          )}
          {candidates.map(({ person, similar }) => (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => {
                  setOther(person.id);
                  setStep("review");
                }}
                className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl bg-stone-50 px-3.5 py-2 text-left ring-1 ring-stone-200/80 transition hover:bg-stone-100"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-stone-900">
                    {person.name}
                  </span>
                  <span className="block truncate text-xs text-stone-500">
                    {person.area?.name || person.general_location || "No location"}
                  </span>
                </span>
                {similar && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                    Similar name
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <Button variant="ghost" className="w-full" onClick={onClose}>
          Cancel
        </Button>
      </Sheet>
    );
  }

  if (step === "done" || step === "undone") {
    return (
      <Sheet
        open
        title={step === "done" ? "Contacts merged" : "Merge undone"}
        onClose={onClose}
      >
        <p className="text-sm text-stone-600">
          {step === "done"
            ? `${names?.other}'s conversations, visits, Bible studies and photos are now on ${names?.keep}'s profile. ${names?.other} is hidden, not deleted.`
            : `${names?.other} and ${names?.keep} are separate contacts again, with everything back where it was.`}
        </p>
        {errorBox}
        {step === "done" && (
          <Button
            variant="secondary"
            className="w-full"
            disabled={busy}
            onClick={() => guard(doUndo)}
          >
            {busy ? "Undoing…" : "Undo this merge"}
          </Button>
        )}
        <Button className="w-full" onClick={onClose}>
          Done
        </Button>
      </Sheet>
    );
  }

  // review
  if (!keepPerson || !otherPerson) {
    return (
      <Sheet open title="Contact not found" onClose={onClose}>
        <Button className="w-full" onClick={onClose}>
          Close
        </Button>
      </Sheet>
    );
  }
  const k = summary(keepPerson);
  const o = summary(otherPerson);
  const line = (s: ReturnType<typeof summary>) =>
    [
      `${s.conversations} conversation${s.conversations === 1 ? "" : "s"}`,
      `${s.visits} visit${s.visits === 1 ? "" : "s"}`,
      `${s.studies} Bible stud${s.studies === 1 ? "y" : "ies"}`,
      s.photos ? `${s.photos} photo${s.photos === 1 ? "" : "s"}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <Sheet
      open
      title="Merge these contacts?"
      subtitle="Review what will happen. Nothing is deleted, and you can undo it."
      onClose={onClose}
    >
      <div className="space-y-2 rounded-2xl bg-emerald-50 p-3.5 ring-1 ring-emerald-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
          Keep this profile
        </p>
        <p className="font-medium text-stone-900">{keepPerson.name}</p>
        <p className="text-sm text-stone-600">{line(k)}</p>
      </div>
      <div className="space-y-2 rounded-2xl bg-stone-50 p-3.5 ring-1 ring-stone-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Move into it, then hide
        </p>
        <p className="font-medium text-stone-900">{otherPerson.name}</p>
        <p className="text-sm text-stone-600">{line(o)}</p>
      </div>
      {allowSwap && (
        <button
          type="button"
          onClick={() => {
            setKeep(otherPerson.id);
            setOther(keepPerson.id);
          }}
          className="min-h-10 w-full rounded-xl text-sm font-semibold text-emerald-800 underline decoration-emerald-200 underline-offset-2"
        >
          Keep {otherPerson.name}&rsquo;s profile instead
        </button>
      )}
      <p className="text-sm text-stone-600">
        Everything from {otherPerson.name} moves to {keepPerson.name}. Details{" "}
        {keepPerson.name} is missing (phone, location…) are filled in from{" "}
        {otherPerson.name}; where both have notes, both are kept.
        {clashes > 0 &&
          ` ${clashes} identical planned visit${clashes === 1 ? "" : "s"} will be kept only once.`}
      </p>
      {errorBox}
      <Button
        className="w-full"
        disabled={busy}
        onClick={() => guard(doMerge)}
      >
        {busy ? "Merging…" : `Merge into ${keepPerson.name}`}
      </Button>
      <Button variant="ghost" className="w-full" disabled={busy} onClick={onClose}>
        Cancel
      </Button>
    </Sheet>
  );
}
