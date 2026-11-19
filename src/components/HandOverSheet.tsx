"use client";

import { useState } from "react";
import { addDays, format } from "date-fns";
import { Button, Input, Sheet } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { buildHandover, handoverLink, handoverMessage } from "@/lib/handover";
import { saveHandedOver } from "@/lib/handover-store";
import { copyText, shareText } from "@/lib/share";
import { todayISO } from "@/lib/utils";
import type { BibleStudy, Person } from "@/lib/types";

/**
 * Hand a study over to someone else for a while. Builds a link that carries
 * what they need (never the private notes) and opens the phone's Share menu
 * with a short message, ready to send.
 */
export function HandOverSheet({
  study,
  person,
  open,
  onClose,
}: {
  study: BibleStudy;
  person: Person;
  open: boolean;
  onClose: () => void;
}) {
  const { displayName } = useApp();
  const [to, setTo] = useState("");
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(format(addDays(new Date(), 14), "yyyy-MM-dd"));
  const [phone, setPhone] = useState(Boolean(person.phone_number));
  const hasPlace = Boolean(
    study.general_location || person.general_location || person.area?.name
  );
  const [place, setPlace] = useState(hasPlace);
  const [prep, setPrep] = useState(Boolean(study.preparation_notes));
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const share = async () => {
    if (!end || end < start) {
      setError("The last day can't be before the first day.");
      return;
    }
    setError(null);
    const handover = buildHandover(study, person, displayName, {
      to: to.trim() || null,
      start,
      end,
      include: { phone, place, prep },
    });
    const text = handoverMessage(handover, handoverLink(window.location.origin, handover));
    setMessage(text);
    saveHandedOver(study.id, { to: handover.to, start, end });
    await shareText(text);
  };

  const copy = async () => {
    if (message) setCopied(await copyText(message));
  };

  const choice = (label: string, on: boolean, set: (v: boolean) => void, disabled = false) => (
    <label className="flex items-center gap-3 py-1.5 text-sm text-stone-800">
      <input
        type="checkbox"
        className="h-5 w-5 accent-emerald-700"
        checked={on && !disabled}
        disabled={disabled}
        onChange={(e) => set(e.target.checked)}
      />
      {label}
    </label>
  );

  return (
    <Sheet
      open={open}
      title="Hand over this study"
      subtitle={`Bible study with ${person.name}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <Input
          label="Who is covering it? (optional)"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          maxLength={80}
          placeholder="For example: Ruth"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input label="From" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <Input label="Until" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div>
          <p className="text-sm font-medium text-stone-700">What should they get?</p>
          <p className="text-xs text-stone-500">
            The name and the lesson are always included. Your private notes never are.
          </p>
          <div className="mt-1">
            {choice(
              person.phone_number ? "Phone number" : "Phone number (none saved)",
              phone,
              setPhone,
              !person.phone_number
            )}
            {choice(
              hasPlace ? "Where to find them" : "Where to find them (none saved)",
              place,
              setPlace,
              !hasPlace
            )}
            {choice(
              study.preparation_notes
                ? "Your preparation notes"
                : "Your preparation notes (none saved)",
              prep,
              setPrep,
              !study.preparation_notes
            )}
          </div>
        </div>
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          The link holds {person.name}&apos;s details. Only send it to the person who will
          cover the study, and not to a group. Anyone who has the link can read it.
        </p>
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <Button className="w-full" onClick={() => void share()}>
          Share handover
        </Button>
        {message && (
          <div className="space-y-2 rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
            <p>
              Ready to send. If your messages did not open, copy it and send it yourself.
            </p>
            <Button variant="secondary" size="sm" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy the message"}
            </Button>
          </div>
        )}
        <Button variant="ghost" className="w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </Sheet>
  );
}
