import { allocate, type Charge, type Payment } from "./ledger";

export type ChargeState = "paid" | "part" | "unpaid";

export type ChargeRow<C extends Charge = Charge> = {
  type: "charge";
  id: string;
  date: string;
  kind: Charge["kind"];
  /** Where the charge counts: an opening balance counts as rent or light. */
  bucket: "rent" | "light";
  amount: number;
  /** How much of it the (live) payments cover. */
  paid: number;
  state: ChargeState;
  charge: C;
};

export type PaymentRow<P extends Payment = Payment> = {
  type: "payment";
  id: string;
  date: string;
  amount: number;
  deleted: boolean;
  deletedAt?: string;
  payment: P;
};

export type LedgerRow<C extends Charge = Charge, P extends Payment = Payment> = ChargeRow<C> | PaymentRow<P>;

export type Draft = { amount: number; paidOn: string; target: Payment["target"] };
export type Preview = { rent: number; light: number; advance: number };

const bucketOf = (c: Charge): "rent" | "light" => (c.kind === "opening" ? (c.openingFor ?? "rent") : c.kind);
const live = <P extends Payment>(payments: P[]) => payments.filter((p) => !p.deletedAt);
const desc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

/**
 * Charges and payments in one list, newest first. Pass every charge (future-dated too) and every
 * payment: deleted ones are listed but count for nothing. On one date, payments sit above charges
 * (the charge was due, then paid) and live payments above deleted ones; further ties go by id, so
 * the order never shifts between loads.
 */
export function ledgerRows<C extends Charge, P extends Payment>(charges: C[], payments: P[]): LedgerRow<C, P>[] {
  const { paidByCharge } = allocate(charges, live(payments));

  const rows: LedgerRow<C, P>[] = [
    ...charges.map((c): ChargeRow<C> => {
      const paid = paidByCharge[c.id] ?? 0;
      return {
        type: "charge",
        id: c.id,
        date: c.dueDate,
        kind: c.kind,
        bucket: bucketOf(c),
        amount: c.amount,
        paid,
        state: paid >= c.amount ? "paid" : paid > 0 ? "part" : "unpaid",
        charge: c,
      };
    }),
    ...payments.map(
      (p): PaymentRow<P> => ({
        type: "payment",
        id: p.id,
        date: p.paidOn,
        amount: p.amount,
        deleted: Boolean(p.deletedAt),
        ...(p.deletedAt ? { deletedAt: p.deletedAt } : {}),
        payment: p,
      }),
    ),
  ];

  const deleted = (r: LedgerRow<C, P>) => Number(r.type === "payment" && r.deleted);
  return rows.sort(
    (a, b) =>
      desc(a.date, b.date) ||
      Number(b.type === "payment") - Number(a.type === "payment") ||
      deleted(a) - deleted(b) ||
      desc(a.id, b.id),
  );
}

/** Sorts after any real id on the same date, so the draft is the latest payment of its day. */
const DRAFT_ID = "~draft";

/**
 * How a payment not yet saved would land: what it adds to rent and to light, and what is left as
 * advance. Worked out as the difference between allocating with and without it.
 */
export function allocationPreview(charges: Charge[], payments: Payment[], draft: Draft): Preview {
  const others = live(payments).filter((p) => p.id !== DRAFT_ID);
  if (!Number.isInteger(draft.amount) || draft.amount <= 0) return { rent: 0, light: 0, advance: 0 };

  const before = allocate(charges, others);
  const after = allocate(charges, [...others, { id: DRAFT_ID, paidOn: draft.paidOn, amount: draft.amount, target: draft.target }]);

  const out: Preview = { rent: 0, light: 0, advance: after.credit - before.credit };
  for (const c of charges) out[bucketOf(c)] += after.paidByCharge[c.id] - before.paidByCharge[c.id];
  return out;
}
