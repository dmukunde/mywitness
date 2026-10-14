"use client";

import { useMemo } from "react";
import { useApp } from "@/lib/app-context";
import { Button, Sheet } from "@/components/ui";
import { INTEREST_LABELS, type Person } from "@/lib/types";
import type { PersonMatch } from "@/lib/person-match";
import { formatDisplayDate } from "@/lib/utils";

/**
 * "You already have someone named Ronald. Is this the same person?"
 *
 * Shows enough about each existing contact to decide, then asks. Choosing an
 * existing person links the new activity to their profile instead of creating
 * another contact; "different person" is the only way a second contact with
 * the same name gets made.
 */
export function SamePersonPrompt({
  name,
  matches,
  onUseExisting,
  onDifferent,
  onCancel,
}: {
  name: string;
  matches: PersonMatch[];
  onUseExisting: (person: Person) => void;
  onDifferent: () => void;
  onCancel: () => void;
}) {
  const { conversations, returnVisits, bibleStudies } = useApp();

  const details = useMemo(
    () =>
      new Map(
        matches.map(({ person }) => {
          const convs = conversations
            .filter((c) => c.person_id === person.id)
            .map((c) => c.conversation_date)
            .sort();
          const visits = returnVisits.filter(
            (r) => r.person_id === person.id && r.status !== "cancelled"
          );
          const studies = bibleStudies.filter((s) => s.person_id === person.id);
          return [
            person.id,
            {
              lastContact: convs.at(-1) ?? null,
              conversations: convs.length,
              visits: visits.length,
              studies: studies.length,
            },
          ] as const;
        })
      ),
    [matches, conversations, returnVisits, bibleStudies]
  );

  const exact = matches.some((m) => m.level === "exact");
  const single = matches.length === 1;
  const title = single
    ? exact
      ? `You already have someone named ${matches[0].person.name}`
      : `You already have someone with a similar name: ${matches[0].person.name}`
    : `You already have ${matches.length} people with ${
        exact ? "that name or " : ""
      }a similar name`;

  return (
    <Sheet
      open
      title={title}
      subtitle={
        single
          ? `Is this the same person you are adding as “${name}”?`
          : `Is one of them the person you are adding as “${name}”?`
      }
      onClose={onCancel}
    >
      {matches.map(({ person, level }) => {
        const d = details.get(person.id)!;
        const place = person.area?.name || person.general_location;
        const facts = [
          d.conversations
            ? `${d.conversations} conversation${d.conversations === 1 ? "" : "s"}`
            : null,
          d.visits ? `${d.visits} return visit${d.visits === 1 ? "" : "s"}` : null,
          d.studies ? "Bible study" : null,
        ].filter(Boolean);
        return (
          <div
            key={person.id}
            className="space-y-2 rounded-2xl bg-stone-50 p-3.5 ring-1 ring-stone-200/80"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-stone-900">{person.name}</p>
              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-stone-500 ring-1 ring-stone-200">
                {level === "exact" ? "Same name" : "Similar name"}
              </span>
            </div>
            <ul className="space-y-0.5 text-sm text-stone-600">
              {place && <li>{place}</li>}
              {person.interest_level && person.interest_level !== "unknown" && (
                <li>Interest: {INTEREST_LABELS[person.interest_level]}</li>
              )}
              <li>
                {d.lastContact
                  ? `Last contact: ${formatDisplayDate(d.lastContact)}`
                  : `Added ${formatDisplayDate(person.created_at.slice(0, 10))}`}
              </li>
              {facts.length > 0 && <li>{facts.join(" · ")}</li>}
            </ul>
            <Button
              className="w-full"
              onClick={() => onUseExisting(person)}
            >
              Yes, use {person.name}
            </Button>
          </div>
        );
      })}
      <Button variant="secondary" className="w-full" onClick={onDifferent}>
        No, this is a different person
      </Button>
      <Button variant="ghost" className="w-full" onClick={onCancel}>
        Go back
      </Button>
    </Sheet>
  );
}
