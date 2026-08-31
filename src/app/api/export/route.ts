import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BACKUP_APP_ID, BACKUP_SCHEMA_VERSION } from "@/lib/backup";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    profile,
    settings,
    people,
    conversations,
    scriptures,
    returnVisits,
    sessions,
    reminders,
    bibleStudies,
    bibleStudySessions,
    scheduledMinistryEvents,
    areas,
    personPhotos,
    studyNotes,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("people").select("*").eq("user_id", user.id),
    supabase.from("conversations").select("*").eq("user_id", user.id),
    supabase.from("conversation_scriptures").select("*").eq("user_id", user.id),
    supabase.from("return_visits").select("*").eq("user_id", user.id),
    supabase.from("ministry_sessions").select("*").eq("user_id", user.id),
    supabase.from("reminders").select("*").eq("user_id", user.id),
    supabase.from("bible_studies").select("*").eq("user_id", user.id),
    supabase.from("bible_study_sessions").select("*").eq("user_id", user.id),
    supabase.from("scheduled_ministry_events").select("*").eq("user_id", user.id),
    supabase.from("areas").select("*").eq("user_id", user.id),
    supabase.from("person_photos").select("*").eq("user_id", user.id),
    supabase.from("study_notes").select("*").eq("user_id", user.id),
  ]);

  // Tables that may not exist yet if a migration hasn't been run — degrade to
  // an empty list rather than failing the whole export.
  const orEmpty = <T,>(res: { data: T[] | null; error: unknown }) => res.data || [];

  return NextResponse.json({
    schema_version: BACKUP_SCHEMA_VERSION,
    app: BACKUP_APP_ID,
    exported_at: new Date().toISOString(),
    user: { id: user.id, email: user.email },
    profile: profile.data,
    settings: settings.data,
    data: {
      people: orEmpty(people),
      conversations: orEmpty(conversations),
      conversation_scriptures: orEmpty(scriptures),
      return_visits: orEmpty(returnVisits),
      bible_studies: orEmpty(bibleStudies),
      bible_study_sessions: orEmpty(bibleStudySessions),
      ministry_sessions: orEmpty(sessions),
      reminders: orEmpty(reminders),
      scheduled_ministry_events: orEmpty(scheduledMinistryEvents),
      areas: orEmpty(areas),
      // Metadata only (path + caption) — the actual image files are not
      // included here. See the in-app note on the Backup & Restore screen
      // for how photo media is handled separately.
      person_photos: orEmpty(personPhotos),
      study_notes: orEmpty(studyNotes),
    },
    disclaimer:
      "MyWitness is an independent personal organization tool designed to help individuals organize ministry notes, conversations, and return visits. It is not affiliated with, endorsed by, or produced by Jehovah’s Witnesses or any of their legal entities. This file contains only your ministry data — no passwords, authentication tokens, or API keys.",
  });
}
