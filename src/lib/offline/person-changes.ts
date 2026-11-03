import type { Area, Person, PersonPhoto } from "@/lib/types";

/**
 * Building the records for a person added or edited with no signal. Kept here,
 * apart from the app's big data file, so the exact rules (what is sent to the
 * server, what is shown on screen meanwhile) can be tested.
 */

/** What the person typed or chose. Anything left out stays as it was (edit) or gets its usual default (add). */
export type PersonInput = Partial<Person> & { name: string };

export interface PersonInsert {
  /** Sent to the server. */
  payload: Record<string, unknown>;
  /** Shown on screen straight away. */
  row: Person;
}

/** A new person: the record to send, and the record to show meanwhile. Mirrors what the server fills in. */
export function buildPersonInsert(
  input: PersonInput,
  opts: { id: string; userId: string; now: string; today: string; confirmedDistinct?: boolean }
): PersonInsert {
  const { id, userId, now, today, confirmedDistinct } = opts;
  const payload: Record<string, unknown> = {
    id,
    user_id: userId,
    name: input.name,
    general_location: input.general_location ?? null,
    location_lat: input.location_lat ?? null,
    location_lng: input.location_lng ?? null,
    area_id: input.area_id ?? null,
    // Only sent when chosen, so adding someone still works on a database that
    // has not had migration 019 yet.
    ...(input.ministry_days?.length ? { ministry_days: input.ministry_days } : {}),
    phone_number: input.phone_number ?? null,
    preferred_contact_time: input.preferred_contact_time ?? null,
    first_met_date: input.first_met_date ?? today,
    interest_level: input.interest_level || "unknown",
    current_discussion_theme: input.current_discussion_theme ?? null,
    key_questions: input.key_questions ?? null,
    private_notes: input.private_notes ?? null,
    // The person said "this is a different person" for a name that exists.
    ...(confirmedDistinct ? { distinct_confirmed: true } : {}),
  };

  const row: Person = {
    id,
    user_id: userId,
    name: input.name,
    general_location: input.general_location ?? null,
    location_lat: input.location_lat ?? null,
    location_lng: input.location_lng ?? null,
    area_id: input.area_id ?? null,
    ministry_days: input.ministry_days ?? [],
    phone_number: input.phone_number ?? null,
    preferred_contact_time: input.preferred_contact_time ?? null,
    first_met_date: (payload.first_met_date as string) ?? today,
    interest_level: (payload.interest_level as Person["interest_level"]) ?? "unknown",
    current_discussion_theme: input.current_discussion_theme ?? null,
    key_questions: input.key_questions ?? null,
    private_notes: input.private_notes ?? null,
    is_demo: false,
    archived_at: null,
    distinct_confirmed: Boolean(confirmedDistinct),
    merged_into_id: null,
    created_at: now,
    updated_at: now,
  };
  return { payload, row };
}

/** The changes to send for an edit: only what was given, never the id. */
export function buildPersonUpdate(input: PersonInput, now: string): Record<string, unknown> {
  const { id: _id, area: _area, photos: _photos, ...changes } = input as PersonInput & {
    area?: unknown;
    photos?: unknown;
  };
  void _id;
  void _area;
  void _photos;
  return { ...changes, updated_at: now };
}

/** Adds the neighbourhood and photos to a person, the way every screen expects to find them. */
export function withDetails(person: Person, areas: Area[], photos: PersonPhoto[]): Person {
  return {
    ...person,
    area: person.area_id ? (areas.find((a) => a.id === person.area_id) ?? null) : null,
    photos: photos.filter((p) => p.person_id === person.id),
  };
}
