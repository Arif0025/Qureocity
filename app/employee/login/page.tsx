import { redirect } from "next/navigation";
import EmployeeLoginForm from "@/components/employee/EmployeeLoginForm";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function EmployeeLoginPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: employee } = await supabase
      .from("employees")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (employee?.role === "admin") redirect("/admin");
    if (employee) redirect("/employee");
  }

  return <EmployeeLoginForm />;
}
