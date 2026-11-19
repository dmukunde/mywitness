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

export type Decoded<T> =
  | { ok: true; value: T }
  /** `detail` says what was wrong with the link, for support. It never contains anyone's details. */
  | { ok: false; reason: string; detail: string };

const MAX_LINK_TOKEN = 12000;
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

/**
 * The first form of a link: the whole payload as JSON with every field named.
 * Links already sent in this form keep opening; new links use the compact form
 * below, which is less than half the length.
 */
export function encodeHandoverV1(payload: Handover | Reply): string {
  return toBase64Url(JSON.stringify(payload));
}

// The compact form is a short list with no field names, a 22-character id
// instead of 36, and six-digit dates. Empty things at the end are left off.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID22_RE = /^[A-Za-z0-9_-]{22}$/;

function idToShort(id: string): string {
  if (!UUID_RE.test(id)) return id;
  const hex = id.replace(/-/g, "");
  let binary = "";
  for (let i = 0; i < 32; i += 2) binary += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function idFromShort(value: string | null): string | null {
  if (!value) return null;
  if (UUID_RE.test(value)) return value;
  if (!ID22_RE.test(value)) return value;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "==";
    const binary = atob(padded);
    if (binary.length !== 16) return value;
    const hex = Array.from(binary, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return value;
  }
}

/** "2026-11-19" as "261119". Anything else becomes empty. */
function shortDate(iso: string | null | undefined): string {
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10) : "";
}

function longDate(value: string | null): string | null {
  return value && /^\d{6}$/.test(value)
    ? `20${value.slice(0, 2)}-${value.slice(2, 4)}-${value.slice(4, 6)}`
    : value;
}

const orEmpty = (v: string | null | undefined) => v ?? "";

