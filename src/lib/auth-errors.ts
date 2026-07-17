/**
 * Turn Supabase / network / unknown auth failures into readable user messages.
 * Never returns "{}" or an empty string.
 */

type AuthLikeError = {
  message?: string;
  msg?: string;
  code?: string;
  status?: number;
  name?: string;
  error_description?: string;
  error?: string;
  cause?: unknown;
};

function asRecord(value: unknown): AuthLikeError | null {
  if (value && typeof value === "object") {
    return value as AuthLikeError;
  }
  return null;
}

function firstNonEmpty(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    const t = c?.trim();
    if (t && t !== "{}" && t !== "[object Object]") return t;
  }
  return null;
}

function extractRawMessage(err: unknown): string {
  if (err == null) return "Authentication failed. Please try again.";

  if (typeof err === "string") {
    const t = err.trim();
    return t && t !== "{}" ? t : "Authentication failed. Please try again.";
  }

  if (err instanceof Error) {
    const fromError = firstNonEmpty(err.message, (err as AuthLikeError).msg);
    if (fromError) return fromError;
  }

  const obj = asRecord(err);
  if (obj) {
    const nested =
      typeof obj.error === "object" && obj.error !== null
        ? asRecord(obj.error)
        : null;

    const extracted = firstNonEmpty(
      obj.message,
      obj.msg,
      obj.error_description,
      typeof obj.error === "string" ? obj.error : undefined,
      nested?.message,
      nested?.msg,
      nested?.error_description
    );
    if (extracted) return extracted;
  }

  return "Authentication failed. Please try again.";
}

function mapFriendlyMessage(
  raw: string,
  code?: string,
  status?: number,
  name?: string
): string {
  const lower = raw.toLowerCase();
  const c = (code || "").toLowerCase();
  const n = (name || "").toLowerCase();

  // Supabase sometimes sets message to the literal "{}" on fetch failures
  const looksEmpty =
    !raw.trim() ||
    raw.trim() === "{}" ||
    raw.includes('"message":"{}"') ||
    n.includes("authretryablefetcherror") ||
    (raw.includes("AuthRetryableFetchError") && raw.includes("{}"));

  if (
    looksEmpty ||
    n.includes("authretryablefetcherror") ||
    status === 0 ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed") ||
    lower.includes("fetch failed")
  ) {
    return "Could not reach Supabase. Check your internet connection and that NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local are correct, then restart the app.";
  }

  if (
    c === "invalid_credentials" ||
    lower.includes("invalid login credentials") ||
    lower.includes("invalid email or password")
  ) {
    return "Incorrect email or password. Please try again.";
  }

  if (
    c === "user_already_exists" ||
    c === "email_exists" ||
    lower.includes("already registered") ||
    lower.includes("already been registered") ||
    lower.includes("user already exists")
  ) {
    return "An account with this email already exists. Try signing in instead.";
  }

  if (
    c === "weak_password" ||
    lower.includes("password should be") ||
    lower.includes("password is too weak") ||
    lower.includes("weak password")
  ) {
    return "Password is too weak. Use at least 6 characters (longer is better).";
  }

  if (
    c === "validation_failed" ||
    c === "invalid_email" ||
    lower.includes("invalid email") ||
    lower.includes("unable to validate email") ||
    (lower.includes("email address") && lower.includes("invalid"))
  ) {
    return "Please enter a valid email address.";
  }

  if (
    c === "email_not_confirmed" ||
    lower.includes("email not confirmed") ||
    lower.includes("confirm your email")
  ) {
    return "Please confirm your email before signing in. Check your inbox for the link.";
  }

  if (
    c === "over_email_send_rate_limit" ||
    c === "over_request_rate_limit" ||
    lower.includes("rate limit")
  ) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  if (
    status === 500 ||
    lower.includes("supabase is not configured") ||
    (lower.includes("missing") && lower.includes("env")) ||
    lower.includes("invalid api key") ||
    (lower.includes("jwt") && lower.includes("invalid"))
  ) {
    return "Supabase returned a server error. Verify your project URL and API keys in .env.local, confirm Email auth is enabled, then restart the app.";
  }

  return raw;
}

/** Log full error + return a safe, friendly string for the UI. */
export function formatAuthError(err: unknown): string {
  console.error("[MyWitness auth error]", err);
  if (err && typeof err === "object") {
    const e = err as AuthLikeError & { stack?: string };
    console.error("[MyWitness auth error details]", {
      name: e.name,
      message: e.message,
      msg: e.msg,
      code: e.code,
      status: e.status,
      error: e.error,
      error_description: e.error_description,
      cause: e.cause,
      stack: e.stack,
    });
  }

  const obj = asRecord(err);
  let raw = extractRawMessage(err);

  // If message is literally "{}", prefer name/status for mapping
  if (raw.trim() === "{}" || raw.trim() === "") {
    raw =
      obj?.name ||
      (typeof obj?.status === "number" ? `status ${obj.status}` : "") ||
      "Authentication failed";
  }

  const friendly = mapFriendlyMessage(
    raw,
    obj?.code,
    obj?.status,
    obj?.name || (err instanceof Error ? err.name : undefined)
  );

  if (!friendly.trim() || friendly.trim() === "{}") {
    return "Authentication failed. Please try again.";
  }
  return friendly;
}

export function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
