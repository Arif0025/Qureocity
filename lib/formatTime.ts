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

// Returns the venue's IST calendar day for a UTC timestamp, as
// {year, month (0-indexed), date}. Always shift-then-read-as-UTC, same
// technique as formatTimeIST above — this is what makes the result
// independent of the viewing device's own timezone.
export function istDateParts(iso: string): {
  year: number;
  month: number;
  date: number;
} {
  const shifted = new Date(
    new Date(iso).getTime() + IST_OFFSET_MINUTES * 60_000,
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
  };
}

// "YYYY-MM-DD" key for a calendar day given as {year, month, date} —
// used as the shared join key between calendar grid cells and attendance
// log entries. Kept separate from any Date object so nothing ever round-
// trips through a timezone-sensitive conversion after this point.
export function dateKey(parts: {
  year: number;
  month: number;
  date: number;
}): string {
  return `${parts.year}-${String(parts.month + 1).padStart(2, "0")}-${String(parts.date).padStart(2, "0")}`;
}

export function istDateKey(iso: string): string {
  return dateKey(istDateParts(iso));
}
