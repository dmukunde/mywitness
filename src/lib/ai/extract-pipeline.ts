import { z } from "zod";
import { format, parseISO } from "date-fns";
import {
  findAndResolveReturnVisit,
  resolveRelativeDatePhrase,
} from "./relative-dates";

/** Canonical extraction keys returned by the API and used by the frontend. */
export const extractionSchema = z.object({
  person_name: z.string().default(""),
  main_discussion_topic: z.string().default(""),
  scriptures_discussed: z.array(z.string()).default([]),
  questions_raised: z.array(z.string()).default([]),
  proposed_return_visit_date: z.string().nullable().default(null),
  proposed_return_visit_time: z.string().default(""),
  /** Original relative phrase when a date was resolved (e.g. "next Friday"). */
  proposed_return_visit_date_phrase: z.string().default(""),
  next_planned_topic: z.string().default(""),
  general_location: z.string().default(""),
  materials_shared: z.array(z.string()).default([]),
  interest_level: z.string().default(""),
  additional_notes: z.string().default(""),
  summary: z.string().default(""),
});

export type ConversationExtraction = z.infer<typeof extractionSchema>;

export type ExtractionContext = {
  localDate: string;
  localDay: string;
  timezone: string;
};

const ALIAS_TO_CANONICAL: Record<string, keyof ConversationExtraction> = {
  person_name: "person_name",
  name: "person_name",
  main_discussion_topic: "main_discussion_topic",
  main_topic: "main_discussion_topic",
  topic: "main_discussion_topic",
  discussion_topic: "main_discussion_topic",
  scriptures_discussed: "scriptures_discussed",
  scriptures: "scriptures_discussed",
  scripture: "scriptures_discussed",
  questions_raised: "questions_raised",
  questions: "questions_raised",
  questions_asked: "questions_raised",
  question: "questions_raised",
  proposed_return_visit_date: "proposed_return_visit_date",
  return_date: "proposed_return_visit_date",
  return_visit_date: "proposed_return_visit_date",
  promised_follow_up_date: "proposed_return_visit_date",
  follow_up_date: "proposed_return_visit_date",
  proposed_return_visit_time: "proposed_return_visit_time",
  return_time: "proposed_return_visit_time",
  promised_follow_up_time: "proposed_return_visit_time",
  follow_up_time: "proposed_return_visit_time",
  proposed_return_visit_date_phrase: "proposed_return_visit_date_phrase",
  return_date_phrase: "proposed_return_visit_date_phrase",
  next_planned_topic: "next_planned_topic",
  next_topic: "next_planned_topic",
  planned_topic: "next_planned_topic",
  general_location: "general_location",
  location: "general_location",
  materials_shared: "materials_shared",
  publications_shared: "materials_shared",
  materials: "materials_shared",
  publications: "materials_shared",
  interest_level: "interest_level",
  additional_notes: "additional_notes",
  notes: "additional_notes",
  summary: "summary",
};

export const EXTRACTION_SYSTEM_PROMPT = `You extract structured ministry conversation notes from a transcript for a private personal organizer.

Return ONLY valid JSON with exactly these keys:
{
  "person_name": "",
  "main_discussion_topic": "",
  "scriptures_discussed": [],
  "questions_raised": [],
  "proposed_return_visit_date": null,
  "proposed_return_visit_time": "",
  "next_planned_topic": "",
  "general_location": "",
  "materials_shared": [],
  "interest_level": "",
  "additional_notes": "",
  "summary": ""
}

CRITICAL RULES:
- NEVER invent details. Only extract what was clearly stated.
- If a detail was not clearly stated, use "" , [] , or null as appropriate.
- person_name: the person's name if spoken; otherwise "".
- general_location: place/area if spoken (e.g. "Kira"); otherwise "".
- main_discussion_topic: the main subject discussed (not empty if a topic was clearly discussed).
- scriptures_discussed: array of spoken scripture references only (e.g. ["James 1:13"]).
- questions_raised: array of questions the person asked or that were raised, as clear question strings.
- proposed_return_visit_date: ISO date YYYY-MM-DD when a return/follow-up was promised. Resolve relative dates using the Current local date context (e.g. "next Friday" on Friday 2026-07-17 → "2026-07-24"). Use null only if no return was mentioned.
- proposed_return_visit_time: "Morning", "Afternoon", "Evening", or "" when a time period was spoken.
- next_planned_topic: what they planned to discuss on the return visit.
- materials_shared: publications/brochures/tracts left or shared (e.g. ["Brochure"]).
- interest_level: unknown|low|moderate|high|very_high or "" only if clearly indicated.
- summary: 2-3 sentences built ONLY from the structured fields above (same facts). Do not invent extra facts.
- Do not use alternate key names. Use the exact keys listed.`;

