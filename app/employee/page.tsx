import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import EmployeePanel from "@/components/employee/EmployeePanel";

// Same constant as app/admin/page.tsx — move both to app_settings later
// if it needs to change without a redeploy.
const VENUE_CAPACITY = 60;

export default async function EmployeePage() {
  const supabase = createServerSupabase();

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

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [{ data: sessions }, { count: todayCheckinCount }] = await Promise.all([
    supabase
      .from("play_sessions")
      .select(
        "id, start_time, end_time, status, children(name, allergies, medical_conditions, special_instructions, customers(name, phone))",
      )
      .in("status", ["active", "pending_payment"])
      .order("end_time", { ascending: true, nullsFirst: false }),
    supabase
      .from("play_sessions")
      .select("id", { count: "exact", head: true })
      .gte("start_time", startOfToday.toISOString())
      .in("status", ["active", "completed", "expired"]),
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
