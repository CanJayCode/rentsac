"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertSessionAction } from "@/lib/auth/require-session";
import type { Key } from "@/lib/i18n";
import {
  editPayment,
  PaymentError,
  paymentProblems,
  recordPayment,
  removePayment,
  splitFromForm,
  type PaymentField,
  type PaymentFields,
  type PaymentProblem,
  type PaymentTarget,
} from "@/lib/payments";
import { getRepo } from "@/lib/repo";
import type { Repo, Tenant } from "@/lib/repo/types";
import { todayIST } from "@/lib/today";
import type { FormState } from "../actions";

export type PaymentFormState = FormState<PaymentField>;

const PROBLEM_KEY: Record<PaymentProblem, Key> = {
  "amount-invalid": "pay.error.amount",
  "date-invalid": "form.error.date",
  "date-future": "pay.error.future",
  "split-invalid": "pay.error.splitPart",
  "split-mismatch": "pay.error.split",
  "note-long": "pay.error.note",
  "target-invalid": "form.error.failed",
  "tenant-unknown": "form.error.failed",
  "idem-missing": "form.error.failed",
};

const PROBLEM_FIELD: Partial<Record<PaymentProblem, PaymentField>> = {
  "amount-invalid": "amount",
  "date-invalid": "paidOn",
  "date-future": "paidOn",
  "split-invalid": "split",
  "split-mismatch": "split",
  "note-long": "note",
};

function field(data: FormData, name: string): string {
  const v = data.get(name);
  return typeof v === "string" ? v : "";
}

/** The tenant named by the form, only when it lives (or lived) in the room the form came from. */
async function tenantInRoom(repo: Repo, data: FormData): Promise<{ tenant: Tenant; roomNumber: number } | null> {
  const tenant = await repo.getTenant(field(data, "tenantId"));
  if (!tenant) return null;
  const room = (await repo.listRooms()).find((r) => r.id === tenant.roomId);
  if (!room || room.number !== Number(field(data, "room"))) return null;
  return { tenant, roomNumber: room.number };
}

function roomUrl(roomNumber: number, tenant: Tenant, notice: string, paymentId: string): string {
  const who = tenant.leftOn ? `tenant=${tenant.id}&` : "";
  return `/rooms/${roomNumber}?${who}${notice}=${paymentId}`;
}

/** Records a new payment, or saves an edit when the form carries a paymentId. */
export async function savePayment(_prev: PaymentFormState, data: FormData): Promise<PaymentFormState> {
  await assertSessionAction();
  const mode = field(data, "mode");
  const values = {
    amount: field(data, "amount"),
    paidOn: field(data, "paidOn").trim(),
    mode,
    cash: field(data, "cash"),
    upi: field(data, "upi"),
    note: field(data, "note"),
    target: field(data, "target"),
  };

  const split = splitFromForm(mode, values.amount, values.cash, values.upi);
  const fields: PaymentFields = {
    ...split,
    paidOn: values.paidOn,
    note: values.note,
    // Checked by paymentProblems with everything else.
    target: values.target as PaymentTarget,
  };

  const problems = paymentProblems(fields, todayIST());
  if (Object.keys(problems).length > 0) {
    const errors: Partial<Record<PaymentField, Key>> = {};
    for (const [f, code] of Object.entries(problems) as [PaymentField, PaymentProblem][]) errors[f] = PROBLEM_KEY[code];
    return { errors, values };
  }

  const repo = await getRepo();
  const found = await tenantInRoom(repo, data);
  if (!found) return { formError: "form.error.failed", values };
  const { tenant, roomNumber } = found;

  const paymentId = field(data, "paymentId");
  let saved: string;
  try {
    if (paymentId) {
      const existing = (await repo.listPayments(tenant.id)).find((p) => p.id === paymentId);
      if (!existing || existing.deletedAt) return { formError: "pay.error.gone", values };
      saved = (await editPayment(repo, paymentId, fields)).id;
    } else {
      // Without script there is no key from the form: such a submit still saves, once.
      const idemKey = field(data, "idemKey").trim() || crypto.randomUUID();
      saved = (await recordPayment(repo, { ...fields, tenantId: tenant.id, idemKey })).id;
    }
  } catch (e) {
    if (!(e instanceof PaymentError)) throw e;
    const f = PROBLEM_FIELD[e.code];
    return f ? { errors: { [f]: PROBLEM_KEY[e.code] }, values } : { formError: PROBLEM_KEY[e.code], values };
  }

  revalidatePath("/", "layout");
  redirect(roomUrl(roomNumber, tenant, paymentId ? "edited" : "paid", saved));
}

/** Soft-deletes a payment: it stays in the ledger, struck through, and stops counting. */
export async function deletePayment(_prev: PaymentFormState, data: FormData): Promise<PaymentFormState> {
  await assertSessionAction();
  const repo = await getRepo();
  const found = await tenantInRoom(repo, data);
  if (!found) return { formError: "form.error.failed" };
  const { tenant, roomNumber } = found;

  const paymentId = field(data, "paymentId");
  const existing = (await repo.listPayments(tenant.id)).find((p) => p.id === paymentId);
  if (!existing) return { formError: "form.error.failed" };
  // A second tap after the first went through: nothing more to do.
  if (!existing.deletedAt) await removePayment(repo, paymentId);

  revalidatePath("/", "layout");
  redirect(roomUrl(roomNumber, tenant, "removed", paymentId));
}
