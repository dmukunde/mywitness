/**
 * Fair-use limits for voice notes (OpenAI transcription and extraction).
 *
 * The numbers are chosen for normal personal use: a publisher dictating a few
 * notes after a day in the ministry should never notice them. They exist to
 * stop one account (or a script) from running up a large bill. They are
 * enforced on the server; the app only mirrors the recording length so people
 * are never surprised.
 */

// ---- Limits the app and the server share --------------------------------

/** A single voice note stops at 10 minutes (about 1,500 spoken words). */
export const VOICE_NOTE_MAX_SECONDS = 10 * 60;
/**
 * Largest upload accepted. Vercel itself refuses request bodies above about
 * 4.5 MB, so this keeps a clear, friendly message ahead of that hard stop.
 */
export const VOICE_NOTE_MAX_BYTES = 4 * 1024 * 1024;
/**
 * Recording quality. 32 kbit/s is plenty for clear speech and keeps even a
 * full 10-minute note (about 2.4 MB) under the upload limit.
 */
export const VOICE_NOTE_BITS_PER_SECOND = 32_000;
/** Longest text sent for extraction. */
export const TRANSCRIPT_MAX_CHARS = 15_000;

// ---- Limits the server enforces (adjustable in Vercel settings) ---------

export interface AiLimits {
  /** Requests of any kind per person per minute. */
  perMinute: number;
  /** Transcriptions per person per rolling 24 hours. */
  dailyTranscriptions: number;
  /** Text extractions per person per rolling 24 hours. */
  dailyExtractions: number;
  /** Minutes of audio per person per rolling 24 hours. */
  dailyAudioMinutes: number;
  /** Requests from everyone together per rolling 24 hours. */
  globalDaily: number;
}

export const DEFAULT_AI_LIMITS: AiLimits = {
  perMinute: 5,
  dailyTranscriptions: 40,
  dailyExtractions: 80,
  dailyAudioMinutes: 120,
  globalDaily: 2000,
};

function positiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

type Env = Record<string, string | undefined>;

/** Reads optional overrides such as AI_LIMIT_PER_MINUTE; ignores anything that isn't a whole number above zero. */
export function aiLimitsFromEnv(env: Env = process.env): AiLimits {
  return {
    perMinute: positiveInt(env.AI_LIMIT_PER_MINUTE, DEFAULT_AI_LIMITS.perMinute),
    dailyTranscriptions: positiveInt(
      env.AI_LIMIT_DAILY_TRANSCRIPTIONS,
      DEFAULT_AI_LIMITS.dailyTranscriptions
    ),
    dailyExtractions: positiveInt(
      env.AI_LIMIT_DAILY_EXTRACTIONS,
      DEFAULT_AI_LIMITS.dailyExtractions
    ),
    dailyAudioMinutes: positiveInt(
      env.AI_LIMIT_DAILY_AUDIO_MINUTES,
      DEFAULT_AI_LIMITS.dailyAudioMinutes
    ),
    globalDaily: positiveInt(env.AI_LIMIT_GLOBAL_DAILY, DEFAULT_AI_LIMITS.globalDaily),
  };
}

/** An emergency off switch: set AI_DISABLED=1 in Vercel and voice notes pause for everyone. */
export function isAiDisabled(env: Env = process.env): boolean {
  const v = env.AI_DISABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

// ---- Refusals, in plain language ----------------------------------------

export type AiDenyReason =
  | "rate"
  | "daily"
  | "audio_minutes"
  | "global"
  | "disabled"
  | "unavailable"
  | "too_large"
  | "too_long"
  | "transcript_too_long"
  | "invalid";

export interface AiDenial {
  reason: AiDenyReason;
  /** HTTP status to answer with. */
  status: number;
  /** Safe to show to the person. */
  message: string;
  /** Seconds until trying again can work, when that is known. */
  retryAfter?: number;
}

const minutesFrom = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));

export function denial(reason: AiDenyReason, retryAfter?: number): AiDenial {
  switch (reason) {
    case "rate":
      return {
        reason,
        status: 429,
        retryAfter,
        message:
          "You're going a little fast. Please wait a minute, then try again.",
      };
    case "daily":
      return {
        reason,
        status: 429,
        retryAfter,
        message: `You've reached today's voice-note limit. It resets gradually over the next 24 hours${
          retryAfter ? ` (about ${minutesFrom(retryAfter)} min until you can try again)` : ""
        }. You can still type your note.`,
      };
    case "audio_minutes":
      return {
        reason,
        status: 429,
        retryAfter,
        message:
          "You've used today's voice-note recording time. It frees up gradually over the next 24 hours. You can still type your note.",
      };
    case "global":
    case "disabled":
      return {
        reason,
        status: 503,
        message:
          "Voice notes are paused for a little while. Please try again later, or type your note.",
      };
    case "unavailable":
      return {
        reason,
        status: 503,
        message:
          "We couldn't check your voice-note allowance just now. Please try again in a moment.",
      };
    case "too_large":
      return {
        reason,
        status: 413,
        message:
          "That recording is too large. Please keep each voice note under 10 minutes and record the rest as another note.",
      };
    case "too_long":
      return {
        reason,
        status: 400,
        message:
          "That voice note is longer than 10 minutes. Please record it in shorter parts.",
      };
    case "transcript_too_long":
      return {
        reason,
        status: 413,
        message:
          "That note is too long to process at once. Please split it into shorter notes.",
      };
    case "invalid":
      return {
        reason,
        status: 400,
        message: "We couldn't read that recording. Please try recording again.",
      };
  }
}

