import SpecialDayCheckin from "@/components/checkin/SpecialDayCheckin";

export default function SpecialDayPage({
  params,
}: {
  params: { code: string };
}) {
  return <SpecialDayCheckin code={params.code} />;
}
