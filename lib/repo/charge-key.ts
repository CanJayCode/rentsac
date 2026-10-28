import type { RepoCharge } from "./types";

/** Idempotency key within a tenant: kind plus its discriminator. Throws if the discriminator is missing. */
export function chargeDedupeKey(c: Omit<RepoCharge, "id">): string {
  if (c.kind === "opening") return `opening:opening:${c.openingFor ?? "rent"}`;
  const discriminator = c.kind === "rent" ? c.periodStart : c.roundId;
  if (!discriminator) {
    throw new Error(
      `${c.kind} charge needs ${c.kind === "rent" ? "periodStart" : "roundId"} to be idempotent`,
    );
  }
  return `${c.kind}:${discriminator}`;
}
