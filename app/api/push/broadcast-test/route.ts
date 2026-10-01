import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabase,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import {
  PUSH_EVENTS,
  PUSH_EVENT_META,
  type PushEventType,
} from "@/lib/push/events";
import { pushIsConfigured, sendPush } from "@/lib/push/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

type Recipient = {
  user_id: string;
  role: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  device_label: string | null;
};

// Admin action: send a labeled TEST message to every device currently
// eligible for a given event type, in one go — for verifying the whole
// team's delivery at once instead of testing one phone at a time.
// Distinct from /api/push/notify: this never runs push_event_context
// (no real event happened) and every send is flagged is_test = true.
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
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Confirm admin status through the same server-side session used
  // everywhere else — the service role below is only used for the
  // fan-out itself, once admin status is established.
  const { data: role } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .single();
  if (role?.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  let event: PushEventType | undefined;
  try {
    event = (await req.json()).event;
  } catch {
    // fall through
  }
  if (!event || !PUSH_EVENTS.includes(event)) {
    return NextResponse.json({ error: "Unknown event type." }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data: recipientData, error: recipientError } = await service.rpc(
    "push_resolve_recipients",
    { p_event: event },
  );
  if (recipientError) {
    console.error(
      "[push] broadcast-test recipients failed",
      recipientError.message,
    );
    return NextResponse.json(
      { error: "Couldn't look up recipients." },
      { status: 500 },
    );
  }
  const recipients = (recipientData ?? []) as Recipient[];
  if (recipients.length === 0) {
    return NextResponse.json({ sent: 0, total: 0 });
  }

  const label = PUSH_EVENT_META[event]?.label ?? event;
  const results = await Promise.all(
    recipients.map(async (r) => {
      const result = await sendPush(
        r,
        {
          title: `Test: ${label}`,
          body: "This is a test broadcast — no real event happened.",
          url:
            r.role === "admin"
              ? "/admin?tab=settings"
              : "/employee?tab=activity",
          tag: `broadcast-test:${event}`,
          test: true,
        },
        120,
      );
      if (result === "gone") {
        await service.rpc("push_prune_subscription", {
          p_endpoint: r.endpoint,
        });
      }
      await service
        .rpc("push_log_send", {
          p_event_type: event,
          p_is_test: true,
          p_user_id: r.user_id,
          p_device_label: r.device_label,
          p_endpoint: r.endpoint,
          p_result: result,
        })
        .then(
          () => {},
          (err) => console.error("[push] log_send failed", err),
        );
      return result;
    }),
  );

  return NextResponse.json({
    total: recipients.length,
    sent: results.filter((r) => r === "sent").length,
    failed: results.filter((r) => r !== "sent").length,
  });
}
