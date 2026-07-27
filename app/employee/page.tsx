import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import EmployeePanel from "@/components/employee/EmployeePanel";

export default async function EmployeePage() {
  const supabase = createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/employee/login");

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!employee) redirect("/employee/login");
  if (employee.role === "admin") redirect("/admin");

  const [{ data: sessions }, { data: myShift }] = await Promise.all([
    supabase
      .from("play_sessions")
      .select(
        "id, start_time, end_time, status, children(name, customers(name))",
      )
      .eq("status", "active")
      .order("end_time", { ascending: true, nullsFirst: false }),
    supabase
      .from("shifts")
      .select("id, start_time, end_time, notes")
      .eq("employee_id", user.id)
      .maybeSingle(),
  ]);

  return (
    <EmployeePanel
      initialSessions={(sessions as any) ?? []}
      myShift={(myShift as any) ?? null}
    />
  );
}
