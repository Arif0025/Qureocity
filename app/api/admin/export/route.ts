import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXPORT_GROUPS = {
  customers: [
    { table: "customers", orderBy: "id" },
    { table: "children", orderBy: "id" },
  ],
  memberships: [
    { table: "membership_plans", orderBy: "id" },
    { table: "child_subscriptions", orderBy: "child_id" },
    { table: "child_special_passes", orderBy: "id" },
  ],
  checkins: [{ table: "play_sessions", orderBy: "id" }],
  registrations: [
    { table: "membership_registrations", orderBy: "id" },
    { table: "party_plans", orderBy: "id" },
    { table: "party_bookings", orderBy: "id" },
  ],
  staff: [
    { table: "employees", orderBy: "id" },
    { table: "attendance_logs", orderBy: "id" },
    { table: "shifts", orderBy: "id" },
  ],
  settings: [
    { table: "app_settings", orderBy: "id" },
    { table: "notification_rules", orderBy: "event_type" },
    { table: "notification_preferences", orderBy: ["user_id", "event_type"] },
    { table: "notification_log", orderBy: ["event_type", "dedupe_key"] },
    { table: "push_send_log", orderBy: ["id"] },
    { table: "employee_notifications", orderBy: ["id"] },
  ],
} as const;

type ExportGroup = keyof typeof EXPORT_GROUPS;

async function downloadExport(request: NextRequest) {
  const auth = await createServerSupabase();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to export data." }, { status: 401 });

  const { data: employee } = await auth.from("employees").select("role").eq("id", user.id).maybeSingle();
  if (employee?.role !== "admin") return NextResponse.json({ error: "Only admins can export data." }, { status: 403 });

  let requested: unknown;
  try {
    requested = (await request.json()).groups;
  } catch {
    return NextResponse.json({ error: "Choose at least one data group." }, { status: 400 });
  }
  if (!Array.isArray(requested) || requested.length === 0 || requested.some((key) => typeof key !== "string" || !Object.prototype.hasOwnProperty.call(EXPORT_GROUPS, key))) {
    return NextResponse.json({ error: "The selected data groups are invalid." }, { status: 400 });
  }

  const groups = [...new Set(requested as ExportGroup[])];
  const admin = createServiceRoleClient();
  const exported: Record<string, unknown[]> = {};

  try {
    for (const group of groups) {
      for (const resource of EXPORT_GROUPS[group]) {
        const rows: Record<string, unknown>[] = [];
        const pageSize = 1000;
        for (let from = 0; ; from += pageSize) {
          const query = resource.table === "app_settings"
            ? admin.from(resource.table).select("id, qr_mode, attendance_variance_threshold_mins, auto_punch_out_time, party_booking_open_time, party_booking_close_time, party_booking_slot_minutes, party_booking_gap_minutes")
            : admin.from(resource.table).select("*");
          let orderedQuery = query;
          const orderColumns = Array.isArray(resource.orderBy) ? resource.orderBy : [resource.orderBy];
          for (const column of orderColumns) orderedQuery = orderedQuery.order(column, { ascending: true });
          const { data, error } = await orderedQuery.range(from, from + pageSize - 1);
          if (error) throw new Error(`${resource.table}: ${error.message}`);
          rows.push(...((data ?? []) as Record<string, unknown>[]));
          if (!data || data.length < pageSize) break;
        }
        exported[resource.table] = rows;
      }
    }

    const body = {
      product: "QureoCity",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      groups,
      tables: exported,
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new NextResponse(JSON.stringify(body, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="qureocity-export-${stamp}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed.";
    return NextResponse.json({ error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  return downloadExport(request);
}
