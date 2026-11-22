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
type MobileRecipient = { user_id: string; role: string; expo_push_token: string; device_label: string };

async function sendExpoPush(target: MobileRecipient, message: ReturnType<typeof buildMessage>, ttl: number) {
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: target.expo_push_token,
        title: message.title,
        body: message.body,
        sound: 'default',
        channelId: 'staff-updates',
        ttl,
        data: { event: 'mobile-event', url: message.url, tag: message.tag },
      }),
    });
    if (!response.ok) return 'failed' as const;
    const result = await response.json();
    const ticket = Array.isArray(result?.data) ? result.data[0] : result?.data;
    if (ticket?.status === 'ok') return 'sent' as const;
    if (ticket?.details?.error === 'DeviceNotRegistered') return 'gone' as const;
    console.error('[push] Expo ticket failed', ticket?.message ?? 'unknown error');
    return 'failed' as const;
  } catch (error) {
    console.error('[push] Expo request failed', error);
    return 'failed' as const;
  }
}

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

  const contextRequest = supabase.rpc("push_event_context", { p_event: event, p_payload: body.payload });
  const templateRequest = event === "child_checkout"
    ? supabase.from("message_templates").select("body").eq("event_key", "child_checkout_push").eq("is_default", true).eq("is_active", true).maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const [{ data: ctxData, error: ctxError }, { data: templateData, error: templateError }] = await Promise.all([contextRequest, templateRequest]);
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
  if (templateError) console.error("[push] checkout message format lookup failed", templateError.message);
  if (typeof templateData?.body === "string") ctx.checkout_message_template = templateData.body;

  // Staff punches are about a person; don't tell them about themselves.
  const excludeUser =
    event === "staff_punch_in" || event === "staff_punch_out"
      ? (ctx.employee_id ?? null)
      : null;

  let leaveReminderEmployee: string | null = null;
  if (event === "employee_leave" && ctx.leave_kind === "reminder" && ctx.leave_request_id) {
    const { data: leaveRow, error: leaveLookupError } = await supabase
      .from("employee_leave_requests")
      .select("employee_id")
      .eq("id", ctx.leave_request_id)
      .maybeSingle();
    if (leaveLookupError) console.error("[push] leave reminder recipient lookup failed", leaveLookupError.message);
    leaveReminderEmployee = leaveRow?.employee_id ?? null;
  }

  const [webResult, mobileResult] = await Promise.all([
    pushIsConfigured()
      ? supabase.rpc("push_resolve_recipients", { p_event: event, p_exclude_user: excludeUser, p_target_user: leaveReminderEmployee })
      : Promise.resolve({ data: [], error: null }),
    supabase.rpc("mobile_push_resolve_recipients", { p_event: event, p_exclude_user: excludeUser, p_target_user: leaveReminderEmployee }),
  ]);
  const mobileSchemaNotApplied = mobileResult.error?.code === 'PGRST202' || mobileResult.error?.code === '42883';
  if (mobileSchemaNotApplied) console.warn('[push] mobile push migration is not applied yet; continuing with web subscriptions');
  if (webResult.error || (mobileResult.error && !mobileSchemaNotApplied)) {
    console.error("[push] recipient lookup failed", webResult.error?.message ?? mobileResult.error?.message);
    return NextResponse.json({ error: "Recipient lookup failed" }, { status: 500 });
  }
  const recipients = (webResult.data ?? []) as Recipient[];
  const mobileRecipients = (mobileSchemaNotApplied ? [] : mobileResult.data ?? []) as MobileRecipient[];
  if (recipients.length === 0 && mobileRecipients.length === 0) return NextResponse.json({ sent: 0 });

  // Time-based alerts go stale fast; everything else can wait a while
  // for a phone that is briefly offline.
  const ttl = event === "session_ending" ? 10 * 60 : 60 * 60;

  // One inbox row per user rather than per registered device. Batch the
  // write and let it run alongside push delivery so persistence adds no
  // serial delay to the alert itself.
  const inboxCategory = event === "new_registration" || event === "party_registration"
    ? "admin"
    : "system";
  const inboxRows = event === "employee_leave" ? [] : [...new Map([...recipients, ...mobileRecipients].map((r) => {
    const message = buildMessage(event, ctx, r.role === "admin" ? "admin" : "staff");
    return [r.user_id, {
      user_id: r.user_id,
      category: inboxCategory,
      title: message.title,
      body: message.body,
      target_url: message.url,
    }] as const;
  })).values()];
  const inboxWrite = inboxRows.length === 0 ? Promise.resolve() : Promise.all([
    supabase.from("employee_notifications").insert(inboxRows),
    supabase.from("employee_notifications").delete().lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ]).then(([insertResult, pruneResult]) => {
    if (insertResult.error) console.error("[push] inbox insert failed", insertResult.error.message);
    if (pruneResult.error) console.error("[push] inbox prune failed", pruneResult.error.message);
  }).catch((error: unknown) => console.error("[push] inbox persistence failed", error));

  const webResults = await Promise.all(
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
  const mobileResults = await Promise.all(mobileRecipients.map(async (r) => {
    const message = buildMessage(event, ctx, r.role === "admin" ? "admin" : "staff");
    const result = await sendExpoPush(r, message, ttl);
    if (result === 'gone') {
      await supabase.from('mobile_push_devices').delete().eq('expo_push_token', r.expo_push_token);
    }
    await supabase.rpc('push_log_send', {
      p_event_type: event,
      p_is_test: false,
      p_user_id: r.user_id,
      p_device_label: r.device_label,
      p_endpoint: r.expo_push_token,
      p_result: result,
    }).then(() => {}, (err) => console.error('[push] mobile log_send failed', err));
    return result;
  }));
  await inboxWrite;

  return NextResponse.json({
    sent: [...webResults, ...mobileResults].filter((r) => r === "sent").length,
    removed: [...webResults, ...mobileResults].filter((r) => r === "gone").length,
    failed: [...webResults, ...mobileResults].filter((r) => r === "failed").length,
  });
}