export function buildExtractionUserPrompt(
  transcript: string,
  ctx: ExtractionContext
): string {
  return `Current local date: ${ctx.localDate}
Current local day: ${ctx.localDay}
Timezone: ${ctx.timezone}

Resolve any relative return dates (next Friday, tomorrow afternoon, in two weeks, etc.) into proposed_return_visit_date as YYYY-MM-DD using the current local date above.

Transcript:
${transcript}`;
}

/** Normalize alternate AI keys into the canonical schema, then validate. */
export function normalizeAndParseExtraction(
  raw: unknown
): ConversationExtraction {
  const normalized = normalizeKeys(raw);
  return extractionSchema.parse(normalized);
}

function normalizeKeys(raw: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {
    person_name: "",
    main_discussion_topic: "",
    scriptures_discussed: [],
    questions_raised: [],
    proposed_return_visit_date: null,
    proposed_return_visit_time: "",
    proposed_return_visit_date_phrase: "",
    next_planned_topic: "",
    general_location: "",
    materials_shared: [],
    interest_level: "",
    additional_notes: "",
    summary: "",
  };

  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;

  for (const [key, value] of Object.entries(obj)) {
    const canonical = ALIAS_TO_CANONICAL[key];
    if (!canonical) continue;

    if (
      canonical === "scriptures_discussed" ||
      canonical === "questions_raised" ||
      canonical === "materials_shared"
    ) {
      out[canonical] = toStringArray(value);
      continue;
    }

    if (canonical === "proposed_return_visit_date") {
      if (value == null || value === "") {
        out[canonical] = null;
      } else {
        out[canonical] = String(value).trim();
      }
      continue;
    }

    if (typeof value === "string") {
      out[canonical] = value.trim();
    } else if (value == null) {
      out[canonical] = "";
    } else if (Array.isArray(value)) {
      out[canonical] = value.map(String).join("; ");
    } else {
      out[canonical] = String(value);
    }
  }

  return out;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (value == null) return [];
  return [String(value).trim()].filter(Boolean);
}

/**
 * Apply deterministic date resolution and fill blanks from transcript heuristics.
 * Rebuilds summary from the structured fields.
 */
export function enrichExtraction(
  extraction: ConversationExtraction,
  transcript: string,
  ctx: ExtractionContext
): ConversationExtraction {
  const ref = parseISO(ctx.localDate);
  const next = { ...extraction };

  const fromTranscript = findAndResolveReturnVisit(transcript, ref);

  if (
    next.proposed_return_visit_date &&
    !/^\d{4}-\d{2}-\d{2}$/.test(next.proposed_return_visit_date)
  ) {
    const resolved = resolveRelativeDatePhrase(
      next.proposed_return_visit_date,
      ref
    );
    if (resolved.date) {
      next.proposed_return_visit_date_phrase =
        next.proposed_return_visit_date_phrase ||
        next.proposed_return_visit_date;
      next.proposed_return_visit_date = resolved.date;
      if (resolved.timePeriod && !next.proposed_return_visit_time) {
        next.proposed_return_visit_time = resolved.timePeriod;
      }
    }
  }

  // Prefer deterministic resolution when a relative phrase is present
  if (fromTranscript.date && fromTranscript.originalPhrase) {
    next.proposed_return_visit_date = fromTranscript.date;
    next.proposed_return_visit_date_phrase = fromTranscript.originalPhrase;
    if (fromTranscript.timePeriod) {
      next.proposed_return_visit_time = fromTranscript.timePeriod;
    }
  } else if (!next.proposed_return_visit_date && fromTranscript.date) {
    next.proposed_return_visit_date = fromTranscript.date;
    next.proposed_return_visit_date_phrase =
      fromTranscript.originalPhrase || "";
    if (fromTranscript.timePeriod && !next.proposed_return_visit_time) {
      next.proposed_return_visit_time = fromTranscript.timePeriod;
    }
  }

  if (!next.person_name) {
    const name = extractPersonName(transcript);
    if (name) next.person_name = name;
  }
  if (!next.general_location) {
    const loc = extractLocation(transcript);
    if (loc) next.general_location = loc;
  }
  if (!next.main_discussion_topic) {
    const topic = extractMainTopic(transcript);
    if (topic) next.main_discussion_topic = topic;
  }
  if (next.scriptures_discussed.length === 0) {
    next.scriptures_discussed = extractScriptures(transcript);
  }
  if (next.questions_raised.length === 0) {
    next.questions_raised = extractQuestions(transcript);
  }
  if (!next.next_planned_topic) {
    const planned = extractNextTopic(transcript);
    if (planned) next.next_planned_topic = planned;
  }
  if (next.materials_shared.length === 0) {
    next.materials_shared = extractMaterials(transcript);
  }

  next.summary = buildSummaryFromStructured(next);
  return extractionSchema.parse(next);
}

