"use client";

import { useEffect, useState } from "react";
import { Button, Input, Textarea } from "@/components/ui";
import { formatDuration, todayISO } from "@/lib/utils";
import { format, parseISO } from "date-fns";

export type MinistryTimeSaveInput = {
  date: string;
  hours: number;
  minutes: number;
  notes?: string;
};

type Props = {
  open: boolean;
  initialDate?: string;
  initialMinutes?: number;
  initialNotes?: string;
  onClose: () => void;
  onSave: (input: MinistryTimeSaveInput) => Promise<void>;
};

export function MinistryTimeEditor({
  open,
  initialDate,
  initialMinutes = 0,
  initialNotes = "",
  onClose,
  onSave,
}: Props) {
  const [date, setDate] = useState(todayISO());
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDate(initialDate || todayISO());
    setHours(Math.floor(initialMinutes / 60));
    setMinutes(initialMinutes % 60);
    setNotes(initialNotes || "");
    setError(null);
  }, [open, initialDate, initialMinutes, initialNotes]);

  if (!open) return null;

  const preview = Math.max(0, hours * 60 + minutes);
  let dateLabel = date;
  try {
    dateLabel = format(parseISO(`${date}T12:00:00`), "MMMM d, yyyy");
  } catch {
    // keep raw date
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl animate-fade-up">
        <h2 className="font-display text-xl font-semibold text-stone-900">
          Add ministry time
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Enter how long you spent in ministry. No timer required.
        </p>

        <div className="mt-5 space-y-3">
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <p className="text-xs text-stone-400">{dateLabel}</p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Hours"
              type="number"
              min={0}
              max={24}
              value={hours}
              onChange={(e) => setHours(Math.max(0, Number(e.target.value) || 0))}
            />
            <Input
              label="Minutes"
              type="number"
              min={0}
              max={59}
              value={minutes}
              onChange={(e) =>
                setMinutes(Math.min(59, Math.max(0, Number(e.target.value) || 0)))
              }
            />
          </div>
          <Textarea
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Area, companions, or a short reflection"
            rows={3}
          />
          <p className="rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-700">
            Total: <span className="font-semibold">{formatDuration(preview)}</span>
          </p>
        </div>

        {error && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                if (hours === 0 && minutes === 0) {
                  throw new Error("Enter at least a few minutes of ministry time.");
                }
                if (!date) throw new Error("Please choose a date.");
                await onSave({
                  date,
                  hours,
                  minutes,
                  notes: notes.trim() || undefined,
                });
                onClose();
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Could not save ministry time."
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save time"}
          </Button>
        </div>
      </div>
    </div>
  );
}
