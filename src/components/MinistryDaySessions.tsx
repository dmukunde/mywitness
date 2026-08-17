"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button, Card, ConfirmDialog, Input, Textarea } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { cn, formatDuration } from "@/lib/utils";
import type { MinistrySession } from "@/lib/types";

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * The individual saved ministry-time entries behind a day's total — reused
 * on both the Today page (today's entries) and the Calendar (tapped day's
 * entries), so editing/deleting behaves identically everywhere.
 */
export function MinistryDaySessions({ sessions }: { sessions: MinistrySession[] }) {
  const { updateSession, deleteMinistrySession } = useApp();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHours, setEditHours] = useState(0);
  const [editMinutes, setEditMinutes] = useState(0);
  const [editNotes, setEditNotes] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sessions.length === 0) return null;

  const startEdit = (s: MinistrySession) => {
    const mins = s.duration_minutes ?? 0;
    setEditHours(Math.floor(mins / 60));
    setEditMinutes(mins % 60);
    setEditNotes(s.personal_reflection || "");
    setEditingId(s.id);
    setError(null);
  };

  const saveEdit = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const duration = editHours * 60 + editMinutes;
      await updateSession(id, {
        duration_minutes: duration,
        personal_reflection: editNotes.trim() || null,
      });
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async (id: string) => {
    setBusy(true);
    try {
      await deleteMinistrySession(id);
      setDeletingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete entry.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {sessions.map((s) => (
        <Card key={s.id} className="space-y-2">
          {editingId === s.id ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Hours"
                  type="number"
                  min={0}
                  value={editHours}
                  onChange={(e) => setEditHours(Math.max(0, Number(e.target.value) || 0))}
                />
                <Input
                  label="Minutes"
                  type="number"
                  min={0}
                  max={59}
                  value={editMinutes}
                  onChange={(e) =>
                    setEditMinutes(Math.min(59, Math.max(0, Number(e.target.value) || 0)))
                  }
                />
              </div>
              <Textarea
                label="Notes (optional)"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
              />
              {error && <p className="text-xs text-rose-600">{error}</p>}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => setEditingId(null)}
                >
                  Cancel
                </Button>
                <Button className="flex-1" disabled={busy} onClick={() => void saveEdit(s.id)}>
                  {busy ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-display text-lg font-semibold text-emerald-900">
                    {formatDuration(s.duration_minutes ?? 0)}
                  </p>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      s.source === "timer"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-stone-100 text-stone-600"
                    )}
                  >
                    {s.source === "timer" ? "Timer" : "Manual"}
                  </span>
                </div>
                {s.source === "timer" && s.end_time && (
                  <p className="mt-1 text-xs text-stone-500">
                    {clockTime(s.start_time)} – {clockTime(s.end_time)}
                  </p>
                )}
                {s.personal_reflection && (
                  <p className="mt-1 text-xs text-stone-500">{s.personal_reflection}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(s)}
                  className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                  aria-label="Edit entry"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingId(s.id)}
                  className="rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label="Delete entry"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </Card>
      ))}
      <ConfirmDialog
        open={deletingId != null}
        title="Delete this entry?"
        message="This ministry time entry will be permanently removed."
        confirmLabel="Delete"
        danger
        onConfirm={() => deletingId && void confirmDelete(deletingId)}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}
