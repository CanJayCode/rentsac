export type ReadingCheck = "ok" | "lower" | "high";

const HIGH_FACTOR = 3;
const HIGH_MIN_UNITS = 50;

/** Units used and the bill in whole rupees. Throws if curr < prev (reset the base first). */
export function lightBill(
  prev: number,
  curr: number,
  rate: number,
): { units: number; amount: number } {
  if (curr < prev) {
    throw new Error(`New reading ${curr} is lower than previous reading ${prev}`);
  }
  const units = curr - prev;
  return { units, amount: Math.round(units * rate) };
}

/** Sanity-check a new reading against the previous one and recent usage. */
export function checkReading(
  prev: number,
  curr: number,
  recentUnits: number[],
): ReadingCheck {
  if (curr < prev) return "lower";
  if (recentUnits.length === 0) return "ok";
  const units = curr - prev;
  if (units > HIGH_FACTOR * Math.max(...recentUnits) && units > HIGH_MIN_UNITS) {
    return "high";
  }
  return "ok";
}
