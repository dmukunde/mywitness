import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient, isOpenAIConfigured } from "@/lib/supabase/server";
import { extractConversationFromTranscript } from "@/lib/ai/extraction";
import {
  logOpenAIError,
  missingOpenAIKeyResponse,
  openaiErrorForClient,
} from "@/lib/ai/openai-errors";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
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
        { error: "Please sign in again to record conversations." },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const audio = formData.get("audio");
    const localDate = String(formData.get("localDate") || "");
    const timezone = String(formData.get("timezone") || "");

    if (!(audio instanceof File)) {
      return NextResponse.json(
        { error: "Audio file is required." },
        { status: 400 }
      );
    }

    if (audio.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Recording is too large. Please keep it under 10 minutes." },
        { status: 400 }
      );
    }

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

    const extraction = await extractConversationFromTranscript(
      openai,
      transcript,
      { localDate, timezone }
    );

    return NextResponse.json({
      transcript,
      extraction,
      audioPath: uploadError ? null : audioPath,
    });
  } catch (error) {
    logOpenAIError("transcribe", error);
    const { message, status } = openaiErrorForClient(error);
    return NextResponse.json({ error: message }, { status });
  }
}
