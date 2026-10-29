const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Today's date in India (Asia/Kolkata, UTC+05:30, no daylight saving) as YYYY-MM-DD. */
export function todayIST(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
