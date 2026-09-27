// The notification catalog. Shared by the settings screens (client) and
// the sender (server). The event types themselves are fixed in the
// database (notification_rules, migration 0072) — admins tune WHEN each
// one fires and WHO gets it, but can't invent new ones from the UI.

export const PUSH_EVENTS = [
  "child_checkin",
  "child_checkout",
  "session_ending",
  "staff_punch_in",
  "staff_punch_out",
] as const;

export type PushEventType = (typeof PUSH_EVENTS)[number];

export type EmployeeScope = "none" | "on_duty" | "all";

export const PUSH_EVENT_META: Record<
  PushEventType,
  { label: string; description: string }
> = {
  child_checkin: {
    label: "Child checked in",
    description: "A child has just been checked in.",
  },
  child_checkout: {
    label: "Child checked out",
    description: "A child has just been checked out.",
  },
  session_ending: {
    label: "Child's time nearing end",
    description: "A child's play session is about to run out.",
  },
  staff_punch_in: {
    label: "Staff punched in",
    description: "A staff member has just punched in.",
  },
  staff_punch_out: {
    label: "Staff punched out",
    description: "A staff member has just punched out.",
  },
};

export const EMPLOYEE_SCOPE_LABELS: Record<EmployeeScope, string> = {
  none: "Admins only",
  on_duty: "Admins + employees on duty",
  all: "Admins + all employees",
};

// Events that mention a child, so the "show child's name" option applies.
export const CHILD_EVENTS: PushEventType[] = [
  "child_checkin",
  "child_checkout",
  "session_ending",
];

export type PushMessage = {
  title: string;
  body: string;
  // Where tapping the notification goes.
  url: string;
  // Same tag = replaces the previous notification instead of stacking.
  tag: string;
  // When set, the service worker folds repeats sharing the tag into one
  // "3 new check-ins" notification.
  group?: { plural: string };
  // Test notifications are always shown, even if the app is open.
  test?: boolean;
};
