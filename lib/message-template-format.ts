export type MessageTemplateValues = Record<string, string | number | null | undefined>;

export const MESSAGE_TEMPLATE_VARIABLES: Record<string, { key: string; label: string }[]> = {
  customer_contact: [
    { key: "parent_name", label: "Parent name" },
    { key: "child_name", label: "Child name" },
    { key: "business_name", label: "Business name" },
  ],
  membership_expiry: [
    { key: "parent_name", label: "Parent name" }, { key: "child_name", label: "Child name" },
    { key: "expiry_date", label: "Expiry date" }, { key: "business_name", label: "Business name" },
  ],
  membership_approved: [
    { key: "parent_name", label: "Parent name" }, { key: "child_name", label: "Child name" },
    { key: "plan_name", label: "Plan name" }, { key: "business_name", label: "Business name" },
  ],
  membership_declined: [
    { key: "parent_name", label: "Parent name" }, { key: "child_name", label: "Child name" },
    { key: "request_type", label: "Request type" }, { key: "plan_name", label: "Plan name" },
    { key: "business_name", label: "Business name" },
  ],
  special_day_approved: [
    { key: "parent_name", label: "Parent name" }, { key: "child_name", label: "Child name" },
    { key: "plan_name", label: "Event name" }, { key: "event_date", label: "Event date" },
    { key: "business_name", label: "Business name" },
  ],
  special_day_declined: [
    { key: "parent_name", label: "Parent name" }, { key: "child_name", label: "Child name" },
    { key: "request_type", label: "Request type" }, { key: "plan_name", label: "Event name" },
    { key: "event_date", label: "Event date" }, { key: "business_name", label: "Business name" },
  ],
  party_approved: [
    { key: "parent_name", label: "Parent name" }, { key: "child_name", label: "Child name" },
    { key: "plan_name", label: "Party plan" }, { key: "party_datetime", label: "Party date and time" },
    { key: "business_name", label: "Business name" },
  ],
  party_declined: [
    { key: "parent_name", label: "Parent name" }, { key: "child_name", label: "Child name" },
    { key: "plan_name", label: "Party plan" }, { key: "party_datetime", label: "Party date and time" },
    { key: "business_name", label: "Business name" },
  ],
  party_quote: [
    { key: "parent_name", label: "Parent name" }, { key: "child_name", label: "Child name" },
    { key: "plan_name", label: "Party plan" }, { key: "party_datetime", label: "Party date and time" },
    { key: "quote_amount", label: "Quote amount" }, { key: "business_name", label: "Business name" },
  ],
  birthday_outreach: [
    { key: "parent_name", label: "Parent name" }, { key: "child_name", label: "Child name" },
    { key: "birthday_date", label: "Birthday date" }, { key: "business_name", label: "Business name" },
  ],
  child_checkout_push: [
    { key: "parent_name", label: "Parent name" }, { key: "child_name", label: "Child name" },
    { key: "checkout_time", label: "Checkout time" }, { key: "business_name", label: "Business name" },
  ],
};

export const MESSAGE_TEMPLATE_EVENTS = [
  { key: "customer_contact", label: "Customer contact" },
  { key: "membership_expiry", label: "Membership expiry outreach" },
  { key: "membership_approved", label: "Membership approved" },
  { key: "membership_declined", label: "Membership declined" },
  { key: "special_day_approved", label: "Special day approved" },
  { key: "special_day_declined", label: "Special day declined" },
  { key: "party_approved", label: "Party approved" },
  { key: "party_declined", label: "Party declined" },
  { key: "party_quote", label: "Party quote" },
  { key: "birthday_outreach", label: "Birthday outreach" },
  { key: "child_checkout_push", label: "Checkout push action" },
] as const;

export type MessageTemplateEvent = (typeof MESSAGE_TEMPLATE_EVENTS)[number]["key"];

export type SavedMessageTemplate = {
  id: string;
  event_key: MessageTemplateEvent;
  name: string;
  body: string;
  is_default: boolean;
  updated_at: string;
};

export function templateTokens(body: string): string[] {
  return [...new Set(Array.from(body.matchAll(/{{\s*([a-z][a-z0-9_]*)\s*}}/gi), (match) => match[1]))];
}

export function unsupportedTemplateTokens(eventKey: string, body: string): string[] {
  const allowed = new Set((MESSAGE_TEMPLATE_VARIABLES[eventKey] ?? []).map((item) => item.key));
  return templateTokens(body).filter((token) => !allowed.has(token));
}

export function missingTemplateValues(body: string, values: MessageTemplateValues): string[] {
  return templateTokens(body).filter((token) => values[token] == null || String(values[token]).trim() === "");
}

export function renderMessageTemplate(body: string, values: MessageTemplateValues): string {
  return body.replace(/{{\s*([a-z][a-z0-9_]*)\s*}}/gi, (_match, key: string) => {
    const value = values[key];
    return value == null ? "" : String(value);
  }).replace(/[ \t]{2,}/g, " ").trim();
}
