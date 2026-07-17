import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("people").select("*").eq("user_id", user.id),
    supabase.from("conversations").select("*").eq("user_id", user.id),
    supabase.from("conversation_scriptures").select("*").eq("user_id", user.id),
    supabase.from("return_visits").select("*").eq("user_id", user.id),
    supabase.from("ministry_sessions").select("*").eq("user_id", user.id),
    supabase.from("reminders").select("*").eq("user_id", user.id),
  ]);

  return NextResponse.json({
    exported_at: new Date().toISOString(),
    user: { id: user.id, email: user.email },
    profile: profile.data,
    settings: settings.data,
    people: people.data,
    conversations: conversations.data,
    conversation_scriptures: scriptures.data,
    return_visits: returnVisits.data,
    ministry_sessions: sessions.data,
    reminders: reminders.data,
    disclaimer:
      "This is an independent personal organization tool. It is not affiliated with or endorsed by Jehovah’s Witnesses or any of their legal entities.",
  });
}
