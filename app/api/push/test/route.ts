import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { pushIsConfigured, sendPush } from "@/lib/push/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Sends a test notification to ONE of the caller's own devices, so
// turning notifications on gives instant proof that it works.
export async function POST(req: NextRequest) {
  if (!pushIsConfigured()) {
    return NextResponse.json(
      { error: "Push is not configured on the server yet." },
      { status: 503 },
    );
  }

  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let endpoint: string | undefined;
  try {
    endpoint = (await req.json()).endpoint;
  } catch {
    // fall through
  }
  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  // Runs as the signed-in user: returns keys only if this endpoint
  // belongs to them.
  const { data: sub } = await supabase.rpc("push_my_subscription", {
    p_endpoint: endpoint,
  });
  if (!sub) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  const result = await sendPush(
    sub as { endpoint: string; p256dh: string; auth_secret: string },
    {
      title: "Notifications are on",
      body: "You'll get QureoCity alerts on this device.",
      url: "/employee",
      tag: "test",
      test: true,
    },
    300,
  );

  if (result !== "sent") {
    return NextResponse.json(
      { error: "The push service rejected the test message." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