// ---- Checking an upload before spending anything -------------------------

/**
 * How many seconds of audio this upload counts as. The app reports the length
 * it recorded; the file size gives a floor so a falsely short claim on a big
 * file still counts for something. (The size limit is the hard backstop.)
 */
export function effectiveAudioSeconds(bytes: number, claimedSeconds: number | null): number {
  const fromSize = Math.ceil(bytes / 40_000); // 320 kbit/s: above any speech recording
  const claimed = claimedSeconds !== null && Number.isFinite(claimedSeconds) ? Math.max(0, Math.ceil(claimedSeconds)) : 0;
  return Math.max(claimed, fromSize);
}

export type UploadCheck = { ok: true; seconds: number } | { ok: false; denial: AiDenial };

export function checkUpload(
  { bytes, claimedSeconds }: { bytes: number; claimedSeconds: number | null },
  maxSeconds = VOICE_NOTE_MAX_SECONDS,
  maxBytes = VOICE_NOTE_MAX_BYTES
): UploadCheck {
  if (!Number.isFinite(bytes) || bytes <= 0) return { ok: false, denial: denial("invalid") };
  if (bytes > maxBytes) return { ok: false, denial: denial("too_large") };
  // A few seconds of leeway for the moment between "stop" and the last data.
  if (claimedSeconds !== null && Number.isFinite(claimedSeconds) && claimedSeconds > maxSeconds + 15) {
    return { ok: false, denial: denial("too_long") };
  }
  return { ok: true, seconds: effectiveAudioSeconds(bytes, claimedSeconds) };
}

export function checkTranscriptLength(text: string, max = TRANSCRIPT_MAX_CHARS): AiDenial | null {
  return text.length > max ? denial("transcript_too_long") : null;
}

/** Reads the length the app reports ("durationSeconds"), or null if absent or nonsense. */
export function parseClaimedSeconds(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n < 24 * 3600 ? n : null;
}

// ---- Stand-in used only until the database migration has been run --------

export type ClaimResult =
  | { ok: true; id: string | null }
  | { ok: false; denial: AiDenial };

interface MemoryEvent {
  at: number;
  kind: "transcribe" | "extract";
  audioSeconds: number;
}

/**
 * Remembers recent requests in this server instance only. It is NOT a complete
 * protection (each instance counts separately, and it forgets when the
 * instance restarts); it simply keeps limits switched on if the database
 * function hasn't been installed yet. The database version is the real one.
 */
export function createMemoryLimiter(now: () => number = Date.now) {
  const byUser = new Map<string, MemoryEvent[]>();
  const DAY = 24 * 3600 * 1000;

  return {
    claim(
      userId: string,
      kind: "transcribe" | "extract",
      audioSeconds: number,
      limits: AiLimits
    ): ClaimResult {
      const t = now();
      const events = (byUser.get(userId) ?? []).filter((e) => t - e.at < DAY);

      const lastMinute = events.filter((e) => t - e.at < 60_000);
      if (lastMinute.length >= limits.perMinute) {
        const wait = Math.ceil((lastMinute[0].at + 60_000 - t) / 1000);
        byUser.set(userId, events);
        return { ok: false, denial: denial("rate", Math.max(1, wait)) };
      }

      const sameKind = events.filter((e) => e.kind === kind);
      const dailyCap = kind === "transcribe" ? limits.dailyTranscriptions : limits.dailyExtractions;
      if (sameKind.length >= dailyCap) {
        byUser.set(userId, events);
        return {
          ok: false,
          denial: denial("daily", Math.max(1, Math.ceil((sameKind[0].at + DAY - t) / 1000))),
        };
      }
      if (kind === "transcribe") {
        const used = sameKind.reduce((s, e) => s + e.audioSeconds, 0);
        if (used + audioSeconds > limits.dailyAudioMinutes * 60) {
          byUser.set(userId, events);
          return { ok: false, denial: denial("audio_minutes") };
        }
      }

      events.push({ at: t, kind, audioSeconds });
      byUser.set(userId, events);
      return { ok: true, id: null };
    },
    /** Test helper. */
    reset() {
      byUser.clear();
    },
  };
}
