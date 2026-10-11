"use client";

type Tone = "neutral" | "success" | "warning" | "info" | "danger";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-white/8 text-brand-nightText/60",
  success: "bg-brand-leaf/15 text-brand-leaf",
  warning: "bg-brand-sun/15 text-brand-sun",
  info: "bg-brand-sky/15 text-brand-skyLight",
  danger: "bg-brand-coral/15 text-brand-coral",
};

// One pill style for every status/count label in the app — "Pending",
// plan-type tags, "on site", overdue markers, the lot. Picking a tone
// instead of writing bg/text classes by hand is what keeps every badge
// the same shape and weight everywhere it shows up.
export default function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
