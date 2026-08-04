"use client";

import { useState } from "react";
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
import { INTEREST_LEVEL_ORDER } from "@/components/InterestBadge";
import { INTEREST_LABELS, type InterestLevel } from "@/lib/types";
import { todayISO } from "@/lib/utils";

export default function NewPersonPage() {
  const { savePerson, areas, findOrCreateArea } = useApp();
  const router = useRouter();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [coords, setCoords] = useState<LocationCoords | null>(null);
  const [areaName, setAreaName] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [firstMet, setFirstMet] = useState(todayISO());
  const [interest, setInterest] = useState<InterestLevel | "">("");
  const [theme, setTheme] = useState("");
  const [questions, setQuestions] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    try {
      const areaId = await findOrCreateArea(areaName);
      const person = await savePerson({
        name: name.trim(),
        general_location: location || null,
        location_lat: coords?.lat ?? null,
        location_lng: coords?.lng ?? null,
        area_id: areaId,
        phone_number: phone || null,
        preferred_contact_time: preferredTime || null,
        first_met_date: firstMet || todayISO(),
        interest_level: interest || "unknown",
        current_discussion_theme: theme || null,
        key_questions: questions || null,
        private_notes: notes || null,
      });
      router.replace(`/people/${person.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save person.");
      setSaving(false);
    }
  };

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
    </div>
  );
}
