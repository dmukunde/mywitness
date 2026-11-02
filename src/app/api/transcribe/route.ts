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
  VOICE_NOTE_MAX_BYTES,
  checkUpload,
  denial,
  parseClaimedSeconds,
} from "@/lib/ai/limits";
import { claimAiUse, logAiUsage, releaseAiUse } from "@/lib/ai/usage";
import { denialResponse } from "@/lib/ai/respond";

export const runtime = "nodejs";
export const maxDuration = 60;

// Room for the form's other fields around the audio itself.
const BODY_OVERHEAD_BYTES = 256 * 1024;

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
      return NextResponse.json(
        { error: "Please sign in again to use voice notes." },
        { status: 401 }
      );
    }
    userId = user.id;

    // Refuse an oversized upload before reading any of it.
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > VOICE_NOTE_MAX_BYTES + BODY_OVERHEAD_BYTES) {
      logAiUsage({ kind: "transcribe", outcome: "denied", userId, reason: "too_large", bytes: declared });
      return denialResponse(denial("too_large"));
    }

    const formData = await request.formData();
    const audio = formData.get("audio");
    const localDate = String(formData.get("localDate") || "").slice(0, 32);
    const timezone = String(formData.get("timezone") || "").slice(0, 64);

    if (!(audio instanceof File)) {
      return NextResponse.json(
        { error: "Audio file is required." },
        { status: 400 }
      );
    }

    // Size and length, checked on the server whatever the app sent.
    const upload = checkUpload({
      bytes: audio.size,
      claimedSeconds: parseClaimedSeconds(formData.get("durationSeconds")),
    });
    if (!upload.ok) {
      logAiUsage({
        kind: "transcribe",
        outcome: "denied",
        userId,
        reason: upload.denial.reason,
        bytes: audio.size,
      });
      return denialResponse(upload.denial);
    }

    // Rate limit and daily allowance; recorded before any paid work starts.
    const claim = await claimAiUse(service, userId, "transcribe", {
      audioSeconds: upload.seconds,
      chars: 0,
    });
    if (!claim.ok) {
      logAiUsage({
        kind: "transcribe",
        outcome: "denied",
        userId,
        reason: claim.denial.reason,
        audioSeconds: upload.seconds,
        bytes: audio.size,
      });
      return denialResponse(claim.denial);
    }
    claimId = claim.id;

    const openai = new OpenAI({ apiKey: openaiKey });

    const ext = audio.name.split(".").pop() || "webm";
    const audioPath = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await audio.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("conversation-audio")
      .upload(audioPath, buffer, {
        contentType: audio.type || "audio/webm",
        upsert: false,
      });

    if (uploadError) {
      console.error(uploadError);
    }

    const file = new File([buffer], audio.name || "recording.webm", {
      type: audio.type || "audio/webm",
    });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      response_format: "text",
    });

    const transcript =
      typeof transcription === "string"
        ? transcription
        : (transcription as { text?: string }).text || "";

    // Never send more than the limit on to the second paid step.
    const extraction = await extractConversationFromTranscript(
      openai,
      transcript.slice(0, TRANSCRIPT_MAX_CHARS),
      { localDate, timezone }
    );

    logAiUsage({
      kind: "transcribe",
      outcome: "ok",
      userId,
      audioSeconds: upload.seconds,
      bytes: audio.size,
      chars: transcript.length,
    });

    return NextResponse.json({
      transcript,
      extraction,
      audioPath: uploadError ? null : audioPath,
    });
  } catch (error) {
    // A request that failed on our side shouldn't use up the person's allowance.
    await releaseAiUse(service, userId, claimId);
    if (userId) logAiUsage({ kind: "transcribe", outcome: "failed", userId });
    logOpenAIError("transcribe", error);
    const { message, status } = openaiErrorForClient(error);
    return NextResponse.json({ error: message }, { status });
  }
}
