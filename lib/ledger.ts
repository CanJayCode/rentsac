export type Charge = {
  id: string;
  kind: "rent" | "light" | "opening";
  dueDate: string;
  amount: number;
  /** Bucket an "opening" balance belongs to; defaults to "rent". */
  openingFor?: "rent" | "light";
};

export type Payment = {
  id: string;
  paidOn: string;
  amount: number;
  target: "auto" | "rent" | "light";
  /** Soft-deleted payments are ignored entirely. */
  deletedAt?: string;
};

export type Allocation = { paidByCharge: Record<string, number>; credit: number };
export type Pending = { rent: number; light: number; total: number };

function effectiveKind(charge: Charge): "rent" | "light" {
  if (charge.kind === "opening") return charge.openingFor ?? "rent";
  return charge.kind;
}

function assertAmount(what: string, id: string, amount: number): void {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`${what} ${id} has invalid amount ${amount}: must be a whole number >= 0`);
  }
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Pure allocation of payments onto charges, recomputed from scratch each call.
 * Payments run in paidOn order (ties by id); each fills eligible charges oldest
 * dueDate first (ties: opening before others, then id). Advance payment is allowed.
 * Whatever no charge can absorb is credit.
 */
export function allocate(charges: Charge[], payments: Payment[]): Allocation {
  for (const c of charges) assertAmount("Charge", c.id, c.amount);
  const live = payments.filter((p) => !p.deletedAt);
  for (const p of live) assertAmount("Payment", p.id, p.amount);

  const orderedCharges = [...charges].sort(
    (a, b) =>
      compareStrings(a.dueDate, b.dueDate) ||
      Number(b.kind === "opening") - Number(a.kind === "opening") ||
      compareStrings(a.id, b.id),
  );
  const orderedPayments = [...live].sort(
    (a, b) => compareStrings(a.paidOn, b.paidOn) || compareStrings(a.id, b.id),
  );

  const paidByCharge: Record<string, number> = {};
  for (const c of charges) paidByCharge[c.id] = 0;

  let credit = 0;
  for (const p of orderedPayments) {
    let left = p.amount;
    for (const c of orderedCharges) {
      if (left === 0) break;
      if (p.target !== "auto" && p.target !== effectiveKind(c)) continue;
      const room = c.amount - paidByCharge[c.id];
      if (room <= 0) continue;
      const applied = Math.min(room, left);
      paidByCharge[c.id] += applied;
      left -= applied;
    }
    credit += left;
  }

  return { paidByCharge, credit };
}

/** Unpaid amount per bucket, never negative. */
export function pending(charges: Charge[], paidByCharge: Record<string, number>): Pending {
  let rent = 0;
  let light = 0;
  for (const c of charges) {
    const owed = Math.max(0, c.amount - (paidByCharge[c.id] ?? 0));
    if (effectiveKind(c) === "rent") rent += owed;
    else light += owed;
  }
  return { rent, light, total: rent + light };
}
