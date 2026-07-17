"use client";

import { useState } from "react";
import { useApp } from "@/lib/app-context";
import { Button, Input } from "@/components/ui";

/** Shown once when the user has not set a preferred display name. */
export function DisplayNamePrompt() {
  const { user, loading, displayName, updateDisplayName, demoMode } = useApp();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [skipped, setSkipped] = useState(false);

  if (loading || !user || displayName || skipped || demoMode) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl animate-fade-up">
        <p className="text-sm font-medium text-teal-800">MyWitness</p>
        <h2 className="mt-1 font-display text-xl font-semibold text-stone-900">
          What should we call you?
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          Your preferred name appears in the greeting. You can change it anytime
          in Settings.
        </p>
        <div className="mt-4">
          <Input
            label="Preferred name"
            placeholder="Doreen"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="mt-5 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setSkipped(true)}
          >
            Skip for now
          </Button>
          <Button
            className="flex-1"
            disabled={saving || !name.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await updateDisplayName(name);
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
