/**
 * Sanitize OpenAI SDK / fetch errors for API responses and server logs.
 * Never expose OPENAI_API_KEY (or any sk-… fragment) to the client.
 */

const AUTH_UI_MESSAGE =
  "Voice processing could not authenticate. Please check the server configuration and try again.";

const GENERIC_UI_MESSAGE =
  "Voice processing failed. Please try again in a moment.";

const MISSING_KEY_UI_MESSAGE =
  "Voice processing is not configured on the server. Please try again later.";

/** Matches OpenAI secret shapes, including truncated/masked forms in error text. */
const API_KEY_FRAGMENT =
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{4,}(?:\.{2,3}[A-Za-z0-9_-]+)?\b/gi;

function scrubSecrets(text: string): string {
  return text
    .replace(API_KEY_FRAGMENT, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/Authorization:\s*\S+/gi, "Authorization: [redacted]");
}

function getStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as { status?: number; statusCode?: number };
  if (typeof e.status === "number") return e.status;
  if (typeof e.statusCode === "number") return e.statusCode;
  return undefined;
}

function getRawMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "";
}

/** Client-facing message only — never includes key material. */
export function openaiErrorForClient(error: unknown): {
  message: string;
  status: number;
} {
  const status = getStatus(error);

  if (status === 401) {
    return { message: AUTH_UI_MESSAGE, status: 401 };
  }

  const raw = getRawMessage(error);
  const lower = raw.toLowerCase();

  if (
    lower.includes("incorrect api key") ||
    lower.includes("invalid api key") ||
    lower.includes("authentication") ||
    lower.includes("unauthorized") ||
    /\b401\b/.test(raw)
  ) {
    return { message: AUTH_UI_MESSAGE, status: 401 };
  }

  // Never forward raw OpenAI messages (they often embed key prefixes/suffixes).
  return { message: GENERIC_UI_MESSAGE, status: status && status >= 400 ? status : 500 };
}

export function missingOpenAIKeyResponse(): {
  message: string;
  status: number;
} {
  return { message: MISSING_KEY_UI_MESSAGE, status: 500 };
}

/**
 * Log technical details server-side without API key or Authorization header.
 */
export function logOpenAIError(context: string, error: unknown): void {
  const status = getStatus(error);
  const rawMessage = scrubSecrets(getRawMessage(error));

  if (error && typeof error === "object") {
    const e = error as {
      name?: string;
      code?: string;
      type?: string;
      cause?: unknown;
    };
    console.error(`[MyWitness ${context}]`, {
      name: e.name,
      message: rawMessage || undefined,
      status,
      code: e.code,
      type: e.type,
      cause:
        e.cause instanceof Error
          ? scrubSecrets(e.cause.message)
          : e.cause != null
            ? scrubSecrets(String(e.cause))
            : undefined,
    });
    return;
  }

  console.error(`[MyWitness ${context}]`, scrubSecrets(String(error)));
}
