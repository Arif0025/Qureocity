import type { PushEventType, PushMessage } from "./events";
import { createWhatsAppActionToken } from "./whatsapp-action";
import { renderMessageTemplate } from "@/lib/message-template-format";

// What push_event_context() (migration 0072) returns for an event.
export type PushContext = {
  session_id?: string;
  child_name?: string;
  start_time?: string;
  end_time?: string | null;
  ended_at?: string | null;
  duration_mins?: number | null;
  minutes_left?: number | null;
  minutes_overdue?: number | null;
  staff_on_site?: string[];
  employee_id?: string;
  employee_name?: string;
  registration_id?: string;
  registration_type?: "new" | "renewal" | "special";
  parent_name?: string;
  customer_phone?: string;
  checkout_message_template?: string;
  plan_name?: string;
  receipt_number?: string;
  event_date?: string | null;
  booking_id?: string;
  starts_at?: string;
  punch_in?: string;
  punch_out?: string | null;
  auto?: boolean;
  rule: {
    show_child_name: boolean;
    employee_scope: string;
    params: Record<string, unknown>;
  };
};

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

function clock(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : timeFmt.format(d);
}

function worked(fromIso?: string, toIso?: string | null): string {
  if (!fromIso || !toIso) return "";
  const mins = Math.round(
    (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000,
  );
  if (!Number.isFinite(mins) || mins < 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Tapping a notification lands on the right screen for the recipient's
// role (these are the same ?tab= URLs the panels use for navigation).
function floorUrl(role: "admin" | "staff"): string {
  return role === "admin" ? "/admin?tab=home" : "/employee?tab=floor";
}

export function buildMessage(
  event: PushEventType,
  ctx: PushContext,
  role: "admin" | "staff",
): PushMessage {
  const showName = ctx.rule.show_child_name && !!ctx.child_name;

  switch (event) {
    case "child_checkin": {
      const parts: string[] = [];
      if (!showName) parts.push("A child checked in");
      parts.push(
        ctx.duration_mins ? `${ctx.duration_mins} min session` : "Unlimited",
      );
      if (ctx.rule.params.include_staff_on_site !== false) {
        const staff = ctx.staff_on_site ?? [];
        parts.push(
          staff.length > 0
            ? `On site: ${staff.join(", ")}`
            : "No staff punched in",
        );
      }
      return {
        title: showName ? `${ctx.child_name} checked in` : "New check-in",
        body: parts.join(" · "),
        url: floorUrl(role),
        tag: "child_checkin",
        group: { plural: "new check-ins" },
      };
    }

    case "child_checkout": {
      const childLabel = showName ? ctx.child_name : "your child";
      const defaultMessage = renderMessageTemplate(
        ctx.checkout_message_template ?? "Hi {{parent_name}}! This is {{business_name}} — {{child_name}} has finished today's visit. Let us know if you need anything.",
        {
          parent_name: ctx.parent_name || "there",
          business_name: "QureoCity",
          child_name: childLabel,
          checkout_time: clock(ctx.ended_at) || "just now",
        },
      );
      const actionToken = role === "admin" && ctx.customer_phone
        ? createWhatsAppActionToken(ctx.customer_phone, defaultMessage)
        : null;
      return {
        title: showName ? `${ctx.child_name} checked out` : "Child checked out",
        body: ctx.ended_at ? `At ${clock(ctx.ended_at)}` : "Just now",
        url: floorUrl(role),
        tag: `child_checkout:${ctx.session_id ?? "x"}`,
        ...(actionToken ? {
          actions: [{ action: "whatsapp", title: "Message" }],
          actionUrls: { whatsapp: `/api/push/whatsapp?action=${actionToken}` },
        } : {}),
      };
    }

    case "session_ending": {
      const left = ctx.minutes_left;
      const leftText = left == null ? "Ending soon" : `${left} min left`;
      return {
        title: showName
          ? `${ctx.child_name}'s time is almost up`
          : "A child's time is almost up",
        body: ctx.end_time
          ? `${leftText} · ends ${clock(ctx.end_time)}`
          : leftText,
        url: floorUrl(role),
        tag: `session_ending:${ctx.session_id ?? "x"}`,
      };
    }

    case "session_overdue": {
      const mins = ctx.minutes_overdue ?? 0;
      return {
        title: showName
          ? `${ctx.child_name} hasn't been checked out`
          : "A child hasn't been checked out",
        body: `${mins} min past their session end — ${
          ctx.end_time ? `ended ${clock(ctx.end_time)}` : "time's up"
        }`,
        url: floorUrl(role),
        tag: `session_overdue:${ctx.session_id ?? "x"}`,
      };
    }

    case "staff_punch_in":
      return {
        title: `${ctx.employee_name ?? "Staff"} punched in`,
        body: `At ${clock(ctx.punch_in)}`,
        url:
          role === "admin" && ctx.employee_id
            ? `/admin?tab=staff&staff=${ctx.employee_id}`
            : "/employee?tab=home",
        tag: "staff_punch_in",
        group: { plural: "staff punch-ins" },
      };

    case "staff_punch_out": {
      const w = worked(ctx.punch_in, ctx.punch_out);
      return {
        title: `${ctx.employee_name ?? "Staff"} punched out${
          ctx.auto ? " (automatic)" : ""
        }`,
        body: [`At ${clock(ctx.punch_out)}`, w ? `Worked ${w}` : ""]
          .filter(Boolean)
          .join(" · "),
        url:
          role === "admin" && ctx.employee_id
            ? `/admin?tab=staff&staff=${ctx.employee_id}`
            : "/employee?tab=home",
        tag: "staff_punch_out",
        group: { plural: "staff punch-outs" },
      };
    }

    case "new_registration": {
      const type = ctx.registration_type === "renewal" ? "renewal" : ctx.registration_type === "special" ? "special-day" : "membership";
      const parts = [type, ctx.plan_name, ctx.receipt_number].filter(Boolean);
      if (ctx.event_date) parts.push(`Event ${ctx.event_date}`);
      return {
        title: showName ? `Registration: ${ctx.child_name}` : "New registration request",
        body: parts.join(" · "),
        url: "/admin?tab=notifications",
        tag: `new_registration:${ctx.registration_id ?? "x"}`,
      };
    }

    case "party_registration":
      return {
        title: showName ? `Party request: ${ctx.child_name}` : "New party booking request",
        body: [ctx.plan_name, ctx.starts_at ? clock(ctx.starts_at) : ""].filter(Boolean).join(" · "),
        url: "/admin?tab=notifications",
        tag: `party_registration:${ctx.booking_id ?? "x"}`,
      };
  }
}
