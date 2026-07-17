"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Button, Input } from "@/components/ui";

function LoginForm() {
  const searchParams = useSearchParams();
  const { enableDemoMode } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const configured = isSupabaseConfigured();
  const queryError = searchParams.get("error");
  const error = formError || queryError;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configured) {
      setFormError(
        "Supabase is not configured. Add keys to .env.local, then restart the app."
      );
      return;
    }

    setLoading(true);
    setFormError(null);
    setMessage(null);

    try {
      const supabase = createClient();

      if (mode === "signin") {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        if (!data.session) {
          throw new Error("Sign in succeeded but no session was created. Try again.");
        }
        window.location.assign("/today");
        return;
      }

      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            display_name: email.trim().split("@")[0],
          },
        },
      });
      if (err) throw err;

      if (data.session) {
        window.location.assign("/today");
        return;
      }

      setMessage(
        "Account created. Check your email to confirm, then sign in. (In Supabase you can disable email confirmation under Authentication → Providers → Email for faster local use.)"
      );
      setMode("signin");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Authentication failed. Please try again.";
      setFormError(msg);
    } finally {
      setLoading(false);
    }
  };

  const startDemo = () => {
    enableDemoMode();
    window.location.assign("/today");
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
      <div className="animate-fade-up">
        <p className="font-display text-4xl font-semibold tracking-tight text-teal-900">
          MyWitness
        </p>
        <p className="mt-1 text-base font-medium text-teal-800/90">
          Personal Ministry Companion
        </p>
        <p className="mt-3 max-w-sm text-base leading-relaxed text-stone-600">
          Record conversations, prepare return visits, and remember what
          matters — privately, on your own device.
        </p>
      </div>

      <form
        onSubmit={handleAuth}
        className="mt-10 space-y-4 rounded-3xl bg-white/90 p-5 shadow-sm ring-1 ring-stone-200/70"
      >
        <h1 className="font-display text-xl font-semibold text-stone-900">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>

        {!configured && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Supabase keys are missing or still placeholders. Update{" "}
            <code>.env.local</code> and restart.
          </p>
        )}

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={!configured || loading}
        />
        <Input
          label="Password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={!configured || loading}
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
          onClick={() => {
            setMode((m) => (m === "signin" ? "signup" : "signin"));
            setFormError(null);
            setMessage(null);
          }}
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
        <p className="text-center text-xs text-stone-500">
          Demo mode is for exploring the UI only. Use a real account for ministry.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-sm text-stone-500">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
