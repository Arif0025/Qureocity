import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import AdminDashboardV2 from "@/components/admin/AdminDashboardV2";

// Simple, honest constant rather than a fake precision number — set this
// to whatever the venue's actual comfortable capacity is. Move to
// app_settings later if it needs to change without a redeploy.
const VENUE_CAPACITY = 60;

export default async function AdminPage() {
  const supabase = createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/employee/login");

  const { data: employee } = await supabase
    .from("employees")
    .select("id, name, role")
    .eq("id", user.id)
    .single();

  if (!employee) redirect("/employee/login");
  if (employee.role !== "admin") redirect("/employee");

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const seventyDaysAgo = new Date();
  seventyDaysAgo.setDate(seventyDaysAgo.getDate() - 70);

  const [
    { data: sessions },
    { data: staff },
    { data: settings },
    { data: onDutyLogs },
    { count: todayCheckinCount },
    { data: durationRows },
    { data: ageBuckets },
    { data: dailyCounts },
    { data: shifts },
    { data: attendanceLogs },
  ] = await Promise.all([
    supabase
      .from("play_sessions")
      .select(
        "id, start_time, end_time, status, children(name, allergies, medical_conditions, special_instructions, customers(name, phone))",
      )
      .eq("status", "active")
      .order("end_time", { ascending: true, nullsFirst: false }),
    supabase.from("employees").select("id, name, role"),
    supabase.from("app_settings").select("qr_mode").eq("id", true).single(),
    supabase
      .from("attendance_logs")
      .select("employee_id, punch_in, employees(name)")
      .is("punch_out", null),
    supabase
      .from("play_sessions")
      .select("id", { count: "exact", head: true })
      .gte("start_time", startOfToday.toISOString())
      .in("status", ["active", "completed", "expired"]),
    supabase
      .from("play_sessions")
      .select("duration_mins")
      .gte("start_time", startOfToday.toISOString())
      .not("duration_mins", "is", null),
    supabase.rpc("checkin_age_buckets", {
      p_since: startOfToday.toISOString(),
    }),
    supabase.rpc("checkin_daily_counts", { p_days: 28 }),
    supabase
      .from("shifts")
      .select("id, employee_id, start_time, end_time, notes, employees(name)")
      .order("start_time", { ascending: true }),
    supabase
      .from("attendance_logs")
      .select(
        "id, employee_id, punch_in, punch_out, auto_punched_out, employees(name)",
      )
      .order("punch_in", { ascending: false })
      .limit(200),
  ]);

  const avgDurationMins =
    durationRows && durationRows.length > 0
      ? Math.round(
          durationRows.reduce((sum, r) => sum + (r.duration_mins ?? 0), 0) /
            durationRows.length,
        )
      : null;

  return (
    <AdminDashboardV2
      employeeName={employee.name}
      isAdmin={employee.role === "admin"}
      initialSessions={(sessions as any) ?? []}
      staff={staff ?? []}
      qrMode={(settings?.qr_mode as "static" | "dynamic") ?? "static"}
      onDutyStaff={(onDutyLogs as any) ?? []}
      todayCheckinCount={todayCheckinCount ?? 0}
      avgDurationMins={avgDurationMins}
      venueCapacity={VENUE_CAPACITY}
      ageBuckets={(ageBuckets as any) ?? []}
      dailyCounts={(dailyCounts as any) ?? []}
      shifts={(shifts as any) ?? []}
      attendanceLogs={(attendanceLogs as any) ?? []}
    />
  );
}
