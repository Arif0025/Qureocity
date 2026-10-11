import SpecialDayCheckin from "@/components/checkin/SpecialDayCheckin";

export default async function SpecialDayPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <SpecialDayCheckin code={code} />;
}
