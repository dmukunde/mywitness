/**
 * What this phone remembers about handovers. Kept only in this browser (never
 * sent anywhere), and only ever a convenience: everything still works from the
 * link itself if it is cleared.
 */

const COVERING_KEY = "mw-covering";
const AWAY_KEY = "mw-handed-over";
const PENDING_KEY = "mw-pending-link";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Remembering is a convenience; never block on it.
  }
}

/** A study this person is covering for someone else, kept against their own copy of it. */
export interface Covering {
  /** The other person's id for the study: needed to send an update back. */
  ownerStudyId: string;
  from: string;
  person: string;
  end: string;
}

export function saveCovering(myStudyId: string, info: Covering) {
  write(COVERING_KEY, { ...read<Record<string, Covering>>(COVERING_KEY, {}), [myStudyId]: info });
}

export function getCovering(myStudyId: string): Covering | null {
  return read<Record<string, Covering>>(COVERING_KEY, {})[myStudyId] ?? null;
}

/** The study already added from this handover, if this person has added it before. */
export function findCoveringByOwnerStudy(ownerStudyId: string): string | null {
  const all = read<Record<string, Covering>>(COVERING_KEY, {});
  return Object.keys(all).find((id) => all[id].ownerStudyId === ownerStudyId) ?? null;
}

/** A study of this person's own that is being covered by someone else. */
export interface HandedOver {
  to: string | null;
  start: string;
  end: string;
}

export function saveHandedOver(studyId: string, info: HandedOver) {
  write(AWAY_KEY, { ...read<Record<string, HandedOver>>(AWAY_KEY, {}), [studyId]: info });
}

export function getHandedOver(studyId: string): HandedOver | null {
  return read<Record<string, HandedOver>>(AWAY_KEY, {})[studyId] ?? null;
}

export function clearHandedOver(studyId: string) {
  const all = read<Record<string, HandedOver>>(AWAY_KEY, {});
  delete all[studyId];
  write(AWAY_KEY, all);
}

/**
 * The part of a link after "#" does not survive signing in, so a link that
 * needs a signed-in person is put aside and opened again once they are in.
 * Only an address inside this app is ever kept.
 */
export function stashPendingLink(path: string) {
  if (path.startsWith("/") && !path.startsWith("//")) write(PENDING_KEY, path);
}

export function takePendingLink(): string | null {
  const path = read<string | null>(PENDING_KEY, null);
  if (path === null) return null;
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing to do.
  }
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") ? path : null;
}
