// Deterministic "HH:MM AM/PM" formatter for venue-local (IST) time.
//
// Deliberately NOT using toLocaleTimeString(): its output depends on the
// runtime's ICU data, which can render AM/PM with different casing on
// the Node.js server vs. the browser — since these times render
// immediately with real server-fetched data (not behind a click), that
// mismatch trips a React hydration error. Plain arithmetic is
// guaranteed to produce byte-identical output on both sides, and as a
// bonus doesn't depend on the viewing device's own timezone setting
// (staff phones aren't always configured for IST).
const IST_OFFSET_MINUTES = 330;

export function formatTimeIST(iso: string): string {
  const shifted = new Date(
    new Date(iso).getTime() + IST_OFFSET_MINUTES * 60_000,
  );
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${String(displayHour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`;
}
