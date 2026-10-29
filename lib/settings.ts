import type { Repo } from "./repo/types";

export const DEFAULT_RATE = 10;

/** Light rate in whole rupees per unit, from the "rate" setting. Anything unusable falls back to 10. */
export async function getRate(repo: Repo): Promise<number> {
  const raw = (await repo.getSetting("rate"))?.trim() ?? "";
  if (!/^\d{1,6}$/.test(raw)) return DEFAULT_RATE;
  const rate = Number(raw);
  return rate > 0 ? rate : DEFAULT_RATE;
}

export const RATE_MIN = 1;
export const RATE_MAX = 1000;

/** A rate typed in the form: plain digits, a whole number from 1 to 1000. Otherwise null. */
export function parseRate(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!/^\d{1,4}$/.test(s)) return null;
  const n = Number(s);
  return n >= RATE_MIN && n <= RATE_MAX ? n : null;
}
