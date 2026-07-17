"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useApp } from "@/lib/app-context";
import { Button, Input } from "@/components/ui";
import { isValidEmailFormat } from "@/lib/auth-errors";
import type { AuthError } from "@supabase/supabase-js";

const SIGNUP_FALLBACK =
  "Account creation failed. Check Supabase Auth logs for the underlying error.";

function displayAuthMessage(error: AuthError | null | undefined): string {
  const raw = typeof error?.message === "string" ? error.message.trim() : "";
  if (!raw || raw === "{}" || raw === "[object Object]") {
    return SIGNUP_FALLBACK;
  }
  return raw;
}

function logAuthError(context: string, error: AuthError) {
  // Never log env values or secrets — only the AuthError fields.
  console.error(`[MyWitness ${context}]`, error);
  if (process.env.NODE_ENV === "development") {
    console.error(`[MyWitness ${context} details]`, {
      name: error.name,
      message: error.message,
      status: error.status,
      code: error.code,
      cause: error.cause,
    });
    console.error(`[MyWitness ${context} full error object]`, error);
  }
}

function LoginForm() {
  const searchParams = useSearchParams();
  const { enableDemoMode } = useApp();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const configured = isSupabaseConfigured();
  const queryErrorRaw = searchParams.get("error");
  const queryError =
    queryErrorRaw && queryErrorRaw.trim() && queryErrorRaw.trim() !== "{}"
      ? queryErrorRaw
      : null;
  const error = formError || queryError;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!configured) {
      setFormError(
        "Supabase is not configured. Add your project URL and anon key to .env.local, then restart the app."
      );
      return;
    }

    const trimmedName = displayName.trim();
    if (mode === "signup") {
      if (!trimmedName) {
        setFormError("Please enter a display name.");
        return;
      }
      if (trimmedName.includes("@")) {
        setFormError("Display name cannot be an email address.");
        return;
      }
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFormError("Please enter your email address.");
      return;
    }
    if (!isValidEmailFormat(trimmedEmail)) {
      setFormError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setFormError("Please enter your password.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setFormError(
        "Password is too weak. Use at least 6 characters (longer is better)."
      );
      return;
    }

    setLoading(true);
    setFormError(null);
    setMessage(null);

    try {
      const supabase = createClient();

      if (mode === "signin") {
        const { data, error: signInError } =
          await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password,
          });

        if (signInError) {
          logAuthError("signIn", signInError);
          setFormError(displayAuthMessage(signInError));
          return;
        }
        if (!data.session) {
          setFormError(
            "Please confirm your email before signing in. Check your inbox for the link."
          );
          return;
        }
        window.location.assign("/today");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            display_name: trimmedName,
          },
        },
      });

      if (error) {
        logAuthError("signUp", error);
        setFormError(displayAuthMessage(error));
        return;
      }

      // Ensure profile row has the chosen display name when a session exists.
      // Without a session (email confirm required), the auth trigger stores metadata.
      if (data.user && data.session) {
        const { error: profileError } = await supabase.from("profiles").upsert({
          id: data.user.id,
          display_name: trimmedName,
          updated_at: new Date().toISOString(),
        });
        if (profileError) {
          console.error("[MyWitness signup profile]", profileError);
        }
        if (typeof window !== "undefined") {
          localStorage.setItem("mywitness-display-name", trimmedName);
        }
      } else if (data.user && typeof window !== "undefined") {
        localStorage.setItem("mywitness-display-name", trimmedName);
      }

      if (data.session) {
        window.location.assign("/today");
        return;
      }

      const identities = data.user?.identities;
      if (Array.isArray(identities) && identities.length === 0) {
        setFormError(
          "An account with this email already exists. Try signing in instead."
        );
        setMode("signin");
        return;
      }

      setMessage(
        "Account created. Check your email to confirm, then sign in. (In Supabase you can disable email confirmation under Authentication → Providers → Email for faster local use.)"
      );
      setMode("signin");
    } catch (err) {
      console.error("[MyWitness auth unexpected]", err);
      if (process.env.NODE_ENV === "development" && err && typeof err === "object") {
        const e = err as {
          name?: string;
          message?: string;
          status?: number;
          code?: string;
          cause?: unknown;
        };
        console.error("[MyWitness auth unexpected details]", {
          name: e.name,
          message: e.message,
          status: e.status,
          code: e.code,
          cause: e.cause,
        });
      }
      const msg =
        err instanceof Error &&
        typeof err.message === "string" &&
        err.message.trim() &&
        err.message.trim() !== "{}"
          ? err.message.trim()
          : SIGNUP_FALLBACK;
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
        noValidate
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

        {mode === "signup" && (
          <Input
            label="Display Name"
            type="text"
            autoComplete="name"
            required
            placeholder="Doreen"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={!configured || loading}
          />
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
          <p
            role="alert"
            className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {typeof error === "string" && error.trim() && error.trim() !== "{}"
              ? error
              : SIGNUP_FALLBACK}
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
