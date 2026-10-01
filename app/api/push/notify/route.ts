import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { PUSH_EVENTS, type PushEventType } from "@/lib/push/events";
import { buildMessage, type PushContext } from "@/lib/push/message";
import { pushIsConfigured, sendPush } from "@/lib/push/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Recipient = {
  user_id: string;
  role: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  device_label: string | null;
};

function secretMatches(header: string | null): boolean {
  const expected = process.env.PUSH_NOTIFY_SECRET;
  if (!expected || !header) return false;
  const given = header.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Called by the database (pg_net, via push_enqueue() in migration 0072)
// whenever something notifiable happens. Not a user-facing endpoint —
// it only accepts the shared secret.
export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!pushIsConfigured()) {
    return NextResponse.json(
      { error: "Push is not configured (VAPID keys missing)." },
      { status: 503 },
    );
  }

  let body: { event?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const event = body.event as PushEventType;
  if (!PUSH_EVENTS.includes(event) || typeof body.payload !== "object") {
    return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: ctxData, error: ctxError } = await supabase.rpc(
    "push_event_context",
    { p_event: event, p_payload: body.payload },
  );
  if (ctxError) {
    console.error("[push] context failed", ctxError.message);
    return NextResponse.json(
      { error: "Context lookup failed" },
      { status: 500 },
    );
  }
  // null = the row was deleted/discarded in the meantime; nothing to say.
  if (!ctxData) return NextResponse.json({ sent: 0, skipped: "no-context" });
  const ctx = ctxData as PushContext;

  // Staff punches are about a person; don't tell them about themselves.
  const excludeUser =
    event === "staff_punch_in" || event === "staff_punch_out"
      ? (ctx.employee_id ?? null)
      : null;

  const { data: recipientData, error: recipientError } = await supabase.rpc(
    "push_resolve_recipients",
    { p_event: event, p_exclude_user: excludeUser },
  );
  if (recipientError) {
    console.error("[push] recipients failed", recipientError.message);
    return NextResponse.json(
      { error: "Recipient lookup failed" },
      { status: 500 },
    );
  }
  const recipients = (recipientData ?? []) as Recipient[];
  if (recipients.length === 0) return NextResponse.json({ sent: 0 });

  // Time-based alerts go stale fast; everything else can wait a while
  // for a phone that is briefly offline.
  const ttl = event === "session_ending" ? 10 * 60 : 60 * 60;

  const results = await Promise.all(
    recipients.map(async (r) => {
      const message = buildMessage(
        event,
        ctx,
        r.role === "admin" ? "admin" : "staff",
      );
      const result = await sendPush(r, message, ttl);
      if (result === "gone") {
        await supabase.rpc("push_prune_subscription", {
          p_endpoint: r.endpoint,
        });
      }
      // Best-effort: a logging failure must never affect the send itself.
      await supabase
        .rpc("push_log_send", {
          p_event_type: event,
          p_is_test: false,
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
    sent: results.filter((r) => r === "sent").length,
    removed: results.filter((r) => r === "gone").length,
    failed: results.filter((r) => r === "failed").length,
  });
}
