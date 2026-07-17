import type OpenAI from "openai";
import {
  buildExtractionUserPrompt,
  enrichExtraction,
  extractionContextFromParts,
  EXTRACTION_SYSTEM_PROMPT,
  normalizeAndParseExtraction,
  shouldRetryExtraction,
  type ConversationExtraction,
  type ExtractionContext,
} from "./extract-pipeline";

export type {
  ConversationExtraction,
  ExtractionContext,
} from "./extract-pipeline";

export {
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
  buildSummaryFromStructured,
  enrichExtraction,
  extractionContextFromParts,
  extractionSchema,
  extractQuestions,
  extractScriptures,
  normalizeAndParseExtraction,
  shouldRetryExtraction,
} from "./extract-pipeline";

export async function extractConversationFromTranscript(
  openai: OpenAI,
  transcript: string,
  contextParts: {
    localDate?: string | null;
    timezone?: string | null;
  }
): Promise<ConversationExtraction> {
  const ctx = extractionContextFromParts(contextParts);
  let extraction = await callExtractOnce(openai, transcript, ctx);
  extraction = enrichExtraction(extraction, transcript, ctx);

  if (shouldRetryExtraction(extraction, transcript)) {
    const retry = await callExtractOnce(openai, transcript, ctx, true);
    const enrichedRetry = enrichExtraction(retry, transcript, ctx);
    extraction = mergePreferFilled(extraction, enrichedRetry);
    extraction = enrichExtraction(extraction, transcript, ctx);
  }

  return extraction;
}

async function callExtractOnce(
  openai: OpenAI,
  transcript: string,
  ctx: ExtractionContext,
  isRetry = false
): Promise<ConversationExtraction> {
  const retryNote = isRetry
    ? "\n\nRETRY: Previous extraction left important fields blank. Fill every field that is clearly present in the transcript (person, location, topic, scriptures, questions, return date, next topic, materials)."
    : "";

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: isRetry ? 0.1 : 0.2,
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      {
        role: "user",
        content: buildExtractionUserPrompt(transcript, ctx) + retryNote,
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
  return normalizeAndParseExtraction(parsed);
}

function mergePreferFilled(
  a: ConversationExtraction,
  b: ConversationExtraction
): ConversationExtraction {
  return normalizeAndParseExtraction({
    person_name: a.person_name || b.person_name,
    main_discussion_topic: a.main_discussion_topic || b.main_discussion_topic,
    scriptures_discussed:
      a.scriptures_discussed.length > 0
        ? a.scriptures_discussed
        : b.scriptures_discussed,
    questions_raised:
      a.questions_raised.length > 0 ? a.questions_raised : b.questions_raised,
    proposed_return_visit_date:
      a.proposed_return_visit_date || b.proposed_return_visit_date,
    proposed_return_visit_time:
      a.proposed_return_visit_time || b.proposed_return_visit_time,
    proposed_return_visit_date_phrase:
      a.proposed_return_visit_date_phrase ||
      b.proposed_return_visit_date_phrase,
    next_planned_topic: a.next_planned_topic || b.next_planned_topic,
    general_location: a.general_location || b.general_location,
    materials_shared:
      a.materials_shared.length > 0 ? a.materials_shared : b.materials_shared,
    interest_level: a.interest_level || b.interest_level,
    additional_notes: a.additional_notes || b.additional_notes,
    summary: a.summary || b.summary,
  });
}
