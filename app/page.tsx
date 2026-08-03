import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-brand-cloud overflow-hidden relative flex items-center justify-center">
      {/* Decorative background shapes — echoes the logo's sun-ray/circle motif */}
      <div className="pointer-events-none absolute -top-20 -left-20 w-72 h-72 rounded-full bg-brand-sun/20 blur-2xl" />
      <div className="pointer-events-none absolute top-40 -right-24 w-96 h-96 rounded-full bg-brand-sky/15 blur-2xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 w-64 h-64 rounded-full bg-brand-coral/10 blur-2xl" />

      <div className="relative max-w-md mx-auto px-4 text-center">
        <Image
          src="/logo-full.png"
          alt="QureoCity"
          width={340}
          height={170}
          className="mx-auto mb-10 drop-shadow-sm w-[240px] md:w-[320px] h-auto"
          priority
        />

        {/* The main event */}
        <Link
          href="/checkin"
          className="inline-flex items-center gap-2 md:gap-3 min-h-[68px] md:min-h-[76px] w-full justify-center px-8 rounded-full bg-brand-sun text-brand-purpleDeep font-extrabold text-xl md:text-2xl shadow-lg shadow-brand-sun/30 hover:scale-105 active:scale-95 transition-transform animate-[wiggle_1.5s_ease-in-out_3]"
        >
          Check In
        </Link>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/employee/login"
            className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-full text-brand-ink/40 text-xs font-semibold hover:text-brand-ink/70 transition-colors"
          >
            Staff login
          </Link>
          <span className="text-brand-ink/15">·</span>
          <Link
            href="/desk"
            className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-full text-brand-ink/40 text-xs font-semibold hover:text-brand-ink/70 transition-colors"
          >
            Desk display
          </Link>
        </div>
      </div>
    </div>
  );
}
