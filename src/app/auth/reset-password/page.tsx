"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { Button, Input } from "@/components/ui";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { user, loading, updatePassword } = useApp();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updatePassword(password);
      setDone(true);
      setTimeout(() => router.replace("/today"), 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update your password."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
      <div className="animate-fade-up">
        <p className="font-display text-4xl font-semibold tracking-tight text-emerald-900">
          MyWitness
        </p>
        <p className="mt-1 text-base font-medium text-emerald-800/90">
          Personal Ministry Companion
        </p>
      </div>

      <div className="mt-10 space-y-4 rounded-3xl bg-white/90 p-5 shadow-sm ring-1 ring-stone-200/70">
        {loading ? (
          <p className="text-sm text-stone-500">Checking your reset link…</p>
        ) : !user ? (
          <>
            <h1 className="font-display text-xl font-semibold text-stone-900">
              This link has expired
            </h1>
            <p className="text-sm text-stone-600">
              Password reset links are only valid for a short time. Request a
              new one from the sign-in screen.
            </p>
            <Button className="w-full" onClick={() => router.replace("/login")}>
              Back to sign in
            </Button>
          </>
        ) : done ? (
          <>
            <h1 className="font-display text-xl font-semibold text-stone-900">
              Password updated
            </h1>
            <p className="text-sm text-stone-600">
              Taking you back into MyWitness…
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <h1 className="font-display text-xl font-semibold text-stone-900">
              Set a new password
            </h1>
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={saving}
            />
            <Input
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={saving}
            />
            {error && (
              <p
                role="alert"
                className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700"
              >
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Saving…" : "Save new password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
