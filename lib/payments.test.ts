import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allocate, pending } from "./ledger";
import { editPayment, paymentProblems, recordPayment, removePayment, splitFromForm, type PaymentInput } from "./payments";
import { createMemoryRepo } from "./repo/memory";
import type { Repo, Tenant } from "./repo/types";
import { rentTermsEditable } from "./rent";

let repo: Repo;
let tenant: Tenant;

// 29 Oct 2026, 20:00 UTC is already 30 Oct in India.
const NOW_UTC = new Date("2026-10-29T20:00:00Z");

async function pendingNow() {
  const charges = await repo.listCharges(tenant.id);
  const live = (await repo.listPayments(tenant.id)).filter((p) => !p.deletedAt);
  const { paidByCharge, credit } = allocate(charges, live);
  return { ...pending(charges, paidByCharge), credit };
}

const input = (over: Partial<PaymentInput> = {}): PaymentInput => ({
  tenantId: tenant.id,
  amount: 3200,
  paidOn: "2026-10-05",
  cash: 3200,
  upi: 0,
  target: "auto",
  idemKey: crypto.randomUUID(),
  ...over,
});

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_UTC);
  repo = createMemoryRepo();
  const room = (await repo.listRooms())[0];
  tenant = await repo.saveTenant({ roomId: room.id, name: "Asha", rentAmount: 3000, cycleStartDay: 1, startedOn: "2026-10-01" });
  await repo.addCharge({ tenantId: tenant.id, kind: "rent", periodStart: "2026-10-01", dueDate: "2026-10-01", amount: 3000 });
  await repo.addCharge({ tenantId: tenant.id, kind: "light", roundId: "r1", dueDate: "2026-10-15", amount: 300 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("recordPayment", () => {
  it("stores the payment with its split, note and target", async () => {
    const p = await recordPayment(repo, input({ cash: 1200, upi: 2000, note: "  October  ", target: "rent" }));
    expect(p).toMatchObject({ tenantId: tenant.id, amount: 3200, cash: 1200, upi: 2000, note: "October", target: "rent" });
    expect(await repo.listPayments(tenant.id)).toHaveLength(1);
  });

  it("rejects a split that does not add up to the amount", async () => {
    await expect(recordPayment(repo, input({ cash: 3000, upi: 100 }))).rejects.toThrow("split-mismatch");
    await expect(recordPayment(repo, input({ cash: 1600, upi: 1700 }))).rejects.toThrow("split-mismatch");
    expect(await repo.listPayments(tenant.id)).toHaveLength(0);
  });

  it("rejects a negative part of the split even when the sum matches", async () => {
    await expect(recordPayment(repo, input({ cash: 3300, upi: -100 }))).rejects.toThrow("split-invalid");
  });

  it("rejects zero, negative and fractional amounts", async () => {
    for (const amount of [0, -500, 99.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(recordPayment(repo, input({ amount, cash: amount, upi: 0 }))).rejects.toThrow("amount-invalid");
    }
    expect(await repo.listPayments(tenant.id)).toHaveLength(0);
  });

  it("rejects a date after today in India, and dates that do not exist", async () => {
    await expect(recordPayment(repo, input({ paidOn: "2026-10-31" }))).rejects.toThrow("date-future");
    await expect(recordPayment(repo, input({ paidOn: "2026-02-30" }))).rejects.toThrow("date-invalid");
    await expect(recordPayment(repo, input({ paidOn: "30/10/2026" }))).rejects.toThrow("date-invalid");
  });

  it("accepts today in India even when it is still yesterday in UTC", async () => {
    const p = await recordPayment(repo, input({ paidOn: "2026-10-30" }));
    expect(p.paidOn).toBe("2026-10-30");
  });

  it("rejects a note over 200 characters and an unknown target or tenant", async () => {
    await expect(recordPayment(repo, input({ note: "x".repeat(201) }))).rejects.toThrow("note-long");
    expect(await recordPayment(repo, input({ note: "x".repeat(200) }))).toBeTruthy();
    await expect(recordPayment(repo, input({ target: "water" as never }))).rejects.toThrow("target-invalid");
    await expect(recordPayment(repo, input({ tenantId: crypto.randomUUID() }))).rejects.toThrow("tenant-unknown");
  });

  it("stores one payment when the same form is submitted twice (same idemKey)", async () => {
    const idemKey = crypto.randomUUID();
    const [a, b] = await Promise.all([recordPayment(repo, input({ idemKey })), recordPayment(repo, input({ idemKey }))]);
    const c = await recordPayment(repo, input({ idemKey }));
    expect(b.id).toBe(a.id);
    expect(c.id).toBe(a.id);
    expect(await repo.listPayments(tenant.id)).toHaveLength(1);
    expect((await pendingNow()).total).toBe(100);
  });

  it("locks the tenant's rent terms once a payment is recorded, and a delete unlocks them", async () => {
    expect(await rentTermsEditable(repo, tenant.id)).toBe(true);
    const p = await recordPayment(repo, input());
    expect(await rentTermsEditable(repo, tenant.id)).toBe(false);
    await removePayment(repo, p.id);
    expect(await rentTermsEditable(repo, tenant.id)).toBe(true);
  });

  it("needs an idemKey", async () => {
    await expect(recordPayment(repo, input({ idemKey: "  " }))).rejects.toThrow("idem-missing");
  });
});

describe("paymentProblems", () => {
  it("names every bad field at once, by field", () => {
    expect(
      paymentProblems({ amount: 0, paidOn: "2027-01-01", cash: 0, upi: 0, note: "y".repeat(201), target: "auto" }, "2026-10-30"),
    ).toEqual({ amount: "amount-invalid", paidOn: "date-future", note: "note-long" });
    expect(paymentProblems({ amount: 500, paidOn: "2026-10-30", cash: 200, upi: 200, target: "auto" }, "2026-10-30")).toEqual({
      split: "split-mismatch",
    });
    expect(paymentProblems({ amount: 500, paidOn: "2026-10-30", cash: 200, upi: 300, target: "light" }, "2026-10-30")).toEqual({});
  });
});

describe("editPayment and removePayment", () => {
  it("editing the amount changes what is pending", async () => {
    const p = await recordPayment(repo, input({ amount: 1000, cash: 1000 }));
    expect((await pendingNow()).total).toBe(2300);
    const edited = await editPayment(repo, p.id, { amount: 3300, paidOn: "2026-10-06", cash: 300, upi: 3000, target: "auto" });
    expect(edited).toMatchObject({ id: p.id, amount: 3300, cash: 300, upi: 3000, paidOn: "2026-10-06", idemKey: p.idemKey });
    expect(await pendingNow()).toEqual({ rent: 0, light: 0, total: 0, credit: 0 });
  });

  it("editing validates like recording and changes nothing on a bad edit", async () => {
    const p = await recordPayment(repo, input({ amount: 1000, cash: 1000 }));
    await expect(editPayment(repo, p.id, { amount: 1000, paidOn: "2026-10-05", cash: 900, upi: 0, target: "auto" })).rejects.toThrow(
      "split-mismatch",
    );
    await expect(editPayment(repo, p.id, { amount: 1000, paidOn: "2026-11-30", cash: 1000, upi: 0, target: "auto" })).rejects.toThrow(
      "date-future",
    );
    expect((await repo.listPayments(tenant.id))[0]).toMatchObject({ amount: 1000, paidOn: "2026-10-05" });
  });

  it("editing can clear the note", async () => {
    const p = await recordPayment(repo, input({ note: "old" }));
    const edited = await editPayment(repo, p.id, { amount: 3200, paidOn: "2026-10-05", cash: 3200, upi: 0, target: "auto", note: "" });
    expect(edited.note).toBeUndefined();
  });

  it("editing an unknown payment throws", async () => {
    await expect(
      editPayment(repo, crypto.randomUUID(), { amount: 100, paidOn: "2026-10-05", cash: 100, upi: 0, target: "auto" }),
    ).rejects.toThrow();
  });

  it("removing soft-deletes with today's date in India: still listed, no longer counted", async () => {
    const p = await recordPayment(repo, input());
    expect((await pendingNow()).total).toBe(100);
    await removePayment(repo, p.id);
    const list = await repo.listPayments(tenant.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: p.id, deletedAt: "2026-10-30" });
    expect((await pendingNow()).total).toBe(3300);
  });
});

describe("splitFromForm", () => {
  it("in Both mode a blank cash or PhonePe box counts as 0", () => {
    expect(splitFromForm("both", "500", "", "500")).toEqual({ amount: 500, cash: 0, upi: 500 });
    expect(splitFromForm("both", "500", "500", "  ")).toEqual({ amount: 500, cash: 500, upi: 0 });
    expect(paymentProblems({ ...splitFromForm("both", "500", "", "500"), paidOn: "2026-10-30", target: "auto" }, "2026-10-30")).toEqual({});
  });
  it("still rejects junk in a split box, and a blank amount", () => {
    expect(splitFromForm("both", "500", "abc", "500").cash).toBeNaN();
    expect(splitFromForm("both", "", "", "").amount).toBeNaN();
  });
  it("cash and PhonePe modes ignore the split boxes", () => {
    expect(splitFromForm("cash", "300", "1", "2")).toEqual({ amount: 300, cash: 300, upi: 0 });
    expect(splitFromForm("upi", "300", "1", "2")).toEqual({ amount: 300, cash: 0, upi: 300 });
  });
});
