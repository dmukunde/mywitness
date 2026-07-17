"use client";

import { useState } from "react";
import { useApp } from "@/lib/app-context";
import { Button, Input } from "@/components/ui";

/** One-time prompt when the profile has no real display name. */
export function DisplayNamePrompt() {
  const { user, loading, displayName, updateDisplayName, demoMode } = useApp();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading || !user || displayName || demoMode) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl animate-fade-up">
        <p className="text-sm font-medium text-teal-800">MyWitness</p>
        <h2 className="mt-1 font-display text-xl font-semibold text-stone-900">
          What would you like MyWitness to call you?
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          This name appears in your greeting. Your email is only used to sign
          in. You can change your name anytime in Settings.
        </p>
        <div className="mt-4">
          <Input
            label="Display Name"
            placeholder="Doreen"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        {error && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-5">
          <Button
            className="w-full"
            disabled={saving || !name.trim()}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await updateDisplayName(name);
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Could not save name."
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
