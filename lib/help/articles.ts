// Small, static staff help content. Deliberately not a database table —
// this changes rarely and only Claude/Arif edit it, so a CMS layer would
// be pure overhead. If it later needs in-app editing by admins, move
// this to a help_articles table + admin RPC and keep the same shape.

export type HelpAudience = "all" | "admin" | "staff";

export type HelpArticle = {
  slug: string;
  title: string;
  category: string;
  audience: HelpAudience;
  // Extra terms that should match search even if they're not in the
  // title, e.g. "clock in" should find "How to punch in".
  keywords: string[];
  body: string; // plain text, short paragraphs — rendered as-is, no markdown
};

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "checkin-checkout",
    title: "How to check in and check out a child",
    category: "Front desk",
    audience: "all",
    keywords: ["kiosk", "club check-in", "customer", "session", "time"],
    body: `Use Club Check-in to look up a child by name or their parent's phone number. Select the child, choose a duration if it's a timed session, and confirm — they'll immediately show as on-site.

To check a child out, find them in "Kids on site" (on the Overview or Home tab) and use Check out. There's also an automatic reminder that repeats until a child still shown as on-site is checked out — see "What each notification means."`,
  },
  {
    slug: "punch-in-out",
    title: "How to punch in and punch out",
    category: "Attendance",
    audience: "all",
    keywords: ["clock in", "clock out", "shift", "attendance", "auto punch"],
    body: `Go to the Punch tab and tap Punch In at the start of your shift, and Punch Out at the end. Your attendance record uses this timestamp directly.

If you forget to punch out, the system automatically closes your shift at a fixed cutoff time later that night so it doesn't stay open indefinitely. This shows up as an "automatic" punch-out in your attendance history — if the time looks wrong, let an admin know so they can correct it.`,
  },
  {
    slug: "membership-visit-limits",
    title: "How membership visit limits work",
    category: "Memberships",
    audience: "all",
    keywords: [
      "plan",
      "subscription",
      "visits left",
      "visits used",
      "exhausted",
    ],
    body: `Some membership plans cap how many visits are included (for example, "3 months, 12 visits"). Once a child's visits are used up, check-in is blocked with a clear message rather than silently letting them in — they'll still appear in search, just not check-in-able until the admin adjusts their plan or they pay for a walk-in visit instead.

A same-day special-event pass isn't affected by this cap — it's tracked separately.`,
  },
  {
    slug: "find-a-customer",
    title: "How to search for a customer or child",
    category: "Front desk",
    audience: "all",
    keywords: ["directory", "parent", "phone number", "lookup"],
    body: `Use the search icon at the top of the app, or the Directory / Search tab, and type a parent's name, phone number, or a child's name. Matching families show with all of their children, membership status, and any allergies or medical notes on file.`,
  },
  {
    slug: "notifications-setup",
    title: "How to turn on notifications on your phone",
    category: "Notifications",
    audience: "all",
    keywords: ["push", "alerts", "iphone", "android", "home screen", "install"],
    body: `Go to Settings (admins) or Activity (staff) and turn on "Notifications on this device." On Android this works right away. On iPhone or iPad, you first need to add QureoCity to your Home Screen from Safari's Share menu, then open it from that icon and turn notifications on from there.

Notifications are off until you turn them on, and turning them on only applies to that one device — you'll need to repeat this on each phone or tablet you use.`,
  },
  {
    slug: "what-notifications-mean",
    title: "What each notification means",
    category: "Notifications",
    audience: "all",
    keywords: ["alert", "check-in alert", "punch alert", "session ending"],
    body: `Depending on what your admin has turned on for your role, you may get alerts for: a child checking in or out, a child's play session about to end, a child still checked in past their session's end time (this one repeats until they're checked out), and staff punching in or out. Tapping a notification takes you straight to the relevant screen. Admins can also choose whether a child's name appears on the lock screen, or a more generic message instead.`,
  },
  {
    slug: "admin-dashboard-tabs",
    title: "What each dashboard tab does",
    category: "Admin",
    audience: "admin",
    keywords: [
      "overview",
      "directory",
      "memberships",
      "staff",
      "settings",
      "sidebar",
    ],
    body: `Overview — today's activity at a glance: who's checked in, who's on duty, and monthly stats.
Directory — every customer and child on file, searchable.
Memberships — active subscriptions, plans, and special-day passes.
Staff — the team roster, shift schedule, and attendance history.
Pending — walk-in or membership check-ins waiting on payment confirmation.
Club check-in — the same quick check-in flow staff use, for when an admin is covering the desk.
Settings — venue configuration, QR mode, notification rules, and your own password.`,
  },
  {
    slug: "special-day-passes",
    title: "How special-day passes work",
    category: "Memberships",
    audience: "all",
    keywords: ["event", "one-time", "birthday party", "mela"],
    body: `A special-day pass covers one specific event date rather than a recurring window. A child with a pass for today can check in even without an active membership. It doesn't draw down or interact with a child's regular membership visit count.`,
  },
  {
    slug: "something-broken",
    title: "Something looks wrong — who do I contact?",
    category: "General",
    audience: "all",
    keywords: ["bug", "error", "not working", "help", "support"],
    body: `If something in the app looks incorrect — a check-in that didn't register, an attendance record that looks wrong, a notification that didn't arrive — flag it to Arif with as much detail as you can: what you did, what you expected, and what actually happened. A screenshot helps a lot.`,
  },
];

export function helpArticlesFor(isAdmin: boolean): HelpArticle[] {
  return HELP_ARTICLES.filter(
    (a) =>
      a.audience === "all" ||
      (isAdmin && a.audience === "admin") ||
      (!isAdmin && a.audience === "staff"),
  );
}

export function findHelpArticle(
  slug: string,
  isAdmin: boolean,
): HelpArticle | null {
  return helpArticlesFor(isAdmin).find((a) => a.slug === slug) ?? null;
}
