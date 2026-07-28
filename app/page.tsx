import Link from "next/link";
import Image from "next/image";

const PILLARS = [
  {
    emoji: "🧪",
    title: "Discover",
    blurb: 'Hands-on STEM play that turns curiosity into "aha!" moments.',
  },
  {
    emoji: "🎨",
    title: "Create",
    blurb: "Art, imagination, and building — kids make it, we celebrate it.",
  },
  {
    emoji: "💛",
    title: "Belong",
    blurb: "A warm, watched-over space where every kid feels at home.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-brand-cloud overflow-hidden relative">
      {/* Decorative background shapes — echoes the logo's sun-ray/circle motif */}
      <div className="pointer-events-none absolute -top-20 -left-20 w-72 h-72 rounded-full bg-brand-sun/20 blur-2xl" />
      <div className="pointer-events-none absolute top-40 -right-24 w-96 h-96 rounded-full bg-brand-sky/15 blur-2xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 w-64 h-64 rounded-full bg-brand-coral/10 blur-2xl" />

      <div className="relative max-w-3xl mx-auto px-4 pt-10 md:pt-14 pb-20 text-center">
        <Image
          src="/logo-full.png"
          alt="QureoCity"
          width={340}
          height={170}
          className="mx-auto mb-6 drop-shadow-sm w-[220px] md:w-[340px] h-auto"
          priority
        />

        <h1 className="text-2xl md:text-4xl font-extrabold text-brand-purpleDeep mb-3 px-2">
          Play. Discover. Belong.
        </h1>
        <p className="text-brand-ink/70 text-base md:text-lg max-w-xl mx-auto mb-10 px-2">
          QureoCity is a place for kids to explore, create, and make friends —
          while parents relax knowing every check-in and check-out is tracked
          and secure.
        </p>

        {/* The main event */}
        <Link
          href="/checkin"
          className="inline-flex items-center gap-2 md:gap-3 min-h-[64px] md:min-h-[72px] px-7 md:px-10 rounded-full bg-brand-sun text-brand-purpleDeep font-extrabold text-lg md:text-2xl shadow-lg shadow-brand-sun/30 hover:scale-105 active:scale-95 transition-transform animate-wiggle"
        >
          ✨ Check In Now
        </Link>

        <div className="grid sm:grid-cols-3 gap-5 mt-16 text-left">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="bg-white rounded-xl2 shadow-sm p-6 hover:-translate-y-1 transition-transform"
            >
              <div className="text-3xl mb-3">{p.emoji}</div>
              <p className="font-bold text-brand-ink mb-1">{p.title}</p>
              <p className="text-sm text-brand-ink/60">{p.blurb}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/employee"
            className="inline-flex items-center justify-center min-h-[56px] px-6 rounded-full bg-white border border-brand-ink/10 text-brand-ink/60 text-sm font-semibold hover:border-brand-sky/40 hover:text-brand-ink transition-colors shadow-sm"
          >
            Employee Login
          </Link>
          <Link
            href="/admin"
            className="inline-flex items-center justify-center min-h-[56px] px-6 rounded-full bg-white border border-brand-ink/10 text-brand-ink/60 text-sm font-semibold hover:border-brand-sky/40 hover:text-brand-ink transition-colors shadow-sm"
          >
            Admin Login
          </Link>
          <Link
            href="/desk"
            className="inline-flex items-center justify-center min-h-[56px] px-6 rounded-full bg-white border border-brand-ink/10 text-brand-ink/60 text-sm font-semibold hover:border-brand-sky/40 hover:text-brand-ink transition-colors shadow-sm"
          >
            Desk Display
          </Link>
        </div>
      </div>
    </div>
  );
}
