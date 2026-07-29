import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Option B for scheduling expire_overdue_sessions() — use this ONLY if
// you'd rather not enable pg_cron in Supabase. Protected by a shared
// secret so this can't be hit by anyone who finds the URL.
//
// Wire it up with Vercel Cron in vercel.json (already included in this
// project), which calls this route every 5 minutes at no extra cost on
// Vercel's Hobby/Pro plans (cron is included, not a paid add-on).
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.rpc("expire_overdue_sessions");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: autoPunchedOut, error: attendanceError } = await supabase.rpc(
    "auto_punch_out_open_attendance",
  );
  if (attendanceError) {
    return NextResponse.json({ error: attendanceError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    autoPunchedOut: autoPunchedOut ?? 0,
    ranAt: new Date().toISOString(),
  });
}
