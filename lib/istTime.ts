// Vercel's serverless functions run in UTC, not IST — so a naive
// `new Date(); setHours(0,0,0,0)` on the server gives UTC midnight,
// which is 5:30am IST, not real local midnight. This computes the
// actual UTC instant that corresponds to midnight in Asia/Kolkata,
// regardless of what timezone the process itself is running in.
export function startOfTodayIST(): Date {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const nowShiftedToISTWallClock = new Date(Date.now() + IST_OFFSET_MS);
  const istMidnightAsWallClock = Date.UTC(
    nowShiftedToISTWallClock.getUTCFullYear(),
    nowShiftedToISTWallClock.getUTCMonth(),
    nowShiftedToISTWallClock.getUTCDate(),
  );
  return new Date(istMidnightAsWallClock - IST_OFFSET_MS);
}

// The venue's current calendar date for comparing against plain `date`
// columns (event_date, expires_on, etc). The UTC instant of IST midnight
// belongs to the previous UTC date, so derive the date from the current
// instant shifted into IST instead of slicing startOfTodayIST().
//
// Plain `new Date().toISOString().slice(0, 10)` looks equivalent but
// isn't: toISOString() always reports the UTC calendar date, which is
// still "yesterday" for any IST viewer between 12:00am and 5:29am IST.
// Use this instead of that pattern anywhere "today" is compared against
// an IST business date.
export function todayISTDateString(): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
