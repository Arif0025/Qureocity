import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabase } from "@/lib/supabase/server";
import { verifyQrToken } from "@/lib/qrToken";

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { mode, value } = await req.json();

  if (mode === "dynamic") {
    const secret = process.env.QR_SIGNING_SECRET;
    if (!secret)
      return NextResponse.json(
        { error: "QR_SIGNING_SECRET not configured" },
        { status: 500 },
      );

    if (!verifyQrToken(value, secret)) {
      return NextResponse.json(
        { error: "QR code expired — please rescan." },
        { status: 400 },
      );
    }

    // Anti-replay: reject if this exact token was already used to punch
    // in within its own validity window.
    const tokenHash = crypto.createHash("sha256").update(value).digest("hex");
    const { data, error } = await supabase.rpc("employee_toggle_punch", {
      p_token_hash: tokenHash,
    });
    if (error) {
      const status = error.message.includes("just used") ? 400 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json(data);
  } else {
    const expected =
      process.env.NEXT_PUBLIC_DESK_QR_VALUE ?? "QUREOCITY-FRONT-DESK";
    if (value !== expected) {
      return NextResponse.json(
        { error: "That doesn't look like the front-desk code." },
        { status: 400 },
      );
    }
  }

  const { data, error } = await supabase.rpc("employee_toggle_punch");
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
