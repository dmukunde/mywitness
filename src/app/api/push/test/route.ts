import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { makeSender, pushConfig } from "@/lib/push-server";

export const dynamic = "force-dynamic";

/**
 * Sends a test notification to the signed-in person's own devices, so they can
 * see for themselves that notifications work before relying on them.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = pushConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Notifications aren't set up on the server yet." },
      { status: 503 }
    );
  }

  // RLS: only this person's own devices.
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, private_mode");
  if (error) return NextResponse.json({ error: "Could not read your devices." }, { status: 500 });
  if (!subs?.length) {
    return NextResponse.json(
      { error: "This device isn't registered yet. Turn notifications on first." },
      { status: 409 }
    );
  }

  const send = makeSender(config);
  const results = await Promise.all(
    subs.map((sub) =>
      send(sub, {
        title: "MyWitness reminder",
        body: sub.private_mode ? "You have a reminder." : "Notifications are working.",
        tag: "mywitness-test",
        url: "/reminders",
      })
    )
  );
  const delivered = results.filter((r) => r.ok).length;
  // Clean up devices that no longer exist.
  const gone = subs.filter((_, i) => !results[i].ok && (results[i] as { gone?: boolean }).gone);
  if (gone.length) {
    await supabase.from("push_subscriptions").delete().in("id", gone.map((g) => g.id));
  }
  if (!delivered) {
    return NextResponse.json(
      { error: "The notification could not be delivered. Try turning notifications off and on again." },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, delivered });
}
