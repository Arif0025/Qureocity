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
