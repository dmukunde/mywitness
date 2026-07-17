import { z } from "zod";

export const extractionSchema = z.object({
  person_name: z.string().default(""),
  conversation_date: z.string().default(""),
  approximate_time: z.string().default(""),
  general_location: z.string().default(""),
  how_met: z.string().default(""),
  main_topic: z.string().default(""),
  scriptures: z.array(z.string()).default([]),
  questions_asked: z.string().default(""),
  concerns_circumstances: z.string().default(""),
  publications_shared: z.string().default(""),
  interest_level: z
    .enum(["", "unknown", "low", "moderate", "high", "very_high"])
    .default(""),
  promised_follow_up_date: z.string().default(""),
  promised_follow_up_time: z.string().default(""),
  next_topic: z.string().default(""),
  action_required: z.string().default(""),
  additional_notes: z.string().default(""),
  summary: z.string().default(""),
  next_visit_preparation: z.string().default(""),
  uncertain_fields: z.array(z.string()).default([]),
});

export const EXTRACTION_SYSTEM_PROMPT = `You are an assistant that extracts structured ministry conversation notes from a transcript.

Rules:
- Only extract information clearly supported by the transcript.
- If uncertain, leave the field as an empty string and add the field name to uncertain_fields.
- Never invent personal details, names, dates, scriptures, or locations.
- Use general locations only (e.g. "near the pharmacy"), never GPS or street numbers unless spoken.
- conversation_date should be YYYY-MM-DD when a specific date is clear; otherwise "".
- For relative dates like "next Saturday", resolve them relative to today's date provided by the user.
- interest_level must be one of: unknown, low, moderate, high, very_high, or "".
- scriptures must be an array of scripture references.
- summary must be 2-3 sentences.
- next_visit_preparation must be a short preparation note.
- Return valid JSON only matching the schema.`;