function dropTrailingEmpty(list: (string | number)[]): (string | number)[] {
  const out = [...list];
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

export function encodeHandover(payload: Handover | Reply): string {
  const list =
    payload.kind === "handover"
      ? [
          2, "h", idToShort(payload.studyId), payload.from, orEmpty(payload.to),
          shortDate(payload.start), shortDate(payload.end),
          payload.person.name, orEmpty(payload.person.phone), orEmpty(payload.person.place),
          payload.study.publication, payload.study.lessonNumber, payload.study.totalLessons,
          FREQUENCIES.indexOf(payload.study.frequency), STATUSES.indexOf(payload.study.status),
          orEmpty(payload.study.lesson), orEmpty(payload.study.preferredDay),
          orEmpty(payload.study.preferredTime), shortDate(payload.study.nextDate),
          orEmpty(payload.study.nextTime), shortDate(payload.study.lastDate),
          orEmpty(payload.study.prep),
        ]
      : [
          2, "r", idToShort(payload.studyId), orEmpty(payload.person), payload.by,
          payload.lessonNumber, STATUSES.indexOf(payload.status), shortDate(payload.at),
          orEmpty(payload.lesson), shortDate(payload.nextDate), orEmpty(payload.nextTime),
          orEmpty(payload.note),
        ];
  return toBase64Url(JSON.stringify(dropTrailingEmpty(list)));
}

/** Turns the compact list back into the full shape that is then checked like any other link. */
function expandCompact(a: unknown[]): Record<string, unknown> | null {
  if (a[0] !== 2) return null;
  const str = (i: number) => (typeof a[i] === "string" && a[i] !== "" ? (a[i] as string) : null);
  const num = (i: number) => (typeof a[i] === "number" ? (a[i] as number) : null);
  const pick = <T,>(list: T[], i: number): T | null => {
    const n = num(i);
    return n === null ? null : (list[n] ?? null);
  };
  if (a[1] === "h") {
    return {
      v: HANDOVER_VERSION,
      kind: "handover",
      studyId: idFromShort(str(2)),
      from: str(3),
      to: str(4),
      start: longDate(str(5)),
      end: longDate(str(6)),
      person: { name: str(7), phone: str(8), place: str(9) },
      study: {
        publication: str(10),
        lessonNumber: num(11),
        totalLessons: num(12),
        frequency: pick(FREQUENCIES, 13),
        status: pick(STATUSES, 14),
        lesson: str(15),
        preferredDay: str(16),
        preferredTime: str(17),
        nextDate: longDate(str(18)),
        nextTime: str(19),
        lastDate: longDate(str(20)),
        prep: str(21),
      },
    };
  }
  if (a[1] === "r") {
    return {
      v: HANDOVER_VERSION,
      kind: "reply",
      studyId: idFromShort(str(2)),
      person: str(3),
      by: str(4),
      lessonNumber: num(5),
      status: pick(STATUSES, 6),
      at: longDate(str(7)),
      lesson: str(8),
      nextDate: longDate(str(9)),
      nextTime: str(10),
      note: str(11),
    };
  }
  return null;
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
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 9999
    ? value
    : null;
}

function oneOf<T extends string>(value: unknown, allowed: T[]): T | null {
  return typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The link's token, tolerant of the small damage a message app can do: a
 * "%" code, or a full stop, comma or bracket stuck on the end.
 */
function cleanToken(token: string): string {
  let t = token.trim();
  try {
    t = decodeURIComponent(t);
  } catch {
    // Not percent-encoded; use it as it is.
  }
  return t.match(/^[A-Za-z0-9_-]+/)?.[0] ?? "";
}

type Parsed = { raw: Record<string, unknown> } | { problem: string };

function parseToken(input: string): Parsed {
  const token = cleanToken(input);
  if (!token) return { problem: "the link has no details after the # (it may have been cut off)" };
  if (token.length > MAX_LINK_TOKEN) {
    return { problem: `the link is too long (${token.length} characters)` };
  }
  const json = fromBase64Url(token);
  if (json === null) {
    return { problem: `the details could not be read (${token.length} characters; the link may have been cut off)` };
  }
  try {
    const parsed: unknown = JSON.parse(json);
    if (Array.isArray(parsed)) {
      const expanded = expandCompact(parsed);
      return expanded
        ? { raw: expanded }
        : { problem: "the details are in a form this version does not know" };
    }
    return parsed && typeof parsed === "object"
      ? { raw: parsed as Record<string, unknown> }
      : { problem: "the details are not in the expected form" };
  } catch {
    return { problem: `the details are incomplete (${token.length} characters; the link may have been cut off)` };
  }
}

const BAD_LINK = "This link doesn't look right. Ask for it to be sent again.";

const fail = (detail: string): { ok: false; reason: string; detail: string } => ({
  ok: false,
  reason: BAD_LINK,
  detail,
});

/** The names of the fields that are missing or wrong, never their contents. */
function missing(checks: Record<string, unknown>): string {
  return `missing or wrong: ${Object.keys(checks).filter((k) => !checks[k]).join(", ")}`;
}

export function decodeHandover(token: string): Decoded<Handover> {
  const parsed = parseToken(token);
  if ("problem" in parsed) return fail(parsed.problem);
  const raw = parsed.raw;
  if (raw.kind !== "handover" || raw.v !== HANDOVER_VERSION) {
    return fail(
      raw.kind === "reply"
        ? "this is an update link, not a handover link"
        : "this is not a handover link"
    );
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
    return fail(
      missing({
        studyId,
        from,
        start,
        "end (or it is before the start)": end && end >= (start ?? "") ? end : null,
        "person name": name,
        publication,
        "lesson number": number,
        "total lessons": total,
        frequency,
        status,
      })
    );
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
  const parsed = parseToken(token);
  if ("problem" in parsed) return fail(parsed.problem);
  const raw = parsed.raw;
  if (raw.kind !== "reply" || raw.v !== HANDOVER_VERSION) {
    return fail(
      raw.kind === "handover"
        ? "this is a handover link, not an update link"
        : "this is not an update link"
    );
  }
  const studyId = typeof raw.studyId === "string" && UUID.test(raw.studyId) ? raw.studyId : null;
  const by = requiredText(raw.by, 80);
  const number = lessonNumber(raw.lessonNumber);
  const status = oneOf(raw.status, STATUSES);
  const at = isoDate(raw.at);
  if (!studyId || !by || !number || !status || !at) {
    return fail(missing({ studyId, name: by, "lesson number": number, status, date: at }));
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
const clip = (value: string | null | undefined, max: number): string | null => {
  const v = (value ?? "").trim();
  return v ? v.slice(0, max) : null;
};

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
    from: clip(from, 80) ?? "A friend",
    to: clip(choices.to, 80),
    start: choices.start,
    end: choices.end,
    person: {
      name: clip(person.name, 80) ?? "Unnamed",
      phone: choices.include.phone ? clip(person.phone_number, 30) : null,
      place: choices.include.place ? clip(place, 200) : null,
    },
    study: {
      publication: clip(study.publication, 120) ?? "Bible study",
      lessonNumber: Math.min(9999, Math.max(1, study.current_lesson_number || 1)),
      lesson: clip(study.current_lesson, 120),
      totalLessons: Math.min(9999, Math.max(1, study.total_lessons || 60)),
      frequency: study.study_frequency,
      preferredDay: clip(study.preferred_day, 20),
      preferredTime: clip(study.preferred_time, 20),
      nextDate: study.next_study_date,
      nextTime: clip(study.next_study_time, 20),
      lastDate: study.last_study_date,
      status: study.status,
      prep: choices.include.prep ? clip(study.preparation_notes, 1000) : null,
    },
  };
}

const dayLabel = (iso: string) => format(parseISO(iso), "MMM d");

/** The study as the person covering will have it in their own app. */
export function handoverToStudyForm(h: Handover, personId: string): BibleStudyFormData {
  const covering = `Covering for ${h.from} until ${dayLabel(h.end)}.`;
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
    `Hi${h.to ? ` ${h.to}` : ""}, I'll be away from ${dayLabel(h.start)} to ${dayLabel(h.end)}. ` +
    `Could you please cover my Bible study with ${h.person.name}? Everything you need is here:

${link}

` +
    `When I'm back, please use the same link to tell me which lesson they're on.`
  );
}

export function replyMessage(reply: Reply, link: string): string {
  const next = reply.nextDate ? `, next study ${dayLabel(reply.nextDate)}` : "";
  return (
    `Update on the Bible study${reply.person ? ` with ${reply.person}` : ""}: ` +
    `now on lesson ${reply.lessonNumber}, ${STATUS_WORDS[reply.status]}${next}.

` +
    `Open this link in MyWitness to add it to your study:

${link}`
  );
}
