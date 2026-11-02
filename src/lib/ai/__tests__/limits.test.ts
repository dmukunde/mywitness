import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_LIMITS,
  TRANSCRIPT_MAX_CHARS,
  VOICE_NOTE_MAX_BYTES,
  VOICE_NOTE_MAX_SECONDS,
  aiLimitsFromEnv,
  checkTranscriptLength,
  checkUpload,
  createMemoryLimiter,
  denial,
  effectiveAudioSeconds,
  isAiDisabled,
  parseClaimedSeconds,
  type AiDenyReason,
} from "@/lib/ai/limits";

describe("limits from settings", () => {
  it("uses the defaults when nothing is set", () => {
    expect(aiLimitsFromEnv({})).toEqual(DEFAULT_AI_LIMITS);
  });

  it("lets each limit be changed", () => {
    expect(
      aiLimitsFromEnv({
        AI_LIMIT_PER_MINUTE: "3",
        AI_LIMIT_DAILY_TRANSCRIPTIONS: "10",
        AI_LIMIT_DAILY_EXTRACTIONS: "20",
        AI_LIMIT_DAILY_AUDIO_MINUTES: "30",
        AI_LIMIT_GLOBAL_DAILY: "500",
      })
    ).toEqual({
      perMinute: 3,
      dailyTranscriptions: 10,
      dailyExtractions: 20,
      dailyAudioMinutes: 30,
      globalDaily: 500,
    });
  });

  it("ignores values that are not whole numbers above zero, rather than switching a limit off", () => {
    for (const bad of ["abc", "0", "-3", "2.5", "", "  ", "Infinity"]) {
      expect(aiLimitsFromEnv({ AI_LIMIT_PER_MINUTE: bad }).perMinute).toBe(
        DEFAULT_AI_LIMITS.perMinute
      );
    }
  });

  it("has an emergency off switch", () => {
    expect(isAiDisabled({})).toBe(false);
    expect(isAiDisabled({ AI_DISABLED: "1" })).toBe(true);
    expect(isAiDisabled({ AI_DISABLED: "true" })).toBe(true);
    expect(isAiDisabled({ AI_DISABLED: "0" })).toBe(false);
  });

  it("starts with limits that fit normal personal use", () => {
    // A heavy but honest day: a dozen notes, a few minutes each.
    expect(DEFAULT_AI_LIMITS.dailyTranscriptions).toBeGreaterThanOrEqual(30);
    expect(DEFAULT_AI_LIMITS.dailyAudioMinutes).toBeGreaterThanOrEqual(60);
    expect(VOICE_NOTE_MAX_SECONDS).toBeGreaterThanOrEqual(10 * 60);
    expect(DEFAULT_AI_LIMITS.perMinute).toBeGreaterThanOrEqual(3);
  });
});

