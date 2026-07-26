import { createServerSupabase } from "@/lib/supabase/server";
import DeskQrDisplay from "@/components/desk/DeskQrDisplay";

export default async function DeskPage() {
  const supabase = createServerSupabase();
  const { data } = await supabase.from("app_settings").select("qr_mode").eq("id", true).single();

  return <DeskQrDisplay mode={(data?.qr_mode as "static" | "dynamic") ?? "static"} />;
}
