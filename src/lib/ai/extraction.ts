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

export const EXTRACTION_SYSTEM_PROMPT = `You extract structured ministry conversation notes from a transcript for a private personal organizer.

CRITICAL ACCURACY RULES:
- NEVER invent personal information.
- Only extract details that were clearly and explicitly stated in the transcript.
- If a detail was not clearly stated, leave that field as an empty string "".
- When you are unsure about a field, leave it empty AND add the field name to uncertain_fields so the user can confirm.
- Do NOT infer, guess, or assume: age, exact address, street numbers, GPS, beliefs, family circumstances, marital status, interest level, preferred visit time, publications shared, or follow-up plans — unless the speaker explicitly said them.
- Do NOT invent a person's name. If no name was spoken, person_name must be "".
- Do NOT invent scriptures. Only include references that were spoken.
- Do NOT invent questions. Only include questions the person actually asked.
- Use general locations only when spoken (e.g. "near the pharmacy"). Never fabricate a location.
- conversation_date must be YYYY-MM-DD only when a specific date is clear; otherwise "".
- For relative dates like "next Saturday", resolve them relative to today's date provided by the user ONLY when the speaker clearly promised a return.
- interest_level must be one of: unknown, low, moderate, high, very_high, or "" — leave "" unless the speaker clearly described interest.
- scriptures must be an array of scripture references that were spoken (empty array if none).
- summary must be 2-3 sentences based only on what was said. Do not add new facts.
- next_visit_preparation must be a short note based only on what was said; otherwise "".
- Return valid JSON only matching the schema.`;
