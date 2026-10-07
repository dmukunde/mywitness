"use client";

import { useState } from "react";
import { useSingleFlight } from "@/hooks/useSingleFlight";
import { Star } from "lucide-react";
import { Button, Card, Input, Select, Textarea } from "@/components/ui";
import {
  STUDY_NOTE_TYPE_LABELS,
  STUDY_NOTE_TYPES,
  type StudyNoteFormData,
  type StudyNoteType,
} from "@/lib/types";
import { formatDbError } from "@/lib/db-errors";

const TYPE_CONTEXT: Record<
  StudyNoteType,
  {
    titleLabel: string;
    titlePlaceholder: string;
    sessionLabel: string;
    sessionPlaceholder: string;
    bodyPlaceholder: string;
  }
> = {
  family_worship: {
    titleLabel: "Topic",
    titlePlaceholder: "What can we learn from Paul's example?",
    sessionLabel: "Section (optional)",
    sessionPlaceholder: "",
    bodyPlaceholder:
      "My notes, things we want to discuss, personal/family application…",
  },
  midweek_meeting: {
    titleLabel: "Title / Topic",
    titlePlaceholder: "Treasures From God's Word",
    sessionLabel: "Section / Paragraph",
    sessionPlaceholder: "e.g. Paragraph 7, Bible reading",
    bodyPlaceholder: "Key point, my comment, personal application…",
  },
  weekend_meeting: {
    titleLabel: "Title / Topic",
    titlePlaceholder: "Watchtower Study",
    sessionLabel: "Section / Paragraph",
    sessionPlaceholder: "e.g. Paragraph 7",
    bodyPlaceholder: "Key point, my comment, personal application…",
  },
  convention: {
    titleLabel: "Talk / Part title",
    titlePlaceholder: "Symposium — Staying Firm in the Faith",
    sessionLabel: "Session",
    sessionPlaceholder: "e.g. Saturday Morning",
    bodyPlaceholder: "My notes…",
  },
  personal_study: {
    titleLabel: "Topic",
    titlePlaceholder: "What does the Bible say about hope?",
    sessionLabel: "Section (optional)",
    sessionPlaceholder: "",
    bodyPlaceholder: "My research and notes…",
  },
  other: {
    titleLabel: "Title",
    titlePlaceholder: "",
    sessionLabel: "Section (optional)",
    sessionPlaceholder: "",
    bodyPlaceholder: "My notes…",
  },
};

export function StudyNoteEditor({
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial: StudyNoteFormData;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (form: StudyNoteFormData) => Promise<void>;
}) {
  const [form, setForm] = useState<StudyNoteFormData>(initial);
  const [saving, setSaving] = useState(false);
  const guard = useSingleFlight();
  const [error, setError] = useState<string | null>(null);
  const ctx = TYPE_CONTEXT[form.note_type];

  const set = <K extends keyof StudyNoteFormData>(
    key: K,
    value: StudyNoteFormData[K]
  ) => setForm((f) => ({ ...f, [key]: value }));

  const doSubmit = async () => {
    if (!form.title.trim()) {
      setError("Please enter a title or topic.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(formatDbError("save study note", err, "Could not save this note."));
      setSaving(false);
    }
  };

  const handleSubmit = () => guard(doSubmit);

  return (
    <div className="space-y-4">
      <Select
        label="Type"
        value={form.note_type}
        onChange={(e) => set("note_type", e.target.value as StudyNoteType)}
      >
        {STUDY_NOTE_TYPES.map((t) => (
          <option key={t} value={t}>
            {STUDY_NOTE_TYPE_LABELS[t]}
          </option>
        ))}
      </Select>

      <Input
        label={ctx.titleLabel}
        placeholder={ctx.titlePlaceholder}
        value={form.title}
        onChange={(e) => set("title", e.target.value)}
      />

      <Input
        label="Date"
        type="date"
        value={form.note_date}
        onChange={(e) => set("note_date", e.target.value)}
      />

      <Input
        label={ctx.sessionLabel}
        placeholder={ctx.sessionPlaceholder}
        value={form.session_label}
        onChange={(e) => set("session_label", e.target.value)}
      />

      <Textarea
        label="Scriptures"
        placeholder={"Acts 20:20\n1 Corinthians 9:22, 23"}
        hint="One reference per line"
        rows={2}
        value={form.scripture_refs}
        onChange={(e) => set("scripture_refs", e.target.value)}
      />

      <Textarea
        label="Research / References"
        placeholder="JW.org links or publication references — one per line"
        hint="Pasted links only. MyWitness never copies or stores JW.org content itself."
        rows={2}
        value={form.references_text}
        onChange={(e) => set("references_text", e.target.value)}
      />

      <Textarea
        label="My Notes"
        placeholder={ctx.bodyPlaceholder}
        rows={6}
        value={form.body}
        onChange={(e) => set("body", e.target.value)}
      />

      <Card
        className={
          form.is_comment ? "ring-amber-300 bg-amber-50/60" : undefined
        }
        onClick={() => set("is_comment", !form.is_comment)}
      >
        <div className="flex items-center gap-3">
          <Star
            className={
              form.is_comment
                ? "h-5 w-5 shrink-0 fill-amber-500 text-amber-500"
                : "h-5 w-5 shrink-0 text-stone-300"
            }
          />
          <div>
            <p className="font-medium text-stone-900">
              Comment I want to give
            </p>
            <p className="text-xs text-stone-500">
              Mark this so it&rsquo;s easy to find before or during the meeting.
            </p>
          </div>
        </div>
      </Card>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
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
          className="flex-1"
          onClick={() => void handleSubmit()}
          disabled={saving}
        >
          {saving ? "Saving…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
