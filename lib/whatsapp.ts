// Single source of truth for turning a stored phone number into a wa.me
// click-to-chat link. Previously duplicated inside BroadcastWhatsapp.tsx
// — now shared, since per-customer messaging (the MessageButton on each
// Directory card) replaced the standalone broadcast screen but needs
// the exact same formatting.
export function toWhatsAppDigits(phone: string): string {
  // wa.me needs digits only, country code included, no leading +/00.
  // Customer phones are stored as entered — assume India (+91) if no
  // country code looks present (10 bare digits).
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function waMeLink(phone: string, message?: string): string {
  const base = `https://wa.me/${toWhatsAppDigits(phone)}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
