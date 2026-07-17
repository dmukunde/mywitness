"use client";

import { useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Button, Input } from "@/components/ui";

export default function LoginPage() {
  const { enableDemoMode } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const configured = isSupabaseConfigured();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configured) {
      setError("Supabase is not configured. Use demo mode or add env variables.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();

    if (mode === "signin") {
      const { error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      setLoading(false);
      if (err) {
        setError(err.message);
        return;
      }
      window.location.href = "/today";
      return;
    }

    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage("Check your email to confirm your account, then sign in.");
  };

  const startDemo = () => {
    enableDemoMode();
    window.location.href = "/today";
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
      <div className="animate-fade-up">
        <p className="font-display text-4xl font-semibold tracking-tight text-teal-900">
          MyWitness
        </p>
        <p className="mt-3 max-w-sm text-base leading-relaxed text-stone-600">
          Your private ministry companion — record conversations, prepare return
          visits, and remember what matters.
        </p>
      </div>

      <form
        onSubmit={handleAuth}
        className="mt-10 space-y-4 rounded-3xl bg-white/90 p-5 shadow-sm ring-1 ring-stone-200/70"
      >
        <h1 className="font-display text-xl font-semibold text-stone-900">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={!configured}
        />
        <Input
          label="Password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={!configured}
        />

        {error && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">
            {message}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={loading || !configured}>
          {loading
            ? "Please wait…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </Button>

        <button
          type="button"
          className="w-full text-center text-sm text-teal-800"
          onClick={() =>
            setMode((m) => (m === "signin" ? "signup" : "signin"))
          }
        >
          {mode === "signin"
            ? "Need an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </form>

      <div className="mt-6 space-y-3">
        <Button variant="secondary" className="w-full" onClick={startDemo}>
          Try with demo data
        </Button>
        {!configured && (
          <p className="text-center text-xs text-stone-500">
            Add Supabase keys to <code>.env.local</code> for real accounts.
          </p>
        )}
      </div>
    </div>
  );
}
