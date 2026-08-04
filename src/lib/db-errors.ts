/**
 * Turn Supabase/PostgREST database failures into readable user messages.
 *
 * Supabase query errors (`const { error } = await supabase.from(...)...`) are
 * NOT guaranteed to be `Error` instances — PostgREST responses are parsed
 * with `JSON.parse(body)` into a plain object `{ message, details, hint,
 * code }`, and network-level failures are also built as plain objects. Code
 * that checks `err instanceof Error` before reading `.message` silently
 * drops these and falls back to a generic message, hiding the real cause.
 * Always log the full object — logging only `.message` hides `.hint`, which
 * Postgres often uses for the actionable fix.
 */

type DbLikeError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
  status?: number;
};

function asRecord(value: unknown): DbLikeError | null {
  if (value && typeof value === "object") return value as DbLikeError;
  return null;
}

function firstNonEmpty(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    const t = c?.trim();
    if (t && t !== "{}" && t !== "[object Object]") return t;
  }
  return null;
}

/** Postgres/PostgREST codes mapped to plain-language causes where we can be specific. */
function mapFriendlyMessage(raw: string, code?: string): string {
  switch (code) {
    case "23505":
      return "A record like this already exists.";
    case "23503":
      return "This refers to something that no longer exists — try refreshing the page and trying again.";
    case "23502":
      return "A required field is missing.";
    case "42501":
    case "PGRST301":
      return "You don't have permission to save this — please sign in again.";
    case "42703":
    case "42P01":
    case "PGRST204":
      return "This app's database is missing a recent update. Please run the latest migration, then try again.";
  }

  const lower = raw.toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed")
  ) {
    return "Could not reach the server. Check your internet connection and try again.";
  }

  return raw;
}

/** Log full error details, then return a safe, friendly string for the UI. */
export function formatDbError(
  context: string,
  err: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  console.error(`[MyWitness ${context}]`, err);
  const obj = asRecord(err);
  if (obj) {
    console.error(`[MyWitness ${context} details]`, {
      message: obj.message,
      details: obj.details,
      hint: obj.hint,
      code: obj.code,
      status: obj.status,
    });
  }

  const raw = firstNonEmpty(
    err instanceof Error ? err.message : undefined,
    obj?.message,
    obj?.hint,
    obj?.details
  );
  if (!raw) return fallback;

  const friendly = mapFriendlyMessage(raw, obj?.code);
  return friendly.trim() ? friendly : fallback;
}
