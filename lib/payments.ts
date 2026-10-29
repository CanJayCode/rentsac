import type { Repo, RepoPayment } from "./repo/types";
import { todayIST } from "./today";
import { isRealDate } from "./validate";

export const NOTE_MAX = 200;
/** Ten lakh rupees in one payment is far beyond any rent here: a typo, not a payment. */
export const PAYMENT_MAX = 10_000_000;

export type PaymentTarget = "auto" | "rent" | "light";
export const PAYMENT_TARGETS: readonly PaymentTarget[] = ["auto", "rent", "light"];

/** The editable fields of a payment. */
export type PaymentFields = {
  amount: number;
  paidOn: string;
  cash: number;
  upi: number;
  note?: string;
  target: PaymentTarget;
};

export type PaymentInput = PaymentFields & { tenantId: string; idemKey: string };

/** Stable codes, thrown as the Error message and mapped to field errors by the forms. */
export type PaymentProblem =
  | "amount-invalid"
  | "date-invalid"
  | "date-future"
  | "split-invalid"
  | "split-mismatch"
  | "note-long"
  | "target-invalid"
  | "tenant-unknown"
  | "idem-missing";

export type PaymentField = "amount" | "paidOn" | "split" | "note" | "target";

export class PaymentError extends Error {
  constructor(readonly code: PaymentProblem) {
    super(code);
    this.name = "PaymentError";
  }
}

/** Rupees as typed: digits, with spaces or Indian commas allowed. Anything else is NaN. */
export function parseRupees(s: string): number {
  const clean = s.replace(/[\s,]/g, "");
  return /^\d{1,9}$/.test(clean) ? Number(clean) : Number.NaN;
}

/** Like parseRupees, but a blank box counts as 0 (the cash or PhonePe box left empty in "Both" mode). */
export function parseRupeesBlankIsZero(s: string): number {
  return s.trim() === "" ? 0 : parseRupees(s);
}

/** The amount, cash and PhonePe parts for the mode chosen on the form. Blank split boxes are 0. */
export function splitFromForm(mode: string, amountText: string, cashText: string, upiText: string) {
  const amount = parseRupees(amountText);
  return {
    amount,
    cash: mode === "upi" ? 0 : mode === "both" ? parseRupeesBlankIsZero(cashText) : amount,
    upi: mode === "upi" ? amount : mode === "both" ? parseRupeesBlankIsZero(upiText) : 0,
  };
}

const whole = (n: number) => Number.isInteger(n) && n >= 0 && n <= PAYMENT_MAX;

/** Everything wrong with these fields, one problem per field; empty when they are fine. */
export function paymentProblems(f: PaymentFields, today: string): Partial<Record<PaymentField, PaymentProblem>> {
  const out: Partial<Record<PaymentField, PaymentProblem>> = {};
  if (!whole(f.amount) || f.amount === 0) out.amount = "amount-invalid";

  if (!isRealDate(f.paidOn)) out.paidOn = "date-invalid";
  else if (f.paidOn > today) out.paidOn = "date-future";

  if (!whole(f.cash) || !whole(f.upi)) out.split = "split-invalid";
  else if (!out.amount && f.cash + f.upi !== f.amount) out.split = "split-mismatch";

  if ((f.note ?? "").trim().length > NOTE_MAX) out.note = "note-long";
  if (!PAYMENT_TARGETS.includes(f.target)) out.target = "target-invalid";
  return out;
}

function checked(f: PaymentFields): PaymentFields {
  const problems = Object.values(paymentProblems(f, todayIST()));
  if (problems.length > 0) throw new PaymentError(problems[0]!);
  return { amount: f.amount, paidOn: f.paidOn, cash: f.cash, upi: f.upi, target: f.target, note: (f.note ?? "").trim() };
}

/**
 * Records a payment after validating it. The idemKey comes from the form instance, so a
 * double tap or a resubmitted form stores the payment once and returns the stored one.
 */
export async function recordPayment(repo: Repo, input: PaymentInput): Promise<RepoPayment> {
  const fields = checked(input);
  const idemKey = input.idemKey.trim();
  if (!idemKey) throw new PaymentError("idem-missing");
  if (!(await repo.getTenant(input.tenantId))) throw new PaymentError("tenant-unknown");
  const { note, ...rest } = fields;
  return repo.addPayment({ tenantId: input.tenantId, ...rest, ...(note ? { note } : {}) }, idemKey);
}

/** Replaces a payment's editable fields, validated like a new payment. An empty note clears it. */
export async function editPayment(repo: Repo, id: string, patch: PaymentFields): Promise<RepoPayment> {
  return repo.updatePayment(id, checked(patch));
}

/** Soft delete, dated today in India. The payment stays in the ledger, struck through. */
export async function removePayment(repo: Repo, id: string): Promise<void> {
  await repo.deletePayment(id, todayIST());
}
