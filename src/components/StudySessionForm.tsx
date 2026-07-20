"use client";

import { useState } from "react";
import { Button, Input, Textarea } from "@/components/ui";
import {
  EMPTY_STUDY_SESSION_FORM,
  type BibleStudySessionFormData,
} from "@/lib/types";

type Props = {
  initial?: Partial<BibleStudySessionFormData>;
  submitLabel?: string;
  onSubmit: (form: BibleStudySessionFormData) => Promise<void>;
  onCancel: () => void;
};

export function StudySessionForm({
  initial,
  submitLabel = "Save session",
  onSubmit,
  onCancel,
}: Props) {
  const [form, setForm] = useState<BibleStudySessionFormData>({
    ...EMPTY_STUDY_SESSION_FORM,
    ...initial,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof BibleStudySessionFormData>(
    key: K,
    value: BibleStudySessionFormData[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

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

      <Input
        label="Session date"
        type="date"
        value={form.session_date}
        onChange={(e) => update("session_date", e.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Start lesson / section"
          value={form.start_lesson}
          onChange={(e) => update("start_lesson", e.target.value)}
        />
        <Input
          label="End lesson / section"
          value={form.end_lesson}
          onChange={(e) => update("end_lesson", e.target.value)}
        />
      </div>
      <Input
        label="Topics discussed"
        value={form.topics_discussed}
        onChange={(e) => update("topics_discussed", e.target.value)}
      />
      <Input
        label="Scriptures discussed"
        value={form.scriptures_discussed}
        onChange={(e) => update("scriptures_discussed", e.target.value)}
        hint="Separate with semicolons"
      />
      <Textarea
        label="Questions raised"
        value={form.questions_raised}
        onChange={(e) => update("questions_raised", e.target.value)}
      />
      <Input
        label="Material completed"
        value={form.material_completed}
        onChange={(e) => update("material_completed", e.target.value)}
      />
      <Textarea
        label="Homework / preparation agreed"
        value={form.homework}
        onChange={(e) => update("homework", e.target.value)}
      />
      <Input
        label="Next lesson / section"
        value={form.next_lesson}
        onChange={(e) => update("next_lesson", e.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Next scheduled study"
          type="date"
          value={form.next_scheduled_date}
          onChange={(e) => update("next_scheduled_date", e.target.value)}
        />
        <Input
          label="Next study time"
          value={form.next_scheduled_time}
          onChange={(e) => update("next_scheduled_time", e.target.value)}
        />
      </div>
      <Textarea
        label="Personal preparation notes"
        value={form.preparation_notes}
        onChange={(e) => update("preparation_notes", e.target.value)}
      />
      <Textarea
        label="Session summary"
        value={form.summary}
        onChange={(e) => update("summary", e.target.value)}
      />

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          className="flex-1 bg-amber-700 hover:bg-amber-800"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            setError(null);
            try {
              await onSubmit(form);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not save.");
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
