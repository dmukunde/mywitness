import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const subscribeBody = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(2048),
    keys: z.object({
      p256dh: z.string().min(1).max(256),
      auth: z.string().min(1).max(256),
    }),
  }),
  privateMode: z.boolean().optional(),
});

const unsubscribeBody = z.object({ endpoint: z.string().url().max(2048) });

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Registers (or refreshes) this device for the signed-in person. Safe to repeat. */
export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = subscribeBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }
  const { subscription, privateMode } = parsed.data;

  // The same device can be signed in as someone else later; a device's
  // address is unique, so it moves to whoever registers it now. That write is
  // why this uses the service client (RLS would hide the other row).
  const service = createServiceClient();
  const { error } = await service.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      ...(privateMode === undefined ? {} : { private_mode: privateMode }),
    },
    { onConflict: "endpoint" }
  );
  if (error) {
    console.error("[push subscribe]", error);
    return NextResponse.json({ error: "Could not save this device." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Stops notifications to this device. */
export async function DELETE(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = unsubscribeBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { error } = await (await createClient())
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", parsed.data.endpoint)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Could not remove this device." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
