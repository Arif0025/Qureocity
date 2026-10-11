import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import EmployeePanel from "@/components/employee/EmployeePanel";
import { todayISTDateString } from "@/lib/istTime";

// Same constant as app/admin/page.tsx — move both to app_settings later
// if it needs to change without a redeploy.
const VENUE_CAPACITY = 60;

// The floor list uses the active-session snapshot. Home only needs the
// small daily count; it fetches its live on-site rows through its own RPC.
export default async function EmployeePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ tab }, supabase] = await Promise.all([
    searchParams,
    createServerSupabase(),
  ]);
  const currentTab = tab ?? "home";
  const needsFloorSessions = currentTab === "floor";
  const needsTodayCheckins = currentTab === "home";

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/employee/login");

  const { data: employee } = await supabase
    .from("employees")
    .select("role, name")
    .eq("id", user.id)
    .single();

  if (!employee) redirect("/employee/login");
  if (employee.role === "admin") redirect("/admin");

  const venueDay = todayISTDateString();
  const startOfToday = new Date(`${venueDay}T00:00:00+05:30`);
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const [{ data: sessions }, { count: todayCheckinCount }] = await Promise.all([
    needsFloorSessions
      ? supabase
          .from("play_sessions")
          .select(
            "id, start_time, end_time, status, children(name, allergies, medical_conditions, special_instructions, customers(name, phone))",
          )
          .in("status", ["active", "pending_payment"])
          .order("end_time", { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: null }),
    needsTodayCheckins
      ? supabase
          .from("play_sessions")
          .select("id", { count: "exact", head: true })
          .gte("start_time", startOfToday.toISOString())
          .lt("start_time", startOfTomorrow.toISOString())
          .in("status", ["active", "completed", "expired"])
      : Promise.resolve({ count: null }),
  ]);

  return (
    <EmployeePanel
      employeeId={user.id}
      employeeName={employee.name}
      initialSessions={(sessions as any) ?? []}
      todayCheckinCount={todayCheckinCount ?? 0}
      venueCapacity={VENUE_CAPACITY}
    />
  );
}
