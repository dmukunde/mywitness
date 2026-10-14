"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useApp } from "@/lib/app-context";
import { SamePersonPrompt } from "@/components/SamePersonPrompt";
import { findPersonMatches, type PersonMatch } from "@/lib/person-match";
import type { ConversationFormData, Person } from "@/lib/types";

/** What the user decided when asked "is this the same person?". */
export type PersonDecision =
  | { kind: "new" } // nobody similar exists — go ahead
  | { kind: "different" } // someone similar exists, but this is a different person
  | { kind: "existing"; person: Person } // link to this existing contact
  | { kind: "cancel" }; // go back and edit

/**
 * Asks "is this the same person?" before a new contact is created.
 * `ask(name)` resolves immediately when nobody similar exists, otherwise it
 * shows the prompt and resolves with the user's answer. Render `dialog`
 * somewhere in the page.
 */
export function useSamePersonPrompt(): {
  ask: (name: string) => Promise<PersonDecision>;
  dialog: ReactNode;
} {
  const { people } = useApp();
  const [pending, setPending] = useState<{
    name: string;
    matches: PersonMatch[];
    resolve: (d: PersonDecision) => void;
  } | null>(null);

  const ask = useCallback(
    (name: string) => {
      const matches = findPersonMatches(people, name);
      if (!matches.length) {
        return Promise.resolve<PersonDecision>({ kind: "new" });
      }
      return new Promise<PersonDecision>((resolve) =>
        setPending({ name, matches, resolve })
      );
    },
    [people]
  );

  const answer = (d: PersonDecision) => {
    pending?.resolve(d);
    setPending(null);
  };

  const dialog = pending ? (
    <SamePersonPrompt
      name={pending.name}
      matches={pending.matches}
      onUseExisting={(person) => answer({ kind: "existing", person })}
      onDifferent={() => answer({ kind: "different" })}
      onCancel={() => answer({ kind: "cancel" })}
    />
  ) : null;

  return { ask, dialog };
}

/**
 * Applies the answer to a conversation about a person who was typed in by
 * name: an existing person is linked (no new contact), a "different person"
 * is marked so the database allows the same-named contact. Returns null if the
 * user chose to go back.
 */
export function applyPersonDecision(
  form: ConversationFormData,
  decision: PersonDecision
): ConversationFormData | null {
  switch (decision.kind) {
    case "cancel":
      return null;
    case "existing":
      return {
        ...form,
        person_id: decision.person.id,
        person_name: decision.person.name,
      };
    case "different":
      return { ...form, person_confirmed_distinct: true };
    default:
      return form;
  }
}
