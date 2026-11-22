export type MessageTemplateEvent =
  | 'customer_contact' | 'membership_expiry' | 'membership_approved' | 'membership_declined'
  | 'special_day_approved' | 'special_day_declined' | 'party_approved' | 'party_declined'
  | 'party_quote' | 'birthday_outreach' | 'child_checkout_push';

export type MessageTemplateValues = Record<string, string | number | null | undefined>;
export type SavedMessageTemplate = { id: string; event_key: MessageTemplateEvent; name: string; body: string; is_default: boolean; updated_at: string };
export const MESSAGE_TEMPLATE_EVENTS: { key: MessageTemplateEvent; label: string }[] = [
  { key: 'customer_contact', label: 'Customer contact' }, { key: 'membership_expiry', label: 'Membership expiry outreach' },
  { key: 'membership_approved', label: 'Membership approved' }, { key: 'membership_declined', label: 'Membership declined' },
  { key: 'special_day_approved', label: 'Special day approved' }, { key: 'special_day_declined', label: 'Special day declined' },
  { key: 'party_approved', label: 'Party approved' }, { key: 'party_declined', label: 'Party declined' },
  { key: 'party_quote', label: 'Party quote' }, { key: 'birthday_outreach', label: 'Birthday outreach' },
  { key: 'child_checkout_push', label: 'Child checked out' },
];

export const MESSAGE_TEMPLATE_VARIABLES: Record<MessageTemplateEvent, { key: string; label: string }[]> = {
  customer_contact: [{ key: 'parent_name', label: 'Parent name' }, { key: 'child_name', label: 'Child name' }, { key: 'date_of_birth', label: 'Child date of birth' }, { key: 'business_name', label: 'Business name' }],
  membership_expiry: [{ key: 'parent_name', label: 'Parent name' }, { key: 'child_name', label: 'Child name' }, { key: 'expiry_date', label: 'Expiry date' }, { key: 'business_name', label: 'Business name' }],
  membership_approved: [{ key: 'parent_name', label: 'Parent name' }, { key: 'child_name', label: 'Child name' }, { key: 'plan_name', label: 'Plan name' }, { key: 'business_name', label: 'Business name' }],
  membership_declined: [{ key: 'parent_name', label: 'Parent name' }, { key: 'child_name', label: 'Child name' }, { key: 'request_type', label: 'Request type' }, { key: 'plan_name', label: 'Plan name' }, { key: 'business_name', label: 'Business name' }],
  special_day_approved: [{ key: 'parent_name', label: 'Parent name' }, { key: 'child_name', label: 'Child name' }, { key: 'plan_name', label: 'Event name' }, { key: 'event_date', label: 'Event date' }, { key: 'business_name', label: 'Business name' }],
  special_day_declined: [{ key: 'parent_name', label: 'Parent name' }, { key: 'child_name', label: 'Child name' }, { key: 'request_type', label: 'Request type' }, { key: 'plan_name', label: 'Event name' }, { key: 'event_date', label: 'Event date' }, { key: 'business_name', label: 'Business name' }],
  party_approved: [{ key: 'parent_name', label: 'Parent name' }, { key: 'child_name', label: 'Child name' }, { key: 'plan_name', label: 'Party plan' }, { key: 'party_datetime', label: 'Party date and time' }, { key: 'business_name', label: 'Business name' }],
  party_declined: [{ key: 'parent_name', label: 'Parent name' }, { key: 'child_name', label: 'Child name' }, { key: 'plan_name', label: 'Party plan' }, { key: 'party_datetime', label: 'Party date and time' }, { key: 'business_name', label: 'Business name' }],
  party_quote: [{ key: 'parent_name', label: 'Parent name' }, { key: 'child_name', label: 'Child name' }, { key: 'plan_name', label: 'Party plan' }, { key: 'party_datetime', label: 'Party date and time' }, { key: 'quote_amount', label: 'Quote amount' }, { key: 'business_name', label: 'Business name' }],
  birthday_outreach: [{ key: 'parent_name', label: 'Parent name' }, { key: 'child_name', label: 'Child name' }, { key: 'birthday_date', label: 'Birthday date' }, { key: 'business_name', label: 'Business name' }],
  child_checkout_push: [{ key: 'parent_name', label: 'Parent name' }, { key: 'child_name', label: 'Child name' }, { key: 'checkout_time', label: 'Checkout time' }, { key: 'business_name', label: 'Business name' }],
};

const DOB_TEMPLATE_EVENTS = new Set<MessageTemplateEvent>(['customer_contact', 'membership_expiry', 'membership_approved', 'membership_declined', 'special_day_approved', 'special_day_declined', 'birthday_outreach', 'child_checkout_push']);
export function messageTemplateVariablesFor(event: MessageTemplateEvent) {
  const result = [...MESSAGE_TEMPLATE_VARIABLES[event]];
  if (DOB_TEMPLATE_EVENTS.has(event) && !result.some(item => item.key === 'date_of_birth')) result.push({ key: 'date_of_birth', label: 'Child date of birth' });
  if (!result.some(item => item.key === 'birthday_date')) result.push({ key: 'birthday_date', label: 'Birthday date (from date of birth)' });
  return result;
}

export function renderMessageTemplate(body: string, values: MessageTemplateValues) {
  return body.replace(/{{\s*([a-z][a-z0-9_]*)\s*}}/gi, (_match, key: string) => values[key] == null ? '' : String(values[key])).replace(/[ \t]{2,}/g, ' ').trim();
}
export function templateTokens(body: string) { return [...new Set(Array.from(body.matchAll(/{{\s*([a-z][a-z0-9_]*)\s*}}/gi), match => match[1]))]; }
export function missingTemplateValues(body: string, values: MessageTemplateValues) { return templateTokens(body).filter(key => values[key] == null || String(values[key]).trim() === ''); }
export function unsupportedTemplateTokens(event: MessageTemplateEvent, body: string) {
  const allowed = new Set(messageTemplateVariablesFor(event).map(item => item.key));
  return templateTokens(body).filter(key => !allowed.has(key));
}
export function birthdayTextFromDob(value: MessageTemplateValues[string]) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [, , month, day] = value.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
  if (!month || !day) return undefined;
  const date = new Date(2000, Number(month) - 1, Number(day));
  return date.getMonth() === Number(month) - 1 && date.getDate() === Number(day) ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : undefined;
}
