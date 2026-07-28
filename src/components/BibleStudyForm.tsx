"use client";

import {
  Button,
  Input,
  LocationField,
  Select,
  Textarea,
  TimeField,
  type LocationCoords,
} from "@/components/ui";
import {
  BIBLE_STUDY_STATUS_LABELS,
  EMPTY_BIBLE_STUDY_FORM,
  type BibleStudyFormData,
  type BibleStudyStatus,
  type Person,
} from "@/lib/types";
import { parseLessonNumber } from "@/lib/bible-study";
import { useState } from "react";

type Props = {
  people: Person[];
  initial?: Partial<BibleStudyFormData>;
  submitLabel?: string;
  onSubmit: (
    form: BibleStudyFormData,
    opts?: { allowDuplicate?: boolean }
  ) => Promise<void>;
  onCancel: () => void;
};

export function BibleStudyForm({
  people,
  initial,
  submitLabel = "Save Bible Study",
  onSubmit,
  onCancel,
}: Props) {
  const [form, setForm] = useState<BibleStudyFormData>({
    ...EMPTY_BIBLE_STUDY_FORM,
    first_study_date: new Date().toISOString().slice(0, 10),
    ...initial,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupConfirm, setDupConfirm] = useState(false);

  const update = <K extends keyof BibleStudyFormData>(
    key: K,
    value: BibleStudyFormData[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (allowDuplicate = false) => {
    setSaving(true);
    setError(null);
    try {
      // Keep lesson # / total / frequency in the payload for DB compatibility,
      // inferring number from the current lesson text when possible.
      const lessonNum =
        parseLessonNumber(form.current_lesson) ||
        form.current_lesson_number ||
        1;
      await onSubmit(
        {
          ...form,
          current_lesson_number: lessonNum,
          total_lessons: form.total_lessons || 60,
          study_frequency: form.study_frequency || "weekly",
        },
        { allowDuplicate }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save.";
      if (msg.startsWith("DUPLICATE_EVENT:")) {
        setDupConfirm(true);
        setError(msg.replace("DUPLICATE_EVENT: ", ""));
      } else {
        setError(msg);
      }
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Select
        label="Person"
        value={form.person_id}
        onChange={(e) => update("person_id", e.target.value)}
      >
        <option value="">Select person</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>

      <Input
        label="Study publication"
        value={form.publication}
        onChange={(e) => update("publication", e.target.value)}
        placeholder="Enjoy Life Forever!"
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Starting lesson"
          value={form.starting_lesson}
          onChange={(e) => update("starting_lesson", e.target.value)}
        />
        <Input
          label="Current lesson"
          value={form.current_lesson}
          onChange={(e) => update("current_lesson", e.target.value)}
        />
      </div>

      <Input
        label="Preferred day"
        value={form.preferred_day}
        onChange={(e) => update("preferred_day", e.target.value)}
        placeholder="Tuesday"
      />
      <TimeField
        label="Preferred time"
        value={form.preferred_time}
        onChange={(value) => update("preferred_time", value)}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="First study date"
          type="date"
          value={form.first_study_date}
          onChange={(e) => update("first_study_date", e.target.value)}
        />
        <Input
          label="Next study date"
          type="date"
          value={form.next_study_date}
          onChange={(e) => update("next_study_date", e.target.value)}
        />
      </div>

      <TimeField
        label="Next study time"
        value={form.next_study_time}
        onChange={(value) => update("next_study_time", value)}
      />

      <LocationField
        label="General location"
        value={form.general_location}
        onChange={(value) => update("general_location", value)}
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

      <Select
        label="Status"
        value={form.status}
        onChange={(e) => update("status", e.target.value as BibleStudyStatus)}
      >
        {(Object.keys(BIBLE_STUDY_STATUS_LABELS) as BibleStudyStatus[]).map(
          (k) => (
            <option key={k} value={k}>
              {BIBLE_STUDY_STATUS_LABELS[k]}
            </option>
          )
        )}
      </Select>

      <Textarea
        label="Preparation notes"
        value={form.preparation_notes}
        onChange={(e) => update("preparation_notes", e.target.value)}
      />
      <Textarea
        label="Private notes"
        value={form.private_notes}
        onChange={(e) => update("private_notes", e.target.value)}
      />

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {dupConfirm && (
        <div className="space-y-2 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <p className="text-sm text-amber-950">
            Continue only if this is genuinely a separate appointment.
          </p>
          <Button
            className="w-full"
            disabled={saving}
            onClick={() => void handleSubmit(true)}
          >
            Save anyway
          </Button>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          className="flex-1 bg-amber-700 hover:bg-amber-800"
          disabled={saving}
          onClick={() => void handleSubmit(false)}
        >
          {saving ? "Saving…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
