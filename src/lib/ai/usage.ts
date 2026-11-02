import {
  aiLimitsFromEnv,
  createMemoryLimiter,
  denial,
  isAiDisabled,
  type AiLimits,
  type ClaimResult,
} from "@/lib/ai/limits";

/**
 * Server-only. Asks the database whether a voice-note request is within the
 * person's limits and records it in the same step (migration 020).
 *
 * Failure rules, chosen so a problem never turns into an unlimited bill:
 *   - the database function isn't installed yet  -> use the per-instance stand-in
 *   - the database gives any other error        -> refuse politely (try again)
 */

interface RpcResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

/** The small part of the Supabase client used here (so tests can supply a fake). */
export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
}

export type AiKind = "transcribe" | "extract";

const memory = createMemoryLimiter();
let warnedAboutFallback = false;

/** True when the error just means "that function doesn't exist in the database". */
export function isMissingFunctionError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function|function .* does not exist/i.test(error.message ?? "")
  );
}

export async function claimAiUse(
  client: RpcClient | null,
  userId: string,
  kind: AiKind,
  units: { audioSeconds: number; chars: number },
  limits: AiLimits = aiLimitsFromEnv(),
  disabled: boolean = isAiDisabled()
): Promise<ClaimResult> {
  if (disabled) return { ok: false, denial: denial("disabled") };

  const fallBackToStandIn = (): ClaimResult => {
    if (!warnedAboutFallback) {
      warnedAboutFallback = true;
      console.warn(
        "[ai-usage] database limits not available (run migration 020); using per-instance limits"
      );
    }
    return memory.claim(userId, kind, units.audioSeconds, limits);
  };

  if (!client) return fallBackToStandIn();

  const { data, error } = await client.rpc("claim_ai_use", {
    p_user_id: userId,
    p_kind: kind,
    p_audio_seconds: Math.max(0, Math.round(units.audioSeconds)),
    p_chars: Math.max(0, Math.round(units.chars)),
    p_per_minute: limits.perMinute,
    p_daily_count: kind === "transcribe" ? limits.dailyTranscriptions : limits.dailyExtractions,
    p_daily_audio_seconds: limits.dailyAudioMinutes * 60,
    p_global_daily: limits.globalDaily,
  });

  if (error) {
    if (isMissingFunctionError(error)) return fallBackToStandIn();
    console.error("[ai-usage] limit check failed", error.code ?? "", error.message ?? "");
    return { ok: false, denial: denial("unavailable") };
  }

  const result = data as
    | { ok: true; id?: string }
    | { ok: false; reason?: string; retry_after?: number }
    | null;
  if (result && result.ok === true) return { ok: true, id: result.id ?? null };

  const reason = result && result.ok === false ? result.reason : undefined;
  const retry = result && result.ok === false ? result.retry_after : undefined;
  switch (reason) {
    case "rate":
    case "daily":
    case "audio_minutes":
    case "global":
      return { ok: false, denial: denial(reason, retry) };
    default:
      return { ok: false, denial: denial("unavailable") };
  }
}

/** Gives the allowance back after a failed request. Best effort; never throws. */
export async function releaseAiUse(
  client: RpcClient | null,
  userId: string,
  id: string | null
): Promise<void> {
  if (!client || !id) return;
  try {
    await client.rpc("release_ai_use", { p_user_id: userId, p_id: id });
  } catch {
    // The allowance simply isn't returned.
  }
}

/**
 * One line per request in the server log: counts and sizes only. It never
 * includes audio, transcripts, names or notes. The person appears only as the
 * first part of their account id.
 */
export function logAiUsage(entry: {
  kind: AiKind;
  outcome: "ok" | "denied" | "failed";
  userId: string;
  reason?: string;
  audioSeconds?: number;
  bytes?: number;
  chars?: number;
}) {
  const parts = [
    `kind=${entry.kind}`,
    `outcome=${entry.outcome}`,
    `user=${entry.userId.slice(0, 8)}`,
    entry.reason ? `reason=${entry.reason}` : "",
    entry.audioSeconds !== undefined ? `audio_s=${Math.round(entry.audioSeconds)}` : "",
    entry.bytes !== undefined ? `bytes=${entry.bytes}` : "",
    entry.chars !== undefined ? `chars=${entry.chars}` : "",
  ].filter(Boolean);
  console.info(`[ai-usage] ${parts.join(" ")}`);
}

/** Test helper. */
export function resetAiUsageStandIn() {
  memory.reset();
  warnedAboutFallback = false;
}
