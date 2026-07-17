import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient, isOpenAIConfigured } from "@/lib/supabase/server";
import { extractConversationFromTranscript } from "@/lib/ai/extraction";
import {
  logOpenAIError,
  missingOpenAIKeyResponse,
  openaiErrorForClient,
} from "@/lib/ai/openai-errors";

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const transcript = String(body.transcript || "").trim();
    if (!transcript) {
      return NextResponse.json(
        { error: "Transcript is required." },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey: openaiKey });
    const extraction = await extractConversationFromTranscript(
      openai,
      transcript,
      {
        localDate: body.localDate ? String(body.localDate) : null,
        timezone: body.timezone ? String(body.timezone) : null,
      }
    );

    return NextResponse.json({ extraction });
  } catch (error) {
    logOpenAIError("extract", error);
    const { message, status } = openaiErrorForClient(error);
    return NextResponse.json({ error: message }, { status });
  }
}