describe("checking an upload", () => {
  it("accepts a normal voice note", () => {
    const r = checkUpload({ bytes: 300_000, claimedSeconds: 75 });
    expect(r).toEqual({ ok: true, seconds: 75 });
  });

  it("accepts a note right at the limit, with a little leeway", () => {
    expect(checkUpload({ bytes: 2_400_000, claimedSeconds: VOICE_NOTE_MAX_SECONDS }).ok).toBe(true);
    expect(checkUpload({ bytes: 2_400_000, claimedSeconds: VOICE_NOTE_MAX_SECONDS + 10 }).ok).toBe(true);
  });

  it("refuses a note that is too long, with a friendly message", () => {
    const r = checkUpload({ bytes: 2_000_000, claimedSeconds: VOICE_NOTE_MAX_SECONDS + 60 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.denial.reason).toBe("too_long");
      expect(r.denial.message).toMatch(/shorter parts/i);
    }
  });

  it("refuses a file that is too big, whatever length it claims", () => {
    const r = checkUpload({ bytes: VOICE_NOTE_MAX_BYTES + 1, claimedSeconds: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.denial.status).toBe(413);
  });

  it("refuses an empty file", () => {
    const r = checkUpload({ bytes: 0, claimedSeconds: 5 });
    expect(r.ok).toBe(false);
  });

  it("counts a falsely short claim on a large file by its size", () => {
    // 4 MB claiming to be 2 seconds long still counts for about 100 seconds.
    expect(effectiveAudioSeconds(4_000_000, 2)).toBeGreaterThanOrEqual(100);
    expect(effectiveAudioSeconds(100_000, 60)).toBe(60);
    expect(effectiveAudioSeconds(100_000, null)).toBe(3);
  });

  it("reads the reported length safely", () => {
    expect(parseClaimedSeconds("42")).toBe(42);
    expect(parseClaimedSeconds("12.5")).toBe(12.5);
    for (const bad of [null, "", "abc", "-1", "NaN", "999999999"]) {
      expect(parseClaimedSeconds(bad)).toBeNull();
    }
  });
});

describe("transcript length", () => {
  it("accepts text up to the limit and refuses more", () => {
    expect(checkTranscriptLength("a".repeat(TRANSCRIPT_MAX_CHARS))).toBeNull();
    expect(checkTranscriptLength("a".repeat(TRANSCRIPT_MAX_CHARS + 1))?.reason).toBe(
      "transcript_too_long"
    );
  });
});

describe("messages", () => {
  const reasons: AiDenyReason[] = [
    "rate",
    "daily",
    "audio_minutes",
    "global",
    "disabled",
    "unavailable",
    "too_large",
    "too_long",
    "transcript_too_long",
    "invalid",
  ];

  it("are plain language, never technical, for every reason", () => {
    for (const r of reasons) {
      const d = denial(r, 90);
      expect(d.message.length).toBeGreaterThan(20);
      expect(d.message).not.toMatch(/undefined|null|error code|exception|supabase|rpc|sql/i);
      expect([400, 413, 429, 503]).toContain(d.status);
    }
  });

  it("tell people they can still type their note when a limit is reached", () => {
    expect(denial("daily", 600).message).toMatch(/type your note/i);
    expect(denial("audio_minutes").message).toMatch(/type your note/i);
    expect(denial("global").message).toMatch(/type your note/i);
  });

  it("use 429 for limits people can wait out and 503 when the service is paused", () => {
    expect(denial("rate", 30).status).toBe(429);
    expect(denial("daily", 30).status).toBe(429);
    expect(denial("global").status).toBe(503);
    expect(denial("disabled").status).toBe(503);
  });
});

describe("per-instance stand-in limiter", () => {
  const limits = { ...DEFAULT_AI_LIMITS, perMinute: 3, dailyTranscriptions: 5, dailyAudioMinutes: 2 };

  it("allows a few quick requests, then asks the person to wait", () => {
    let t = 1_000_000;
    const m = createMemoryLimiter(() => t);
    for (let i = 0; i < 3; i++) expect(m.claim("u1", "transcribe", 10, limits).ok).toBe(true);
    const blocked = m.claim("u1", "transcribe", 10, limits);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.denial.reason).toBe("rate");
      expect(blocked.denial.retryAfter).toBeGreaterThan(0);
    }
    t += 61_000;
    expect(m.claim("u1", "transcribe", 10, limits).ok).toBe(true);
  });

  it("enforces the daily count and gives it back as time passes", () => {
    let t = 0;
    const m = createMemoryLimiter(() => t);
    const roomy = { ...limits, perMinute: 100, dailyAudioMinutes: 1000 };
    for (let i = 0; i < 5; i++) {
      expect(m.claim("u1", "transcribe", 1, roomy).ok).toBe(true);
      t += 2 * 60_000;
    }
    const blocked = m.claim("u1", "transcribe", 1, roomy);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.denial.reason).toBe("daily");
    t += 24 * 3600 * 1000;
    expect(m.claim("u1", "transcribe", 1, roomy).ok).toBe(true);
  });

  it("limits minutes of audio per day", () => {
    const m = createMemoryLimiter(() => 0);
    expect(m.claim("u1", "transcribe", 100, { ...limits, perMinute: 100 }).ok).toBe(true);
    const r = m.claim("u1", "transcribe", 100, { ...limits, perMinute: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.denial.reason).toBe("audio_minutes");
  });

  it("keeps each person's allowance separate", () => {
    const m = createMemoryLimiter(() => 0);
    for (let i = 0; i < 3; i++) m.claim("u1", "transcribe", 1, limits);
    expect(m.claim("u1", "transcribe", 1, limits).ok).toBe(false);
    expect(m.claim("u2", "transcribe", 1, limits).ok).toBe(true);
  });
});
