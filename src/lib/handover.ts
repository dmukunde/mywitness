/**
 * Handing a Bible study over to someone else for a while, and getting a quick
 * update back, without either side needing an account.
 *
 * The details travel inside the link itself, after the "#". The part of a web
 * address after "#" is never sent to a server, so nothing about the student is
 * stored anywhere: it lives only in the message that is shared (like forwarding
 * a WhatsApp message). Everything read back from a link is treated as
 * untrusted: it is checked field by field, trimmed and limited in length, and
 * anything unexpected is dropped or rejects the whole link.
 */

import { format, parseISO } from "date-fns";
import { parseLessonNumber } from "@/lib/bible-study";
import type {
  BibleStudy,
  BibleStudyFormData,
  BibleStudySessionFormData,
  Person,
} from "@/lib/types";

export type HandoverStatus = "active" | "paused" | "completed";
export type StudyFrequency = "weekly" | "biweekly" | "monthly" | "custom";

export const HANDOVER_VERSION = 1;

/** What the person covering the study is given. */
export interface Handover {
  v: typeof HANDOVER_VERSION;
  kind: "handover";
  /** The owner's own id for the study, handed back in the reply so it can be matched. */
  studyId: string;
  /** Who is handing over (their display name). */
  from: string;
  /** Who it is for, if the owner named them. */
  to: string | null;
  /** The first and last day the study is being covered. */
  start: string;
  end: string;
  person: {
    name: string;
    phone: string | null;
    place: string | null;
  };
  study: {
    publication: string;
    lessonNumber: number;
    lesson: string | null;
    totalLessons: number;
    frequency: StudyFrequency;
    preferredDay: string | null;
    preferredTime: string | null;
    nextDate: string | null;
    nextTime: string | null;
    lastDate: string | null;
    status: HandoverStatus;
    /** Preparation notes. Private notes are never part of a handover. */
    prep: string | null;
  };
}

/** The quick update sent back when the study returns to its owner. */
export interface Reply {
  v: typeof HANDOVER_VERSION;
  kind: "reply";
  studyId: string;
  /** The student's name, so the update can say who it is about. */
  person: string | null;
  /** Who covered the study. */
  by: string;
  lessonNumber: number;
  lesson: string | null;
  status: HandoverStatus;
  nextDate: string | null;
  nextTime: string | null;
  note: string | null;
  /** The day the update was made. */
  at: string;
}

export type Decoded<T> = { ok: true; value: T } | { ok: false; reason: string };

const MAX_LINK_TOKEN = 6000;
const STATUSES: HandoverStatus[] = ["active", "paused", "completed"];
const FREQUENCIES: StudyFrequency[] = ["weekly", "biweekly", "monthly", "custom"];

