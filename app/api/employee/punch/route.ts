import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabase } from "@/lib/supabase/server";
import { verifyQrToken } from "@/lib/qrToken";

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { mode, value } = await req.json();

  if (mode === "dynamic") {
    const secret = process.env.QR_SIGNING_SECRET;
    if (!secret) return NextResponse.json({ error: "QR_SIGNING_SECRET not configured" }, { status: 500 });

    if (!verifyQrToken(value, secret)) {
      return NextResponse.json({ error: "QR code expired — please rescan." }, { status: 400 });
    }

    // Anti-replay: reject if this exact token was already used to punch
    // in within its own validity window.
    const tokenHash = crypto.createHash("sha256").update(value).digest("hex");
    const { data: existing } = await supabase
      .from("used_qr_tokens")
      .select("token_hash")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "This code was just used — please rescan." }, { status: 400 });
    }

    await supabase.from("used_qr_tokens").insert({ token_hash: tokenHash });
  } else {
    const expected = process.env.NEXT_PUBLIC_DESK_QR_VALUE ?? "QUREOCITY-FRONT-DESK";
    if (value !== expected) {
      return NextResponse.json({ error: "That doesn't look like the front-desk code." }, { status: 400 });
    }
  }

  const { error, action } = await checkTogglePunch(supabase, user.id);
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ ok: true, action, at: new Date().toISOString() });
}

async function checkTogglePunch(supabase: ReturnType<typeof createServerSupabase>, employeeId: string) {
  const { data: openLog } = await supabase
    .from("attendance_logs")
    .select("id")
    .eq("employee_id", employeeId)
    .is("punch_out", null)
    .order("punch_in", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openLog) {
    const { error } = await supabase
      .from("attendance_logs")
      .update({ punch_out: new Date().toISOString() })
      .eq("id", openLog.id);
    return { error: error?.message, action: "out" as const };
  }

  const { error } = await supabase.from("attendance_logs").insert({ employee_id: employeeId });
  return { error: error?.message, action: "in" as const };
}
