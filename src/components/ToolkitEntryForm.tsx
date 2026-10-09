"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Button, Input, Textarea } from "@/components/ui";
import { ScriptureLinks } from "@/components/ScriptureLinks";
import { useSingleFlight } from "@/hooks/useSingleFlight";
import { formatDbError } from "@/lib/db-errors";
import { scriptureLinks } from "@/lib/scripture";
import { splitReferences } from "@/lib/toolkit";
import {
  EMPTY_TOOLKIT_FORM,
  TOOLKIT_KINDS,
  TOOLKIT_KIND_LABELS,
  type ToolkitFormData,
  type ToolkitKind,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const TITLE_LABEL: Record<ToolkitKind, string> = {
  faq: "Question",
  scripture: "Topic or theme",
  starter: "Opener",
};

const TITLE_PLACEHOLDER: Record<ToolkitKind, string> = {
  faq: "What might someone ask?",
  scripture: "What are these scriptures for?",
  starter: "How would you start the conversation?",
};

export function ToolkitEntryForm({
  initial,
  categories,
  submitLabel = "Save",
  onSubmit,
  onCancel,
}: {
  initial?: Partial<ToolkitFormData>;
  /** Categories already in use, offered as suggestions. */
  categories: string[];
  submitLabel?: string;
  onSubmit: (form: ToolkitFormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ToolkitFormData>({
    ...EMPTY_TOOLKIT_FORM,
    ...initial,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guard = useSingleFlight();

  const update = <K extends keyof ToolkitFormData>(
    key: K,
    value: ToolkitFormData[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  // Which references can be turned into JW.org links, so the user finds out
  // while typing — not later, in the field.
  const refs = splitReferences(form.scripture_refs);
  const unreadable = refs.filter((r) => scriptureLinks(r) === null);

  const doSave = async () => {
    if (!form.title.trim()) {
      setError(`Enter the ${TITLE_LABEL[form.kind].toLowerCase()}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(
        formatDbError("save toolkit entry", err, "Could not save. Please try again.")
      );
      setSaving(false);
    }
  };
  const handleSave = () => guard(doSave);

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Kind of entry"
        className="grid grid-cols-3 gap-1 rounded-2xl bg-stone-100 p-1"
      >
        {TOOLKIT_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={form.kind === k}
            onClick={() => update("kind", k)}
            className={cn(
              "min-h-10 rounded-xl px-2 text-sm font-semibold transition",
              form.kind === k
                ? "bg-white text-emerald-900 shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            )}
          >
            {TOOLKIT_KIND_LABELS[k]}
          </button>
        ))}
      </div>

      <Input
        label={TITLE_LABEL[form.kind]}
        value={form.title}
        onChange={(e) => update("title", e.target.value)}
        placeholder={TITLE_PLACEHOLDER[form.kind]}
      />
      <Textarea
        label="Short explanation (optional)"
        value={form.explanation}
        onChange={(e) => update("explanation", e.target.value)}
      />

      <div className="space-y-2">
        <Textarea
          label="Scriptures (optional)"
          value={form.scripture_refs}
          onChange={(e) => update("scripture_refs", e.target.value)}
          placeholder={"John 3:16\nMatthew 24:14; Revelation 21:4"}
          hint={
            unreadable.length
              ? `Can't link: ${unreadable.join(", ")}. It will be saved as plain text.`
              : undefined
          }
        />
        {refs.length > 0 && unreadable.length < refs.length && (
          <div>
            <p className="mb-1.5 text-xs text-stone-500">
              Tap to check each opens the right passage:
            </p>
            <ScriptureLinks references={refs} />
          </div>
        )}
      </div>

      <Textarea
        label="My suggested response (optional)"
        value={form.suggested_response}
        onChange={(e) => update("suggested_response", e.target.value)}
        placeholder="What I might say, in my own words"
      />
      <Textarea
        label="Follow-up questions (optional)"
        value={form.follow_up_questions}
        onChange={(e) => update("follow_up_questions", e.target.value)}
        placeholder="One question per line"
      />
      <Textarea
        label="Personal notes (optional)"
        value={form.personal_notes}
        onChange={(e) => update("personal_notes", e.target.value)}
      />

      <Input
        label="Category (optional)"
        value={form.category}
        onChange={(e) => update("category", e.target.value)}
        placeholder="For example: Hope, Comfort, First visits"
        list="toolkit-categories"
      />
      <datalist id="toolkit-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <button
        type="button"
        onClick={() => update("is_favorite", !form.is_favorite)}
        aria-pressed={form.is_favorite}
        className={cn(
          "flex min-h-11 w-full items-center gap-2 rounded-xl px-3.5 text-sm font-medium ring-1 transition",
          form.is_favorite
            ? "bg-amber-50 text-amber-900 ring-amber-200"
            : "bg-white text-stone-600 ring-stone-200"
        )}
      >
        <Star
          className={cn(
            "h-4 w-4",
            form.is_favorite && "fill-amber-500 text-amber-500"
          )}
        />
        {form.is_favorite ? "In favorites" : "Add to favorites"}
      </button>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="space-y-2">
        <Button className="w-full" disabled={saving} onClick={handleSave}>
          {saving ? "Saving…" : submitLabel}
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>

      <p className="text-center text-xs text-stone-400">
        Your own words and references only. Everything here is private to you.
      </p>
    </div>
  );
}
