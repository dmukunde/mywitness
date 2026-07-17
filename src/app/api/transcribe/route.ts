import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient, isOpenAIConfigured } from "@/lib/supabase/server";
import {
  EXTRACTION_SYSTEM_PROMPT,
  extractionSchema,
} from "@/lib/ai/extraction";
import { format } from "date-fns";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    if (!isOpenAIConfigured()) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY is missing or still a placeholder. Add a real key in .env.local (and Vercel), then restart.",
        },
        { status: 500 }
      );
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

    if (!(audio instanceof File)) {
      return NextResponse.json(
        { error: "Audio file is required." },
        { status: 400 }
      );
    }

    // Soft limit ~10 minutes / 25MB
    if (audio.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Recording is too large. Please keep it under 10 minutes." },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey: openaiKey });

    // Upload to private storage temporarily
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
      // Continue with transcription even if storage fails
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

    const today = format(new Date(), "yyyy-MM-dd");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Today's date is ${today}.\n\nTranscript:\n${transcript}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const extraction = extractionSchema.parse(parsed);

    // If user settings say not to keep audio, leave path for client to decide on save
    return NextResponse.json({
      transcript,
      extraction,
      audioPath: uploadError ? null : audioPath,
    });
  } catch (error) {
    console.error("transcribe error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Transcription or extraction failed.",
      },
      { status: 500 }
    );
  }
}
