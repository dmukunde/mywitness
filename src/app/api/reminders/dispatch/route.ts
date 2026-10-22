import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { dispatchDueReminders, supabaseReminderDb } from "@/lib/reminder-dispatch";
import { isAuthorizedCron, makeSender, pushConfig } from "@/lib/push-server";

export const dynamic = "force-dynamic";

/**
 * Sends reminders that have come due. Called once a minute by a scheduler
 * (see DEPLOY.md), never by a person: it is protected by CRON_SECRET, and the
 * auth middleware lets exactly this path through so the scheduler needn't log in.
 */
async function run(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const config = pushConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Push notifications are not set up (VAPID keys missing)." },
      { status: 503 }
    );
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is required." },
      { status: 500 }
    );
  }

  // Optional: limit a run to one person (used when testing).
  const userId = request.nextUrl.searchParams.get("user") ?? undefined;

  try {
    const summary = await dispatchDueReminders({
      db: supabaseReminderDb(createServiceClient()),
      send: makeSender(config),
      userId,
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[reminders dispatch]", err);
    return NextResponse.json({ error: "Dispatch failed." }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
