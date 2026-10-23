"use client";

import { useState, useRef } from "react";
import { useSingleFlight } from "@/hooks/useSingleFlight";
import { useSamePersonPrompt } from "@/hooks/useSamePersonPrompt";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import {
  Button,
  Input,
  LocationField,
  PageHeader,
  Select,
  Textarea,
  type LocationCoords,
} from "@/components/ui";
import { AreaField } from "@/components/AreaField";
import { MinistryDayPicker } from "@/components/MinistryDayPicker";
import { daysOf, type MinistryDay } from "@/lib/ministry-days";
import { INTEREST_LEVEL_ORDER } from "@/components/InterestBadge";
import { INTEREST_LABELS, type InterestLevel } from "@/lib/types";
import { todayISO } from "@/lib/utils";
import { formatDbError } from "@/lib/db-errors";

export default function NewPersonPage() {
  const { savePerson, areas, findOrCreateArea } = useApp();
  const guard = useSingleFlight();
  const { ask, dialog } = useSamePersonPrompt();
  // One id per form: saving again (retry or double tap) returns this same
  // person instead of creating another.
  const personId = useRef<string | null>(null);
  const router = useRouter();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [coords, setCoords] = useState<LocationCoords | null>(null);
  const [areaName, setAreaName] = useState("");
  const [days, setDays] = useState<MinistryDay[]>([]);
  const [phone, setPhone] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [firstMet, setFirstMet] = useState(todayISO());
  const [interest, setInterest] = useState<InterestLevel | "">("");
  const [theme, setTheme] = useState("");
  const [questions, setQuestions] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSave = async () => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    // Before creating anyone: is this a person who is already in the list?
    const decision = await ask(name.trim());
    if (decision.kind === "cancel") return;
    setSaving(true);
    try {
      const areaId = await findOrCreateArea(areaName);
      if (decision.kind === "existing") {
        // Same person: go to their profile instead of making a second one,
        // adding only details they don't have yet (never overwriting any).
        const existing = decision.person;
        const fill: Partial<typeof existing> = {};
        if (!existing.phone_number && phone) fill.phone_number = phone;
        if (!existing.general_location && location) fill.general_location = location;
        if (!existing.area_id && areaId) fill.area_id = areaId;
        if (days.length && daysOf(existing).length === 0) fill.ministry_days = days;
        if (Object.keys(fill).length) {
          await savePerson({ id: existing.id, name: existing.name, ...fill });
        }
        router.replace(`/people/${existing.id}`);
        return;
      }
      personId.current ??= crypto.randomUUID();
      const person = await savePerson(
        {
        name: name.trim(),
        general_location: location || null,
        location_lat: coords?.lat ?? null,
        location_lng: coords?.lng ?? null,
        area_id: areaId,
        ministry_days: days,
        phone_number: phone || null,
        preferred_contact_time: preferredTime || null,
        first_met_date: firstMet || todayISO(),
        interest_level: interest || "unknown",
        current_discussion_theme: theme || null,
        key_questions: questions || null,
        private_notes: notes || null,
        },
        {
          clientId: personId.current,
          confirmedDistinct: decision.kind === "different",
        }
      );
      router.replace(`/people/${person.id}`);
    } catch (err) {
      setError(
        err instanceof Error && err.message.startsWith("POSSIBLE_DUPLICATE_PERSON")
          ? "You already have someone with this name. Check People first, or save again and choose \"different person\"."
          : formatDbError("save person", err, "Could not save person.")
      );
      setSaving(false);
    }
  };

  const handleSave = () => guard(doSave);

  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader title="Add Person" subtitle="Create a private profile" />
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <LocationField
        value={location}
        onChange={setLocation}
        coords={coords}
        onCoordsChange={setCoords}
        placeholder="Near the pharmacy"
      />
      <AreaField value={areaName} onChange={setAreaName} areas={areas} />
      <MinistryDayPicker value={days} onChange={setDays} />
      <Input
        label="Phone number"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="0772 123456"
        hint="Used for the WhatsApp button on this person's profile."
      />
      <Input
        label="Preferred contact or visit time"
        value={preferredTime}
        onChange={(e) => setPreferredTime(e.target.value)}
      />
      <Input
        label="First met date"
        type="date"
        value={firstMet}
        onChange={(e) => setFirstMet(e.target.value)}
      />
      <Select
        label="Interest level"
        value={interest}
        onChange={(e) => setInterest(e.target.value as InterestLevel | "")}
      >
        <option value="">Not set</option>
        {INTEREST_LEVEL_ORDER.map((k) => (
          <option key={k} value={k}>
            {INTEREST_LABELS[k]}
          </option>
        ))}
      </Select>
      <Input
        label="Current discussion theme"
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
      />
      <Textarea
        label="Key questions"
        value={questions}
        onChange={(e) => setQuestions(e.target.value)}
      />
      <Textarea
        label="Private notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <Button className="w-full" disabled={saving} onClick={handleSave}>
        {saving ? "Saving…" : "Save Person"}
      </Button>
      <Button variant="ghost" className="w-full" onClick={() => router.back()}>
        Cancel
      </Button>
      {dialog}
    </div>
  );
}
