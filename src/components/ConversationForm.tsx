"use client";

import { useState } from "react";
import {
  Button,
  Input,
  LocationField,
  Select,
  Textarea,
  type LocationCoords,
} from "@/components/ui";
import { InterestBadge, INTEREST_LEVEL_ORDER } from "@/components/InterestBadge";
import {
  EMPTY_CONVERSATION_FORM,
  INTEREST_LABELS,
  type ConversationFormData,
  type InterestLevel,
  type Person,
} from "@/lib/types";

interface ConversationFormProps {
  initial?: Partial<ConversationFormData>;
  people?: Person[];
  uncertainFields?: string[];
  submitLabel?: string;
  onSubmit: (form: ConversationFormData, schedule: boolean) => Promise<void>;
  onCancel: () => void;
}

export function ConversationForm({
  initial,
  people = [],
  uncertainFields = [],
  submitLabel = "Save",
  onSubmit,
  onCancel,
}: ConversationFormProps) {
  const [form, setForm] = useState<ConversationFormData>({
    ...EMPTY_CONVERSATION_FORM,
    ...initial,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof ConversationFormData>(
    key: K,
    value: ConversationFormData[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const hint = (field: string) =>
    uncertainFields.includes(field) ? "Please confirm." : undefined;

  const handleSave = async (schedule: boolean) => {
    if (!form.person_name.trim() && !form.person_id) {
      setError("Please enter a name or select a person.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Always schedule when a follow-up date exists (core ministry workflow)
      const shouldSchedule =
        schedule || Boolean(form.promised_follow_up_date.trim());
      await onSubmit(
        {
          ...form,
          person_name:
            form.person_name ||
            people.find((p) => p.id === form.person_id)?.name ||
            "",
          schedule_return_visit: shouldSchedule,
        },
        shouldSchedule
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {form.transcript && (
        <details className="rounded-2xl bg-stone-50 p-3 text-sm text-stone-600">
          <summary className="cursor-pointer font-medium text-stone-700">
            View transcript
          </summary>
          <p className="mt-2 whitespace-pre-wrap">{form.transcript}</p>
        </details>
      )}

      {form.summary && (
        <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200/80">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Summary
          </p>
          <Textarea
            className="mt-2 bg-white"
            value={form.summary}
            onChange={(e) => update("summary", e.target.value)}
            hint={hint("summary")}
          />
        </div>
      )}

      <Select
        label="Existing person (optional)"
        value={form.person_id}
        onChange={(e) => {
          const id = e.target.value;
          const person = people.find((p) => p.id === id);
          setForm((prev) => ({
            ...prev,
            person_id: id,
            person_name: person?.name || prev.person_name,
            // Person profile is the source of truth for interest.
            interest_level: person?.interest_level || prev.interest_level || "",
          }));
        }}
      >
        <option value="">New person</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>

      <Input
        label="Person's name"
        value={form.person_name}
        onChange={(e) => update("person_name", e.target.value)}
        hint={hint("person_name")}
        required
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Date"
          type="date"
          value={form.conversation_date}
          onChange={(e) => update("conversation_date", e.target.value)}
          hint={hint("conversation_date")}
        />
        <Input
          label="Approximate time"
          value={form.approximate_time}
          onChange={(e) => update("approximate_time", e.target.value)}
          placeholder="Afternoon"
          hint={hint("approximate_time")}
        />
      </div>

      <LocationField
        label="General location"
        value={form.general_location}
        onChange={(value) => update("general_location", value)}
        placeholder="Near the pharmacy"
        hint={hint("general_location")}
        coords={
          form.location_lat != null && form.location_lng != null
            ? { lat: form.location_lat, lng: form.location_lng }
            : null
        }
        onCoordsChange={(next: LocationCoords | null) => {
          update("location_lat", next?.lat ?? null);
          update("location_lng", next?.lng ?? null);
        }}
      />

      <Input
        label="How the person was met"
        value={form.how_met}
        onChange={(e) => update("how_met", e.target.value)}
        hint={hint("how_met")}
      />

      <Input
        label="Main topic discussed"
        value={form.main_topic}
        onChange={(e) => update("main_topic", e.target.value)}
        hint={hint("main_topic")}
      />

      <Input
        label="Scriptures discussed"
        value={form.scriptures}
        onChange={(e) => update("scriptures", e.target.value)}
        placeholder="James 1:13; Revelation 21:3, 4"
        hint={hint("scriptures")}
      />

      <Textarea
        label="Questions the person asked"
        value={form.questions_asked}
        onChange={(e) => update("questions_asked", e.target.value)}
        hint={hint("questions_asked")}
      />

      <Textarea
        label="Concerns or circumstances"
        value={form.concerns_circumstances}
        onChange={(e) => update("concerns_circumstances", e.target.value)}
        hint={hint("concerns_circumstances")}
      />

      <Input
        label="Publications or videos shared"
        value={form.publications_shared}
        onChange={(e) => update("publications_shared", e.target.value)}
        hint={hint("publications_shared")}
      />

      <Select
        label="Interest level"
        value={form.interest_level}
        onChange={(e) =>
          update("interest_level", e.target.value as InterestLevel | "")
        }
      >
        <option value="">Not set</option>
        {INTEREST_LEVEL_ORDER.map((key) => (
          <option key={key} value={key}>
            {INTEREST_LABELS[key]}
          </option>
        ))}
      </Select>
      {form.interest_level ? (
        <div className="-mt-2">
          <InterestBadge level={form.interest_level} />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Follow-up date"
          type="date"
          value={form.promised_follow_up_date}
          onChange={(e) => update("promised_follow_up_date", e.target.value)}
          hint={hint("promised_follow_up_date")}
        />
        <Input
          label="Follow-up time"
          value={form.promised_follow_up_time}
          onChange={(e) => update("promised_follow_up_time", e.target.value)}
          placeholder="Afternoon"
          hint={hint("promised_follow_up_time")}
        />
      </div>

      <Input
        label="Next topic to discuss"
        value={form.next_topic}
        onChange={(e) => update("next_topic", e.target.value)}
        hint={hint("next_topic")}
      />

      <Textarea
        label="Action required before next visit"
        value={form.action_required}
        onChange={(e) => update("action_required", e.target.value)}
        hint={hint("action_required")}
      />

      <Textarea
        label="Next visit preparation"
        value={form.next_visit_preparation}
        onChange={(e) => update("next_visit_preparation", e.target.value)}
        hint={hint("next_visit_preparation")}
      />

      <Textarea
        label="Additional notes"
        value={form.additional_notes}
        onChange={(e) => update("additional_notes", e.target.value)}
        hint={hint("additional_notes")}
      />

      {form.source === "voice" && (
        <label className="flex items-center gap-3 rounded-xl bg-stone-50 px-3 py-3 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={form.keep_audio}
            onChange={(e) => update("keep_audio", e.target.checked)}
            className="h-4 w-4 rounded border-stone-300 text-emerald-700"
          />
          Keep audio recording after transcription
        </label>
      )}

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="sticky bottom-20 space-y-2 border-t border-stone-100 bg-[#f4f7f5]/95 pt-3 backdrop-blur">
        <Button
          className="w-full"
          disabled={saving}
          onClick={() => handleSave(Boolean(form.promised_follow_up_date.trim()))}
        >
          {saving
            ? "Saving…"
            : form.promised_follow_up_date
              ? "Save & schedule return visit"
              : submitLabel}
        </Button>
        {form.promised_follow_up_date && (
          <Button
            variant="secondary"
            className="w-full"
            disabled={saving}
            onClick={() => handleSave(false)}
          >
            Save without scheduling
          </Button>
        )}
        <Button variant="ghost" className="w-full" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
