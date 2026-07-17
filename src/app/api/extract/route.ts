import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import {
  EXTRACTION_SYSTEM_PROMPT,
  extractionSchema,
} from "@/lib/ai/extraction";
import { format } from "date-fns";

export async function POST(request: Request) {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

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
    const extraction = extractionSchema.parse(JSON.parse(raw));

    return NextResponse.json({ extraction });
  } catch (error) {
    console.error("extract error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Extraction failed.",
      },
      { status: 500 }
    );
  }
}