export function buildSummaryFromStructured(e: ConversationExtraction): string {
  const parts: string[] = [];

  if (e.person_name && e.general_location) {
    parts.push(`Met ${e.person_name} in ${e.general_location}.`);
  } else if (e.person_name) {
    parts.push(`Met ${e.person_name}.`);
  } else if (e.general_location) {
    parts.push(`Conversation in ${e.general_location}.`);
  }

  if (e.main_discussion_topic) {
    parts.push(`Discussed ${e.main_discussion_topic}.`);
  }

  if (e.scriptures_discussed.length) {
    parts.push(`Scriptures: ${e.scriptures_discussed.join("; ")}.`);
  }

  if (e.questions_raised.length) {
    parts.push(`Questions raised: ${e.questions_raised.join("; ")}`);
  }

  if (e.materials_shared.length) {
    parts.push(`Shared: ${e.materials_shared.join(", ")}.`);
  }

  if (e.proposed_return_visit_date) {
    const when = format(
      parseISO(e.proposed_return_visit_date),
      "EEEE, MMMM d, yyyy"
    );
    const time = e.proposed_return_visit_time
      ? ` (${e.proposed_return_visit_time})`
      : "";
    const topic = e.next_planned_topic
      ? ` to discuss ${e.next_planned_topic}`
      : "";
    parts.push(`Promised to return on ${when}${time}${topic}.`);
  } else if (e.next_planned_topic) {
    parts.push(`Next topic: ${e.next_planned_topic}.`);
  }

  return parts.join(" ").trim();
}

/** True when transcript likely has content the structured object missed. */
export function shouldRetryExtraction(
  extraction: ConversationExtraction,
  transcript: string
): boolean {
  const t = transcript.toLowerCase();
  const hasFollowUp =
    /\b(return|come back|next (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|tomorrow|in \w+ weeks?)\b/i.test(
      transcript
    );
  const hasScripture = extractScriptures(transcript).length > 0;
  const hasQuestion =
    /\b(asked|question|who is|why (?:does|is|will)|whether)\b/i.test(t);
  const hasTopic =
    /\b(discussed|talked about|studying|suffering|kingdom)\b/i.test(t);

  if (hasFollowUp && !extraction.proposed_return_visit_date) return true;
  if (hasScripture && extraction.scriptures_discussed.length === 0) return true;
  if (hasQuestion && extraction.questions_raised.length === 0) return true;
  if (hasTopic && !extraction.main_discussion_topic) return true;
  if (/\bmet\s+[A-Z][a-z]+/i.test(transcript) && !extraction.person_name) {
    return true;
  }
  return false;
}

export function extractionContextFromParts(parts: {
  localDate?: string | null;
  timezone?: string | null;
  now?: Date;
}): ExtractionContext {
  const now = parts.now ?? new Date();
  const timezone =
    parts.timezone?.trim() ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC";

  let localDate = parts.localDate?.trim() || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    try {
      localDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
    } catch {
      localDate = format(now, "yyyy-MM-dd");
    }
  }

  let localDay = "";
  try {
    localDay = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
    }).format(parseISO(`${localDate}T12:00:00`));
  } catch {
    localDay = format(parseISO(`${localDate}T12:00:00`), "EEEE");
  }

  return { localDate, localDay, timezone };
}

