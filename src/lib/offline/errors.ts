/**
 * Telling "the phone has no signal" apart from "the server said no". They need
 * opposite handling: no signal means keep the change and try again later;
 * a refusal means the change can never succeed as it is.
 */

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  details?: unknown;
  code?: unknown;
  status?: unknown;
}

const NETWORK_TEXT =
  /failed to fetch|networkerror|network request failed|load failed|fetch failed|network error|err_internet|err_network|timed out|timeout|aborted|offline|econnreset|enotfound/i;

/** True when the request never got a real answer (no signal, slow signal, server unreachable). */
export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const e = (typeof err === "object" ? err : { message: String(err) }) as ErrorLike;
  const name = String(e.name ?? "");
  if (name === "AbortError" || name === "TimeoutError" || name === "AuthRetryableFetchError") {
    return true;
  }
  if (e.status === 0 || e.status === 502 || e.status === 503 || e.status === 504) return true;
  return NETWORK_TEXT.test(`${String(e.message ?? "")} ${String(e.details ?? "")}`);
}

/** True when the sign-in is no longer accepted (expired or signed out), so the person must sign in again. */
export function isAuthError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as ErrorLike;
  return (
    e.status === 401 ||
    e.code === "PGRST301" ||
    e.code === "PGRST303" ||
    /jwt|not authenticated|invalid token|refresh token/i.test(String(e.message ?? ""))
  );
}

export type FailureKind = "network" | "auth" | "refused";

export function classifyFailure(err: unknown): FailureKind {
  if (isAuthError(err) && !isNetworkError(err)) return "auth";
  if (isNetworkError(err)) return "network";
  return "refused";
}

export const OFFLINE_MESSAGE =
  "You're offline, so this couldn't be saved. Please try again when you have signal.";

/** What a refusal means, in words the person can act on. */
export const DUPLICATE_PERSON_MESSAGE =
  'You already have someone with this name. Check People, then add them again and choose "different person".';

/** Something with the same details is already on the account (for example a visit at the same date and time). */
export const CLASH_MESSAGE =
  "This clashes with something already on your account, such as a visit for the same person at the same date and time.";

/** A short, safe description of why something was refused, for the person to read. */
export function describeRefusal(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as ErrorLike;
    const msg = String(e.message ?? "").trim();
    if (/possible_duplicate_person/i.test(msg)) return DUPLICATE_PERSON_MESSAGE;
    if (e.code === "23505" || /duplicate key|unique constraint/i.test(msg)) {
      return CLASH_MESSAGE;
    }
    if (e.code === "23503" || /foreign key/i.test(msg)) {
      return "This refers to something that is no longer on your account.";
    }
    if (e.code === "42501" || /row-level security|permission denied/i.test(msg)) {
      return "Your account didn't allow this change. Please sign in again.";
    }
    if (msg && !/^[{\[]/.test(msg)) return msg.slice(0, 160);
  }
  return "The server did not accept this change.";
}

/** Gives up waiting after `ms`, treating it as no signal. */
export function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error("Request timed out");
      err.name = "TimeoutError";
      reject(err);
    }, ms);
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

const MISSING_CODE =
  /loading chunk|chunkloaderror|loading css chunk|failed to fetch dynamically imported module|importing a module script failed|failed to load chunk/i;

/** True when a screen failed because its code could not be loaded (typically: not saved yet, and no signal). */
export function isMissingCodeError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: unknown; message?: unknown };
  return String(e.name ?? "") === "ChunkLoadError" || MISSING_CODE.test(String(e.message ?? ""));
}

/** A short, safe line describing a crash, for the person to read to support. */
export function describeCrash(err: unknown): string {
  if (!err || typeof err !== "object") return "unknown";
  const e = err as { name?: unknown; message?: unknown };
  const name = String(e.name ?? "Error").slice(0, 40);
  const message = String(e.message ?? "")
    .replace(/\s+/g, " ")
    .slice(0, 110);
  return message ? `${name}: ${message}` : name;
}
