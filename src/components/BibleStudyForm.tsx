"use client";

import { Button, Input, Select, Textarea } from "@/components/ui";
import {
  BIBLE_STUDY_STATUS_LABELS,
  EMPTY_BIBLE_STUDY_FORM,
  STUDY_FREQUENCY_LABELS,
  type BibleStudyFormData,
  type BibleStudyStatus,
  type Person,
  type StudyFrequency,
} from "@/lib/types";
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
      await onSubmit(form, { allowDuplicate });
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
        label="Study publication or material"
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

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Current lesson #"
          type="number"
          min={0}
          value={form.current_lesson_number}
          onChange={(e) =>
            update("current_lesson_number", Number(e.target.value) || 0)
          }
        />
        <Input
          label="Total lessons"
          type="number"
          min={1}
          value={form.total_lessons}
          onChange={(e) =>
            update("total_lessons", Number(e.target.value) || 1)
          }
        />
      </div>

      <Select
        label="Study frequency"
        value={form.study_frequency}
        onChange={(e) =>
          update("study_frequency", e.target.value as StudyFrequency)
        }
      >
        {(Object.keys(STUDY_FREQUENCY_LABELS) as StudyFrequency[]).map((k) => (
          <option key={k} value={k}>
            {STUDY_FREQUENCY_LABELS[k]}
          </option>
        ))}
      </Select>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Preferred day"
          value={form.preferred_day}
          onChange={(e) => update("preferred_day", e.target.value)}
          placeholder="Tuesday"
        />
        <Input
          label="Preferred time"
          value={form.preferred_time}
          onChange={(e) => update("preferred_time", e.target.value)}
          placeholder="10:00 AM"
        />
      </div>

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

      <Input
        label="Next study time"
        value={form.next_study_time}
        onChange={(e) => update("next_study_time", e.target.value)}
        placeholder="10:00 AM"
      />

      <Input
        label="General location"
        value={form.general_location}
        onChange={(e) => update("general_location", e.target.value)}
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
