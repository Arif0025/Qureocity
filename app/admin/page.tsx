import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import AdminDashboardV2 from "@/components/admin/AdminDashboardV2";

// Simple, honest constant rather than a fake precision number — set this
// to whatever the venue's actual comfortable capacity is. Move to
// app_settings later if it needs to change without a redeploy.
const VENUE_CAPACITY = 60;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ tab }, supabase] = await Promise.all([
    searchParams,
    createServerSupabase(),
  ]);
  const loadInitialShifts = tab === "staff";
  const loadSettings = tab === "settings";

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


  // Staff powers GlobalSearch and the Staff tab. Settings are fetched only
  // when that tab is requested, so ordinary navigation skips that lookup.
  const [{ data: staff }, { data: settings }] = await Promise.all([
    supabase.from("employees").select("id, name, role"),
    loadSettings
      ? supabase.from("app_settings").select("qr_mode").eq("id", true).single()
      : Promise.resolve({ data: null }),
  ]);

  const { data: shifts } = loadInitialShifts
    ? await supabase
        .from("shifts")
        .select("id, employee_id, start_time, end_time, notes, employees(name)")
        .order("start_time", { ascending: true })
    : { data: null };

  return (
    <AdminDashboardV2
      employeeName={employee.name}
      isAdmin={employee.role === "admin"}
      staff={staff ?? []}
      qrMode={(settings?.qr_mode as "static" | "dynamic") ?? "static"}
      venueCapacity={VENUE_CAPACITY}
      shifts={(shifts as any) ?? []}
      shiftsLoaded={loadInitialShifts}
    />
  );
}
