import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_LIMITS } from "@/lib/ai/limits";
import {
  claimAiUse,
  isMissingFunctionError,
  logAiUsage,
  releaseAiUse,
  resetAiUsageStandIn,
  type RpcClient,
} from "@/lib/ai/usage";

const USER = "11111111-2222-3333-4444-555555555555";

function client(answer: { data?: unknown; error?: { code?: string; message?: string } | null }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const c: RpcClient = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      return { data: answer.data ?? null, error: answer.error ?? null };
    },
  };
  return { c, calls };
}

beforeEach(() => {
  resetAiUsageStandIn();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("claimAiUse (database)", () => {
  it("allows a request the database approves, and keeps its id so it can be given back", async () => {
    const { c } = client({ data: { ok: true, id: "evt-1" } });
    const r = await claimAiUse(c, USER, "transcribe", { audioSeconds: 60, chars: 0 }, DEFAULT_AI_LIMITS, false);
    expect(r).toEqual({ ok: true, id: "evt-1" });
  });

  it("sends the right limits for each kind of request", async () => {
    const limits = { ...DEFAULT_AI_LIMITS, dailyTranscriptions: 7, dailyExtractions: 9, dailyAudioMinutes: 3, perMinute: 2, globalDaily: 11 };
    const a = client({ data: { ok: true, id: "x" } });
    await claimAiUse(a.c, USER, "transcribe", { audioSeconds: 61.4, chars: 0 }, limits, false);
    expect(a.calls[0].fn).toBe("claim_ai_use");
    expect(a.calls[0].args).toMatchObject({
      p_user_id: USER,
      p_kind: "transcribe",
      p_audio_seconds: 61,
      p_per_minute: 2,
      p_daily_count: 7,
      p_daily_audio_seconds: 180,
      p_global_daily: 11,
    });
    const b = client({ data: { ok: true, id: "y" } });
    await claimAiUse(b.c, USER, "extract", { audioSeconds: 0, chars: 500 }, limits, false);
    expect(b.calls[0].args).toMatchObject({ p_kind: "extract", p_daily_count: 9, p_chars: 500 });
  });

  it("turns each database refusal into a friendly message", async () => {
    for (const [reason, status] of [
      ["rate", 429],
      ["daily", 429],
      ["audio_minutes", 429],
      ["global", 503],
    ] as const) {
      const { c } = client({ data: { ok: false, reason, retry_after: 120 } });
      const r = await claimAiUse(c, USER, "transcribe", { audioSeconds: 10, chars: 0 }, DEFAULT_AI_LIMITS, false);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.denial.reason).toBe(reason);
        expect(r.denial.status).toBe(status);
      }
    }
  });

  it("refuses (rather than allowing) when the database gives an unexpected error", async () => {
    const { c } = client({ error: { code: "57P01", message: "terminating connection" } });
    const r = await claimAiUse(c, USER, "transcribe", { audioSeconds: 10, chars: 0 }, DEFAULT_AI_LIMITS, false);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.denial.reason).toBe("unavailable");
      expect(r.denial.status).toBe(503);
    }
  });

  it("refuses an answer it does not understand", async () => {
    const { c } = client({ data: { weird: true } });
    const r = await claimAiUse(c, USER, "transcribe", { audioSeconds: 10, chars: 0 }, DEFAULT_AI_LIMITS, false);
    expect(r.ok).toBe(false);
  });

  it("does nothing at all when the emergency switch is on", async () => {
    const { c, calls } = client({ data: { ok: true, id: "x" } });
    const r = await claimAiUse(c, USER, "transcribe", { audioSeconds: 10, chars: 0 }, DEFAULT_AI_LIMITS, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.denial.reason).toBe("disabled");
    expect(calls).toHaveLength(0);
  });
});

describe("before migration 020 is installed", () => {
  it("recognises that-function-does-not-exist errors", () => {
    expect(isMissingFunctionError({ code: "PGRST202" })).toBe(true);
    expect(isMissingFunctionError({ code: "42883" })).toBe(true);
    expect(isMissingFunctionError({ message: "Could not find the function public.claim_ai_use" })).toBe(true);
    expect(isMissingFunctionError({ code: "57P01", message: "connection lost" })).toBe(false);
  });

  it("keeps working, with limits still switched on", async () => {
    const { c } = client({ error: { code: "PGRST202", message: "Could not find the function" } });
    const limits = { ...DEFAULT_AI_LIMITS, perMinute: 2 };
    expect((await claimAiUse(c, USER, "transcribe", { audioSeconds: 5, chars: 0 }, limits, false)).ok).toBe(true);
    expect((await claimAiUse(c, USER, "transcribe", { audioSeconds: 5, chars: 0 }, limits, false)).ok).toBe(true);
    const third = await claimAiUse(c, USER, "transcribe", { audioSeconds: 5, chars: 0 }, limits, false);
    expect(third.ok).toBe(false);
  });

  it("also limits when no server connection is available", async () => {
    const limits = { ...DEFAULT_AI_LIMITS, perMinute: 1 };
    expect((await claimAiUse(null, USER, "extract", { audioSeconds: 0, chars: 10 }, limits, false)).ok).toBe(true);
    expect((await claimAiUse(null, USER, "extract", { audioSeconds: 0, chars: 10 }, limits, false)).ok).toBe(false);
  });
});

describe("releaseAiUse", () => {
  it("gives the allowance back for a failed request", async () => {
    const { c, calls } = client({ data: null });
    await releaseAiUse(c, USER, "evt-1");
    expect(calls).toEqual([{ fn: "release_ai_use", args: { p_user_id: USER, p_id: "evt-1" } }]);
  });

  it("does nothing without an id or a connection, and never throws", async () => {
    const { c, calls } = client({ data: null });
    await releaseAiUse(c, USER, null);
    await releaseAiUse(null, USER, "evt-1");
    expect(calls).toHaveLength(0);
    const broken: RpcClient = { rpc: () => Promise.reject(new Error("down")) };
    await expect(releaseAiUse(broken, USER, "evt-1")).resolves.toBeUndefined();
  });
});

describe("usage log", () => {
  it("records counts and sizes only, never content, and shortens the account id", () => {
    logAiUsage({ kind: "transcribe", outcome: "ok", userId: USER, audioSeconds: 61.2, bytes: 123456, chars: 800 });
    logAiUsage({ kind: "extract", outcome: "denied", userId: USER, reason: "daily", chars: 5000 });
    const lines = (console.info as unknown as { mock: { calls: string[][] } }).mock.calls.map((c) => c[0]);
    expect(lines[0]).toBe("[ai-usage] kind=transcribe outcome=ok user=11111111 audio_s=61 bytes=123456 chars=800");
    expect(lines[1]).toBe("[ai-usage] kind=extract outcome=denied user=11111111 reason=daily chars=5000");
    for (const l of lines) expect(l).not.toContain(USER);
  });
});