const BIBLE_BOOKS =
  "Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song(?:\\s+of\\s+Solomon)?|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation";

export function extractScriptures(transcript: string): string[] {
  const re = new RegExp(
    `\\b((?:(?:1|2|3|I|II|III)\\s+)?(?:${BIBLE_BOOKS}))\\s+(\\d{1,3})(?::(\\d{1,3}(?:[–-]\\d{1,3})?(?:,\\s*\\d{1,3})*))?`,
    "gi"
  );
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(transcript)) != null) {
    const book = m[1].replace(/\s+/g, " ").trim();
    const chapter = m[2];
    const verse = m[3] ? `:${m[3]}` : "";
    const ref = `${book} ${chapter}${verse}`;
    if (!found.some((f) => f.toLowerCase() === ref.toLowerCase())) {
      found.push(ref);
    }
  }
  return found;
}

export function extractQuestions(transcript: string): string[] {
  const questions: string[] = [];

  const embedded = transcript.match(
    /\basked\s+((?:who|what|why|when|where|how|whether)\s+[^.?!]+)/i
  );
  if (embedded?.[1]) {
    const cleaned = ensureQuestion(embedded[1]);
    if (cleaned) questions.push(cleaned);
  }

  const asked = transcript.match(
    /\b(?:she|he|they)\s+asked\s+([^.?!]+[.?!]?)/gi
  );
  if (asked) {
    for (const a of asked) {
      const q = a.replace(/^(?:she|he|they)\s+asked\s+/i, "").trim();
      const cleaned = ensureQuestion(q);
      if (
        cleaned &&
        !questions.some((x) => x.toLowerCase() === cleaned.toLowerCase())
      ) {
        questions.push(cleaned);
      }
    }
  }

  return questions;
}

function ensureQuestion(text: string): string {
  let q = text.trim().replace(/^["']|["']$/g, "");
  if (!q) return "";
  q = q.charAt(0).toUpperCase() + q.slice(1);
  if (!/[?]$/.test(q)) q += "?";
  return q;
}

function extractPersonName(transcript: string): string {
  const m = transcript.match(
    /\b(?:met|spoke with|visited|talked with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/
  );
  return m?.[1] || "";
}

function extractLocation(transcript: string): string {
  const skip = new Set([
    "Studying",
    "The",
    "A",
    "An",
    "Our",
    "Their",
    "His",
    "Her",
  ]);
  const re =
    /\b(?:in|at|near)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(transcript)) != null) {
    const loc = m[1];
    if (!skip.has(loc.split(" ")[0])) return loc;
  }
  return "";
}

function extractMainTopic(transcript: string): string {
  const whether = transcript.match(/\bdiscussed\s+(whether\s+[^.?!]+)/i);
  if (whether?.[1]) {
    let topic = whether[1].trim().replace(/\s+/g, " ");
    topic = topic.replace(/\s+and\s+read\b.*/i, "").trim();
    return topic.charAt(0).toUpperCase() + topic.slice(1);
  }

  const discussed = transcript.match(
    /\bdiscussed\s+([^.?!]+?)(?:\s+and\s+read|\s+and\s+we|\.|$)/i
  );
  if (discussed?.[1]) {
    let topic = discussed[1].trim().replace(/\s+/g, " ");
    topic = topic.replace(/\s+and\s+read\b.*/i, "").trim();
    if (topic.length > 3) {
      return topic.charAt(0).toUpperCase() + topic.slice(1);
    }
  }
  return "";
}

function extractNextTopic(transcript: string): string {
  const m = transcript.match(
    /\b(?:return|come back)[^.]*?\bto discuss\s+([^.?!]+)/i
  );
  if (m?.[1]) {
    const t = m[1].trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  return "";
}

function extractMaterials(transcript: string): string[] {
  const materials: string[] = [];
  if (/\bbrochure\b/i.test(transcript)) materials.push("Brochure");
  if (/\btract\b/i.test(transcript)) materials.push("Tract");
  if (/\bmagazine\b/i.test(transcript)) materials.push("Magazine");
  if (/\bbook\b/i.test(transcript) && !/\bfacebook\b/i.test(transcript)) {
    materials.push("Book");
  }
  if (/\bvideo\b/i.test(transcript)) materials.push("Video");
  return materials;
}