// ---------------------------------------------------------------- encoding

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(token: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    const padded = token.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function encodeHandover(payload: Handover | Reply): string {
  return toBase64Url(JSON.stringify(payload));
}

// ------------------------------------------------------------- validation

/** Plain text only: no control characters, trimmed, and never longer than `max`. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

function requiredText(value: unknown, max: number): string | null {
  return text(value, max);
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value;
}

function lessonNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 999
    ? value
    : null;
}

function oneOf<T extends string>(value: unknown, allowed: T[]): T | null {
  return typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseToken(token: string): Record<string, unknown> | null {
  if (!token || token.length > MAX_LINK_TOKEN) return null;
  const json = fromBase64Url(token);
  if (json === null) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const BAD_LINK = "This link doesn't look right. Ask for it to be sent again.";

export function decodeHandover(token: string): Decoded<Handover> {
  const raw = parseToken(token);
  if (!raw || raw.kind !== "handover" || raw.v !== HANDOVER_VERSION) {
    return { ok: false, reason: BAD_LINK };
  }
  const person = (raw.person ?? {}) as Record<string, unknown>;
  const study = (raw.study ?? {}) as Record<string, unknown>;

  const studyId = typeof raw.studyId === "string" && UUID.test(raw.studyId) ? raw.studyId : null;
  const from = requiredText(raw.from, 80);
  const start = isoDate(raw.start);
  const end = isoDate(raw.end);
  const name = requiredText(person.name, 80);
  const publication = requiredText(study.publication, 120);
  const number = lessonNumber(study.lessonNumber);
  const total = lessonNumber(study.totalLessons);
  const frequency = oneOf(study.frequency, FREQUENCIES);
  const status = oneOf(study.status, STATUSES);

  if (!studyId || !from || !start || !end || end < start || !name || !publication ||
      !number || !total || !frequency || !status) {
    return { ok: false, reason: BAD_LINK };
  }

  return {
    ok: true,
    value: {
      v: HANDOVER_VERSION,
      kind: "handover",
      studyId,
      from,
      to: text(raw.to, 80),
      start,
      end,
      person: {
        name,
        phone: text(person.phone, 30),
        place: text(person.place, 200),
      },
      study: {
        publication,
        lessonNumber: number,
        lesson: text(study.lesson, 120),
        totalLessons: total,
        frequency,
        preferredDay: text(study.preferredDay, 20),
        preferredTime: text(study.preferredTime, 20),
        nextDate: isoDate(study.nextDate),
        nextTime: text(study.nextTime, 20),
        lastDate: isoDate(study.lastDate),
        status,
        prep: text(study.prep, 1000),
      },
    },
  };
}

export function decodeReply(token: string): Decoded<Reply> {
  const raw = parseToken(token);
  if (!raw || raw.kind !== "reply" || raw.v !== HANDOVER_VERSION) {
    return { ok: false, reason: BAD_LINK };
  }
  const studyId = typeof raw.studyId === "string" && UUID.test(raw.studyId) ? raw.studyId : null;
  const by = requiredText(raw.by, 80);
  const number = lessonNumber(raw.lessonNumber);
  const status = oneOf(raw.status, STATUSES);
  const at = isoDate(raw.at);
  if (!studyId || !by || !number || !status || !at) {
    return { ok: false, reason: BAD_LINK };
  }
  return {
    ok: true,
    value: {
      v: HANDOVER_VERSION,
      kind: "reply",
      studyId,
      person: text(raw.person, 80),
      by,
      lessonNumber: number,
      lesson: text(raw.lesson, 120),
      status,
      nextDate: isoDate(raw.nextDate),
      nextTime: text(raw.nextTime, 20),
      note: text(raw.note, 600),
      at,
    },
  };
}

// ---------------------------------------------------------------- links

export const HANDOVER_PATH = "/handover";
export const REPLY_PATH = "/handover/reply";

export function handoverLink(origin: string, payload: Handover): string {
  return `${origin}${HANDOVER_PATH}#${encodeHandover(payload)}`;
}

export function replyLink(origin: string, payload: Reply): string {
  return `${origin}${REPLY_PATH}#${encodeHandover(payload)}`;
}

/** The token after "#" in a link's hash (with or without the "#"). */
export function tokenFromHash(hash: string): string {
  return hash.replace(/^#/, "").trim();
}

// ------------------------------------------------------------- the end date

/** True once the handover's last day has passed. A soft notice only: a link cannot be switched off. */
export function handoverHasEnded(h: Pick<Handover, "end">, today: string): boolean {
  return today > h.end;
}

// ------------------------------------------------- building a handover

export interface HandoverChoices {
  to: string | null;
  start: string;
  end: string;
  /** What the person covering is given, besides the name. */
  include: { phone: boolean; place: boolean; prep: boolean };
}

/** The handover for a study. Private notes are never included, whatever is chosen. */
export function buildHandover(
  study: BibleStudy,
  person: Person,
  from: string,
  choices: HandoverChoices
): Handover {
  const place = [study.general_location || person.general_location, person.area?.name]
    .filter((p, i, all): p is string => Boolean(p) && all.indexOf(p) === i)
    .join(", ");
  return {
    v: HANDOVER_VERSION,
    kind: "handover",
    studyId: study.id,
    from: from.trim() || "A friend",
    to: choices.to?.trim() || null,
    start: choices.start,
    end: choices.end,
    person: {
      name: person.name,
      phone: choices.include.phone ? person.phone_number || null : null,
      place: choices.include.place ? place || null : null,
    },
    study: {
      publication: study.publication,
      lessonNumber: study.current_lesson_number,
      lesson: study.current_lesson,
      totalLessons: study.total_lessons,
      frequency: study.study_frequency,
      preferredDay: study.preferred_day,
      preferredTime: study.preferred_time,
      nextDate: study.next_study_date,
      nextTime: study.next_study_time,
      lastDate: study.last_study_date,
      status: study.status,
      prep: choices.include.prep ? study.preparation_notes : null,
    },
  };
}

const shortDate = (iso: string) => format(parseISO(iso), "MMM d");

/** The study as the person covering will have it in their own app. */
export function handoverToStudyForm(h: Handover, personId: string): BibleStudyFormData {
  const covering = `Covering for ${h.from} until ${shortDate(h.end)}.`;
  return {
    person_id: personId,
    publication: h.study.publication,
    starting_lesson: "",
    current_lesson: h.study.lesson || `Lesson ${h.study.lessonNumber}`,
    current_lesson_number: h.study.lessonNumber,
    total_lessons: h.study.totalLessons,
    study_frequency: h.study.frequency,
    preferred_day: h.study.preferredDay || "",
    preferred_time: h.study.preferredTime || "",
    first_study_date: "",
    next_study_date: h.study.nextDate || "",
    next_study_time: h.study.nextTime || "",
    general_location: h.person.place || "",
    location_lat: null,
    location_lng: null,
    status: h.study.status,
    preparation_notes: h.study.prep ? `${covering} ${h.study.prep}` : covering,
    private_notes: "",
    source_return_visit_id: "",
  };
}

/**
 * The record of the covered study, built from the update that came back: the
 * lesson they are on, the next study, and who covered it. Saving it moves the
 * study to where they left off.
 */
export function replyToSessionForm(reply: Reply, study: BibleStudy): BibleStudySessionFormData {
  const lesson =
    reply.lesson && parseLessonNumber(reply.lesson) === reply.lessonNumber
      ? reply.lesson
      : `Lesson ${reply.lessonNumber}`;
  const update = `Update from ${reply.by}: now on ${lesson.toLowerCase().startsWith("lesson") ? lesson.charAt(0).toLowerCase() + lesson.slice(1) : lesson}.`;
  return {
    bible_study_id: study.id,
    session_date: reply.at,
    start_lesson: study.current_lesson || "",
    end_lesson: lesson,
    topics_discussed: "",
    scriptures_discussed: "",
    questions_raised: "",
    material_completed: "",
    homework: "",
    next_lesson: lesson,
    next_scheduled_date: reply.nextDate || "",
    next_scheduled_time: reply.nextTime || "",
    preparation_notes: "",
    summary: reply.note ? `${update} ${reply.note}` : update,
    source: "manual",
    transcript: "",
    audio_path: "",
  };
}

// ------------------------------------------------------- the messages

export const STATUS_WORDS: Record<HandoverStatus, string> = {
  active: "still studying",
  paused: "paused",
  completed: "finished",
};

export function handoverMessage(h: Handover, link: string): string {
  return (
    `Hi${h.to ? ` ${h.to}` : ""}, I'll be away from ${shortDate(h.start)} to ${shortDate(h.end)}. ` +
    `Could you please cover my Bible study with ${h.person.name}? Everything you need is here:

${link}

` +
    `When I'm back, please use the same link to tell me which lesson they're on.`
  );
}

export function replyMessage(reply: Reply, link: string): string {
  const next = reply.nextDate ? `, next study ${shortDate(reply.nextDate)}` : "";
  return (
    `Update on the Bible study${reply.person ? ` with ${reply.person}` : ""}: ` +
    `now on lesson ${reply.lessonNumber}, ${STATUS_WORDS[reply.status]}${next}.

` +
    `Open this link in MyWitness to add it to your study:

${link}`
  );
}
