import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is required to delete accounts." },
      { status: 500 }
    );
  }

  const service = createServiceClient();

  // Delete storage objects first
  const { data: files } = await service.storage
    .from("conversation-audio")
    .list(user.id, { limit: 1000 });

  if (files?.length) {
    await service.storage
      .from("conversation-audio")
      .remove(files.map((f) => `${user.id}/${f.name}`));
  }

  // Cascading FK deletes will remove owned rows when auth user is deleted.
  // Also clean tables explicitly for clarity.
  await Promise.all([
    service.from("reminders").delete().eq("user_id", user.id),
    service.from("conversation_scriptures").delete().eq("user_id", user.id),
    service.from("return_visits").delete().eq("user_id", user.id),
    service.from("conversations").delete().eq("user_id", user.id),
    service.from("ministry_sessions").delete().eq("user_id", user.id),
    service.from("people").delete().eq("user_id", user.id),
    service.from("user_settings").delete().eq("user_id", user.id),
    service.from("profiles").delete().eq("id", user.id),
  ]);

  const { error } = await service.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
