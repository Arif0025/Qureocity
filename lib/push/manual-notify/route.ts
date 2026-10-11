import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabase,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { pushIsConfigured, sendPush } from "@/lib/push/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 20;

type Subscription = {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  device_label: string | null;
};

const MAX_TITLE = 100;
const MAX_BODY = 500;

// Admin-only direct nudge to one staff member — the Notify popup on
// Team Today. Deliberately NOT routed through notification_rules /
// notification_preferences: this is a direct admin action aimed at one
// named person, not an automated alert, so it always reaches every
// device that person has registered regardless of their own opt-in
// toggles (confirmed with Arif — this is intentional, not a bug).
export async function POST(req: NextRequest) {
  if (!pushIsConfigured()) {
    return NextResponse.json(
      { error: "Push is not configured on the server yet." },
      { status: 503 },
    );
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: role } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .single();
  if (role?.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  let body: { employeeId?: string; title?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const employeeId = body.employeeId;
  const title = (body.title ?? "").trim().slice(0, MAX_TITLE);
  const message = (body.message ?? "").trim().slice(0, MAX_BODY);
  if (!employeeId || !title || !message) {
    return NextResponse.json(
      { error: "Missing employee, title, or message." },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();
  const { data: subs, error: subsError } = await service
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth_secret, device_label")
    .eq("user_id", employeeId);
  if (subsError) {
    console.error("[push] manual-notify lookup failed", subsError.message);
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }
  const subscriptions = (subs ?? []) as Subscription[];
  if (subscriptions.length === 0) {
    return NextResponse.json(
      { error: "That person has no devices set up for notifications." },
      { status: 404 },
    );
  }

  const results = await Promise.all(
    subscriptions.map(async (s) => {
      const result = await sendPush(
        s,
        { title, body: message, url: "/employee?tab=activity", tag: "manual" },
        3600,
      );
      if (result === "gone") {
        await service.rpc("push_prune_subscription", {
          p_endpoint: s.endpoint,
        });
      }
      await service
        .rpc("push_log_send", {
          p_event_type: "manual_nudge",
          p_is_test: false,
          p_user_id: s.user_id,
          p_device_label: s.device_label,
          p_endpoint: s.endpoint,
          p_result: result,
        })
        .then(
          () => {},
          (err) => console.error("[push] log_send failed", err),
        );
      return { user_id: s.user_id, result };
    }),
  );

  const sent = results.filter((r) => r.result === "sent").length;
  if (sent === 0) {
    return NextResponse.json(
      { error: "That didn't go through to any of their devices." },
      { status: 502 },
    );
  }
  const notifiedUsers = [...new Set(results.filter((r) => r.result === "sent").map((r) => r.user_id))];
  const { error: inboxError } = await service.from("employee_notifications").insert(
    notifiedUsers.map((user_id) => ({
      user_id,
      category: "admin",
      title,
      body: message,
      target_url: "/employee?tab=home",
    })),
  );
  if (inboxError) console.error("[push] inbox insert failed", inboxError.message);
  return NextResponse.json({ sent, total: subscriptions.length });
}
