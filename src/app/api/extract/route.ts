import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  createClient,
  createServiceClientOrNull,
  isOpenAIConfigured,
} from "@/lib/supabase/server";
import { extractConversationFromTranscript } from "@/lib/ai/extraction";
import {
  logOpenAIError,
  missingOpenAIKeyResponse,
  openaiErrorForClient,
} from "@/lib/ai/openai-errors";
import {
  TRANSCRIPT_MAX_CHARS,
  checkTranscriptLength,
  denial,
} from "@/lib/ai/limits";
import { claimAiUse, logAiUsage, releaseAiUse } from "@/lib/ai/usage";
import { denialResponse } from "@/lib/ai/respond";

// A transcript of the maximum length, plus room for the other fields.
const MAX_BODY_BYTES = TRANSCRIPT_MAX_CHARS * 4 + 4096;

export async function POST(request: Request) {
  const service = createServiceClientOrNull();
  let userId = "";
  let claimId: string | null = null;

  try {
    if (!isOpenAIConfigured()) {
      const { message, status } = missingOpenAIKeyResponse();
      return NextResponse.json({ error: message }, { status });
    }
    const openaiKey = process.env.OPENAI_API_KEY!.trim();

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;

    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > MAX_BODY_BYTES) {
      logAiUsage({ kind: "extract", outcome: "denied", userId, reason: "transcript_too_long", bytes: declared });
      return denialResponse(denial("transcript_too_long"));
    }

    const body = await request.json().catch(() => null);
    const transcript = String(body?.transcript || "").trim();
    if (!transcript) {
      return NextResponse.json(
        { error: "Transcript is required." },
        { status: 400 }
      );
    }
    const tooLong = checkTranscriptLength(transcript);
    if (tooLong) {
      logAiUsage({ kind: "extract", outcome: "denied", userId, reason: tooLong.reason, chars: transcript.length });
      return denialResponse(tooLong);
    }

    const claim = await claimAiUse(service, userId, "extract", {
      audioSeconds: 0,
      chars: transcript.length,
    });
    if (!claim.ok) {
      logAiUsage({
        kind: "extract",
        outcome: "denied",
        userId,
        reason: claim.denial.reason,
        chars: transcript.length,
      });
      return denialResponse(claim.denial);
    }
    claimId = claim.id;

    const openai = new OpenAI({ apiKey: openaiKey });
    const extraction = await extractConversationFromTranscript(
      openai,
      transcript,
      {
        localDate: body.localDate ? String(body.localDate).slice(0, 32) : null,
        timezone: body.timezone ? String(body.timezone).slice(0, 64) : null,
      }
    );

    logAiUsage({ kind: "extract", outcome: "ok", userId, chars: transcript.length });
    return NextResponse.json({ extraction });
  } catch (error) {
    await releaseAiUse(service, userId, claimId);
    if (userId) logAiUsage({ kind: "extract", outcome: "failed", userId });
    logOpenAIError("extract", error);
    const { message, status } = openaiErrorForClient(error);
    return NextResponse.json({ error: message }, { status });
  }
}
