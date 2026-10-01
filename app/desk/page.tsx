import { createServerSupabase } from "@/lib/supabase/server";
import DeskQrDisplay from "@/components/desk/DeskQrDisplay";
import KioskLogin from "@/components/desk/KioskLogin";
import { getKioskSession } from "@/lib/kioskAuth";

export default async function DeskPage() {
  const kioskSession = await getKioskSession();
  if (!kioskSession) return <KioskLogin />;

  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("app_settings")
    .select("qr_mode")
    .eq("id", true)
    .single();

  return (
    <DeskQrDisplay
      mode={(data?.qr_mode as "static" | "dynamic") ?? "static"}
      kioskName={kioskSession.name}
    />
  );
}
