import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BibleStudy,
  Conversation,
  Person,
  ReturnVisit,
} from "@/lib/types";
import { buildCleanupPlan, type CleanupPlan } from "@/lib/duplicates";
import { upsertReturnVisitEventSupabase } from "@/lib/ministry-api";

/** Everything that points at a person. Moved to the kept person BEFORE the duplicate is archived. */
const PERSON_CHILD_TABLES = [
  "conversations",
  "return_visits",
  "bible_studies",
  "bible_study_sessions",
  "scheduled_ministry_events",
  "person_photos",
] as const;

/** Details copied onto the kept person only where it has none of its own. */
const FILLABLE_PERSON_FIELDS = [
  "phone_number",
  "general_location",
  "area_id",
  "location_lat",
  "location_lng",
  "preferred_contact_time",
  "current_discussion_theme",
  "key_questions",
  "private_notes",
] as const;

function check<T extends { error: unknown }>(res: T): T {
  if (res.error) throw res.error;
  return res;
}

/** Read-only: fetches this user's records (RLS-scoped) and works out what is duplicated. */
export async function scanForDuplicates(
  supabase: SupabaseClient,
  userId: string
): Promise<CleanupPlan> {
  const [people, conversations, returnVisits, bibleStudies, events] =
    await Promise.all([
      supabase.from("people").select("*").eq("user_id", userId).is("archived_at", null),
      supabase.from("conversations").select("*").eq("user_id", userId),
      supabase.from("return_visits").select("*").eq("user_id", userId),
      supabase
        .from("bible_studies")
        .select("*")
        .eq("user_id", userId)
        .is("archived_at", null),
      supabase
        .from("scheduled_ministry_events")
        .select("id, return_visit_id")
        .eq("user_id", userId),
    ]);
  for (const r of [people, conversations, returnVisits, bibleStudies, events]) {
    check(r);
  }
  return buildCleanupPlan({
    people: (people.data ?? []) as Person[],
    conversations: (conversations.data ?? []) as Conversation[],
    returnVisits: (returnVisits.data ?? []) as ReturnVisit[],
    bibleStudies: (bibleStudies.data ?? []) as BibleStudy[],
    eventVisitIds: (events.data ?? []).map(
      (e: { return_visit_id: string | null }) => e.return_visit_id
    ),
  });
}

export interface CleanupResult {
  peopleMerged: number;
  visitsCancelled: number;
  conversationsRemoved: number;
  eventsRemoved: number;
}

/**
 * Applies a plan from scanForDuplicates. Every step is safe to repeat, so a
 * failure midway can simply be re-run.
 *
 * What is NEVER done: deleting a person (that would cascade to their visits,
 * studies and photos), or touching completed visits and their history.
 */
export async function applyCleanupPlan(
  supabase: SupabaseClient,
  userId: string,
  plan: CleanupPlan
): Promise<CleanupResult> {
  const now = new Date().toISOString();
  const result: CleanupResult = {
    peopleMerged: 0,
    visitsCancelled: 0,
    conversationsRemoved: 0,
    eventsRemoved: 0,
  };

  // 1. Exact-copy conversations: repoint anything that referenced a copy at
  //    the original, then remove the copy (its scripture rows go with it).
  for (const g of plan.conversations) {
    const ids = g.duplicates.map((d) => d.id);
    check(
      await supabase
        .from("return_visits")
        .update({ conversation_id: g.canonical.id })
        .in("conversation_id", ids)
    );
    check(await supabase.from("conversations").delete().in("id", ids));
    result.conversationsRemoved += ids.length;
  }

  // 2. Repeated still-planned visits: cancelled, not deleted. Done before the
  //    people merge so identical visits never collide when they move.
  for (const g of plan.visits) {
    const ids = g.duplicates.map((d) => d.id);
    check(
      await supabase
        .from("return_visits")
        .update({ status: "cancelled" })
        .in("id", ids)
        .eq("status", "planned")
    );
    check(
      await supabase
        .from("scheduled_ministry_events")
        .update({ status: "cancelled" })
        .in("return_visit_id", ids)
    );
    result.visitsCancelled += ids.length;
  }

  // 3. Duplicate people: move everything to the kept person, fill any blanks
  //    on it, then archive (hide) the duplicate. Nothing is deleted.
  for (const g of plan.people) {
    for (const dup of g.duplicates) {
      for (const table of PERSON_CHILD_TABLES) {
        check(
          await supabase
            .from(table)
            .update({ person_id: g.canonical.id })
            .eq("person_id", dup.id)
        );
      }
      const fill: Record<string, unknown> = {};
      for (const field of FILLABLE_PERSON_FIELDS) {
        if (g.canonical[field] == null && dup[field] != null) {
          fill[field] = dup[field];
        }
      }
      if (Object.keys(fill).length) {
        check(await supabase.from("people").update(fill).eq("id", g.canonical.id));
      }
      check(
        await supabase.from("people").update({ archived_at: now }).eq("id", dup.id)
      );
      result.peopleMerged++;
    }
  }

  // 4. A visit has one calendar event. Drop extra copies (they only mirror
  //    the visit) and re-sync the survivor from the visit itself.
  const events = check(
    await supabase
      .from("scheduled_ministry_events")
      .select("id, return_visit_id, created_at")
      .eq("user_id", userId)
      .not("return_visit_id", "is", null)
      .order("created_at", { ascending: true })
  );
  const byVisit = new Map<string, string[]>();
  for (const e of (events.data ?? []) as Array<{
    id: string;
    return_visit_id: string;
  }>) {
    byVisit.set(e.return_visit_id, [...(byVisit.get(e.return_visit_id) ?? []), e.id]);
  }
  for (const [visitId, eventIds] of byVisit) {
    if (eventIds.length < 2) continue;
    check(
      await supabase.from("scheduled_ministry_events").delete().in("id", eventIds.slice(1))
    );
    result.eventsRemoved += eventIds.length - 1;
    const visit = check(
      await supabase.from("return_visits").select("*").eq("id", visitId).maybeSingle()
    );
    if (visit.data) {
      await upsertReturnVisitEventSupabase(userId, visit.data as ReturnVisit);
    }
  }

  return result;
}
