import type { Repo } from "./repo/types";

export const DEFAULT_RATE = 10;

/** Light rate in whole rupees per unit, from the "rate" setting. Anything unusable falls back to 10. */
export async function getRate(repo: Repo): Promise<number> {
  const raw = (await repo.getSetting("rate"))?.trim() ?? "";
  if (!/^\d{1,6}$/.test(raw)) return DEFAULT_RATE;
  const rate = Number(raw);
  return rate > 0 ? rate : DEFAULT_RATE;
}
