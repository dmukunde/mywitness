"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/lib/app-context";
import { Button, Card } from "@/components/ui";
import { MergeContactsSheet } from "@/components/MergeContactsSheet";
import { contactSummary } from "@/lib/person-merge";
import { findDuplicatePairs } from "@/lib/person-match";
import { IDLE_DAYS, suggestArchiving } from "@/lib/archive-suggestions";
import { formatDisplayDate, todayISO } from "@/lib/utils";
import { cn } from "@/lib/utils";

const SEEN_PAIRS_KEY = "mywitness-not-duplicates";
const SNOOZE_KEY = "mywitness-archive-snoozed";
const SNOOZE_DAYS = 30;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Remembering a dismissal is a convenience; never block on it.
  }
}

const pairKey = (a: string, b: string) => [a, b].sort().join("|");

/**
 * Keeps the contact list tidy without ever doing it for the user:
 *  - possible duplicates, to review and merge (or mark "not the same person")
 *  - contacts idle for 90 days, to archive (or keep)
 *  - the archived list, to restore from
 * Nothing here deletes anything; archiving and merging are both reversible.
 */
export function PeopleCare() {
  const {
    people,
    conversations,
    returnVisits,
    bibleStudies,
    studySessions,
    archivedPeople,
    personPhotos,
    archivePerson,
    restorePerson,
  } = useApp();
  const [notDuplicates, setNotDuplicates] = useState<string[]>(() =>
    read<string[]>(SEEN_PAIRS_KEY, [])
  );
  const [snoozed, setSnoozed] = useState<Record<string, string>>(() =>
    read<Record<string, string>>(SNOOZE_KEY, {})
  );
  const [merging, setMerging] = useState<{ keepId: string; otherId: string } | null>(
    null
  );
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = todayISO();

  const pairs = useMemo(
    () =>
      findDuplicatePairs(people).filter(
        (p) => !notDuplicates.includes(pairKey(p.a.id, p.b.id))
      ),
    [people, notDuplicates]
  );

  const suggestions = useMemo(
    () =>
      suggestArchiving({
        people,
        conversations,
        returnVisits,
        bibleStudies,
        studySessions,
        today,
      }).filter((s) => !snoozed[s.person.id] || snoozed[s.person.id] <= today),
    [people, conversations, returnVisits, bibleStudies, studySessions, today, snoozed]
  );

  // Offer to keep whichever of the two already has more history.
  const review = (a: string, b: string) => {
    const weight = (id: string) => {
      const c = contactSummary(id, {
        conversations,
        returnVisits,
        bibleStudies,
        personPhotos,
      });
      return c.conversations + c.visits + c.studies * 2 + c.photos;
    };
    const [keepId, otherId] = weight(b) > weight(a) ? [b, a] : [a, b];
    setMerging({ keepId, otherId });
  };

  const markNotSame = (a: string, b: string) => {
    const next = [...notDuplicates, pairKey(a, b)];
    setNotDuplicates(next);
    write(SEEN_PAIRS_KEY, next);
  };

  const keepForNow = (id: string) => {
    const until = new Date(Date.now() + SNOOZE_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const next = { ...snoozed, [id]: until };
    setSnoozed(next);
    write(SNOOZE_KEY, next);
  };

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch {
      setError("Something went wrong. Please try again.");
    }
  };

  // Keep rendering while the merge sheet is open: finishing a merge removes
  // the last duplicate, and the sheet still has its confirmation and Undo to show.
  if (!pairs.length && !suggestions.length && !archivedPeople.length && !merging) {
    return null;
  }

  return (
    <div className="space-y-3">
      {pairs.length > 0 && (
        <Card className="space-y-2 ring-amber-200/80">
          <p className="font-medium text-stone-900">
            {pairs.length === 1
              ? "1 possible duplicate contact"
              : `${pairs.length} possible duplicate contacts`}
          </p>
          <p className="text-xs text-stone-500">
            Only you can tell. Two people can share a name, so nothing is merged
            unless you choose to.
          </p>
          <ul className="divide-y divide-stone-100">
            {pairs.slice(0, 5).map(({ a, b, level }) => (
              <li key={pairKey(a.id, b.id)} className="space-y-2 py-2.5">
                <p className="text-sm text-stone-800">
                  <span className="font-medium">{a.name}</span> and{" "}
                  <span className="font-medium">{b.name}</span>
                  <span className="ml-1.5 text-xs text-stone-500">
                    {level === "exact" ? "same name" : "similar names"}
                  </span>
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => review(a.id, b.id)}
                  >
                    Review &amp; merge
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => markNotSame(a.id, b.id)}
                  >
                    Different people
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {pairs.length > 5 && (
            <p className="text-xs text-stone-500">
              …and {pairs.length - 5} more once these are sorted.
            </p>
          )}
        </Card>
      )}

      {suggestions.length > 0 && (
        <Card className="space-y-2">
          <p className="font-medium text-stone-900">
            {suggestions.length === 1
              ? `1 contact with no activity for ${IDLE_DAYS} days`
              : `${suggestions.length} contacts with no activity for ${IDLE_DAYS} days`}
          </p>
          <p className="text-xs text-stone-500">
            Archiving hides them from your lists. Their history is kept and you
            can restore them any time.
          </p>
          <ul className="divide-y divide-stone-100">
            {suggestions.slice(0, 5).map(({ person, lastActivity, idleDays }) => (
              <li key={person.id} className="space-y-2 py-2.5">
                <p className="text-sm text-stone-800">
                  <span className="font-medium">{person.name}</span>
                  <span className="ml-1.5 text-xs text-stone-500">
                    last activity {formatDisplayDate(lastActivity)} · {idleDays} days
                  </span>
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => void run(() => archivePerson(person.id))}
                  >
                    Archive
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1"
                    onClick={() => keepForNow(person.id)}
                  >
                    Keep for now
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {suggestions.length > 5 && (
            <p className="text-xs text-stone-500">
              …and {suggestions.length - 5} more.
            </p>
          )}
        </Card>
      )}

      {archivedPeople.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
            className="min-h-10 text-sm font-semibold text-stone-600 underline decoration-stone-300 underline-offset-2"
          >
            {showArchived ? "Hide" : "Show"} archived ({archivedPeople.length})
          </button>
          {showArchived && (
            <Card className="mt-2">
              <ul className="divide-y divide-stone-100">
                {archivedPeople.map((p) => (
                  <li
                    key={p.id}
                    className={cn("flex items-center justify-between gap-3 py-2.5")}
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-stone-800">
                      {p.name}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void run(() => restorePerson(p.id))}
                    >
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {merging && (
        <MergeContactsSheet
          keepId={merging.keepId}
          otherId={merging.otherId}
          onClose={() => setMerging(null)}
        />
      )}
    </div>
  );
}
