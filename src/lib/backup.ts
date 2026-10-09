import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Area,
  BibleStudy,
  BibleStudySession,
  Conversation,
  ConversationScripture,
  MinistrySession,
  Person,
  PersonPhoto,
  Reminder,
  ReturnVisit,
  ScheduledMinistryEvent,
  StudyNote,
  ToolkitEntry,
} from "@/lib/types";

export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_APP_ID = "mywitness";

export interface BackupData {
  areas: Area[];
  people: Person[];
  conversations: Conversation[];
  conversation_scriptures: ConversationScripture[];
  return_visits: ReturnVisit[];
  bible_studies: BibleStudy[];
  bible_study_sessions: BibleStudySession[];
  ministry_sessions: MinistrySession[];
  reminders: Reminder[];
  scheduled_ministry_events: ScheduledMinistryEvent[];
  person_photos: PersonPhoto[];
  study_notes: StudyNote[];
  toolkit_entries: ToolkitEntry[];
}

export interface BackupEnvelope {
  schema_version: number;
  app: string;
  exported_at: string;
  user?: { id: string; email: string | null };
  data: BackupData;
}

/** Tables in dependency order — parents before children — for both import and preview. */
const TABLE_ORDER: (keyof BackupData)[] = [
  "areas",
  "ministry_sessions",
  "people",
  "conversations",
  "conversation_scriptures",
  "return_visits",
  "reminders",
  "bible_studies",
  "bible_study_sessions",
  "scheduled_ministry_events",
  "person_photos",
  "study_notes",
  "toolkit_entries",
];

/**
 * Tables added after the original v1 backup shape. A backup file created
 * before one of these existed won't have the key at all — that must not
 * fail validation of an otherwise-valid older backup, so these default to
 * an empty array instead of being required.
 */
const OPTIONAL_TABLES = new Set<keyof BackupData>([
  "study_notes",
  "toolkit_entries",
]);

export type ValidationResult =
  | { ok: true; envelope: BackupEnvelope }
  | { ok: false; error: string };

const MAX_BACKUP_BYTES = 25 * 1024 * 1024; // JSON only, no photo binaries — 25MB is generous

export function validateBackupFile(
  file: File
): { ok: true } | { ok: false; error: string } {
  const looksLikeJson =
    file.type === "application/json" || file.name.toLowerCase().endsWith(".json");
  if (!looksLikeJson) {
    return { ok: false, error: "Please choose a .json backup file." };
  }
  if (file.size > MAX_BACKUP_BYTES) {
    return {
      ok: false,
      error: "This file is larger than a MyWitness backup should be — is it the right file?",
    };
  }
  if (file.size === 0) {
    return { ok: false, error: "This file is empty." };
  }
  return { ok: true };
}

export function validateBackupEnvelope(json: unknown): ValidationResult {
  if (typeof json !== "object" || json === null) {
    return { ok: false, error: "This doesn't look like a MyWitness backup file." };
  }
  const obj = json as Record<string, unknown>;
  if (obj.app !== BACKUP_APP_ID) {
    return { ok: false, error: "This file wasn't created by MyWitness." };
  }
  if (obj.schema_version !== BACKUP_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Unsupported backup version (${String(
        obj.schema_version ?? "unknown"
      )}). This app supports version ${BACKUP_SCHEMA_VERSION}.`,
    };
  }
  if (typeof obj.data !== "object" || obj.data === null) {
    return { ok: false, error: "Backup file is missing its data section." };
  }
  const data = obj.data as Record<string, unknown>;
  for (const key of TABLE_ORDER) {
    if (Array.isArray(data[key])) continue;
    if (OPTIONAL_TABLES.has(key) && data[key] === undefined) {
      // Older backup, predates this table — default it rather than reject.
      data[key] = [];
      continue;
    }
    return {
      ok: false,
      error: `Backup file is missing or has a malformed "${key}" section.`,
    };
  }
  return { ok: true, envelope: obj as unknown as BackupEnvelope };
}

export interface BackupSummary {
  exportedAt: string;
  counts: Record<keyof BackupData, number>;
  sampleNames: string[];
  dateRange: { earliest: string | null; latest: string | null };
}

export function summarizeBackup(envelope: BackupEnvelope): BackupSummary {
  const { data } = envelope;
  const counts = Object.fromEntries(
    TABLE_ORDER.map((k) => [k, (data[k] || []).length])
  ) as Record<keyof BackupData, number>;
  const sampleNames = data.people
    .slice(0, 5)
    .map((p) => p.name)
    .filter(Boolean);
  const dates = [
    ...data.conversations.map((c) => c.conversation_date),
    ...data.return_visits.map((rv) => rv.scheduled_date),
    ...data.ministry_sessions.map((s) => s.session_date),
  ]
    .filter(Boolean)
    .sort();
  return {
    exportedAt: envelope.exported_at,
    counts,
    sampleNames,
    dateRange: {
      earliest: dates[0] || null,
      latest: dates[dates.length - 1] || null,
    },
  };
}

export interface TableReport {
  inserted: number;
  skipped: number;
  rejected: number;
}

export interface ImportReport {
  mode: "merge" | "replace";
  perTable: Record<keyof BackupData, TableReport>;
  errors: string[];
}

function emptyReport(): Record<keyof BackupData, TableReport> {
  return Object.fromEntries(
    TABLE_ORDER.map((k) => [k, { inserted: 0, skipped: 0, rejected: 0 }])
  ) as Record<keyof BackupData, TableReport>;
}

/** Postgres unique-violation code — the row already exists, so skip it (merge mode). */
const UNIQUE_VIOLATION = "23505";

async function insertRows(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  userId: string,
  report: TableReport,
  errors: string[],
  { skipOnConflict }: { skipOnConflict: boolean }
) {
  for (const row of rows) {
    const payload = { ...row, user_id: userId };
    const { error } = await supabase.from(table).insert(payload);
    if (!error) {
      report.inserted++;
      continue;
    }
    if (skipOnConflict && error.code === UNIQUE_VIOLATION) {
      report.skipped++;
      continue;
    }
    report.rejected++;
    errors.push(`${table} ${String(row.id || "")}: ${error.message}`);
  }
}

/** Deletes a user's ministry data — used only for Replace mode, after a safety backup. */
async function deleteAllMinistryData(supabase: SupabaseClient, userId: string) {
  // Children before parents.
  const tables = [
    "person_photos",
    "toolkit_entries",
    "study_notes",
    "scheduled_ministry_events",
    "bible_study_sessions",
    "bible_studies",
    "reminders",
    "return_visits",
    "conversation_scriptures",
    "conversations",
    "ministry_sessions",
    "people",
    "areas",
  ];
  for (const table of tables) {
    await supabase.from(table).delete().eq("user_id", userId);
  }
}

export async function importBackup(
  supabase: SupabaseClient,
  userId: string,
  envelope: BackupEnvelope,
  mode: "merge" | "replace"
): Promise<ImportReport> {
  if (mode === "replace") {
    await deleteAllMinistryData(supabase, userId);
  }

  const perTable = emptyReport();
  const errors: string[] = [];
  const skipOnConflict = mode === "merge";

  for (const table of TABLE_ORDER) {
    const rows = (envelope.data[table] || []) as unknown as Record<
      string,
      unknown
    >[];
    if (rows.length === 0) continue;
    await insertRows(
      supabase,
      table,
      rows,
      userId,
      perTable[table],
      errors,
      { skipOnConflict }
    );
  }

  return { mode, perTable, errors };
}
