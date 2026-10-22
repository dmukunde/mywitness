import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushConfig } from "@/lib/push-server";

export const dynamic = "force-dynamic";

/** Whether the server can send push notifications, and the public key a device needs to sign up. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = pushConfig();
  return NextResponse.json({
    configured: Boolean(config && process.env.CRON_SECRET?.trim()),
    publicKey: config?.publicKey ?? null,
  });
}
