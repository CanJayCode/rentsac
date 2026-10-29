import { describe, expect, it } from "vitest";
import type { Charge, Payment } from "./ledger";
import { allocationPreview, ledgerRows } from "./ledger-view";

const rent = (id: string, dueDate: string, amount = 3000): Charge => ({ id, kind: "rent", dueDate, amount });
const light = (id: string, dueDate: string, amount = 300): Charge => ({ id, kind: "light", dueDate, amount });
const pay = (id: string, paidOn: string, amount: number, target: Payment["target"] = "auto", deletedAt?: string): Payment => ({
  id,
  paidOn,
  amount,
  target,
  ...(deletedAt ? { deletedAt } : {}),
});

describe("allocationPreview", () => {
  const charges = [rent("r-oct", "2026-10-01"), light("l-oct", "2026-10-15")];

  it("splits 3200 auto over rent 3000 and light 300 as rent 3000, light 200", () => {
    expect(allocationPreview(charges, [], { amount: 3200, paidOn: "2026-10-20", target: "auto" })).toEqual({
      rent: 3000,
      light: 200,
      advance: 0,
    });
  });

  it("shows what is left over as advance", () => {
    expect(allocationPreview(charges, [], { amount: 3800, paidOn: "2026-10-20", target: "auto" })).toEqual({
      rent: 3000,
      light: 300,
      advance: 500,
    });
  });

  it("only counts what the draft adds on top of earlier payments", () => {
    const earlier = [pay("p1", "2026-10-02", 3000)];
    expect(allocationPreview(charges, earlier, { amount: 500, paidOn: "2026-10-20", target: "auto" })).toEqual({
      rent: 0,
      light: 300,
      advance: 200,
    });
  });

  it("ignores deleted payments", () => {
    const earlier = [pay("p1", "2026-10-02", 3000, "auto", "2026-10-03")];
    expect(allocationPreview(charges, earlier, { amount: 500, paidOn: "2026-10-20", target: "auto" }).rent).toBe(500);
  });

  it("a light-target payment never touches rent", () => {
    expect(allocationPreview(charges, [], { amount: 1000, paidOn: "2026-10-20", target: "light" })).toEqual({
      rent: 0,
      light: 300,
      advance: 700,
    });
  });

  it("counts an opening balance in its own bucket", () => {
    const withOpening: Charge[] = [
      { id: "o-light", kind: "opening", openingFor: "light", dueDate: "2026-09-30", amount: 1390 },
      { id: "o-rent", kind: "opening", dueDate: "2026-09-30", amount: 6000 },
      ...charges,
    ];
    expect(allocationPreview(withOpening, [], { amount: 500, paidOn: "2026-10-20", target: "light" })).toEqual({
      rent: 0,
      light: 500,
      advance: 0,
    });
    expect(allocationPreview(withOpening, [], { amount: 7000, paidOn: "2026-10-20", target: "rent" })).toEqual({
      rent: 7000,
      light: 0,
      advance: 0,
    });
  });

  it("is all zero for an empty draft", () => {
    expect(allocationPreview(charges, [], { amount: 0, paidOn: "2026-10-20", target: "auto" })).toEqual({ rent: 0, light: 0, advance: 0 });
  });

  it("charges dated after the payment still take it (rent due in advance)", () => {
    expect(allocationPreview([rent("r-nov", "2026-11-01")], [], { amount: 3000, paidOn: "2026-10-20", target: "auto" }).rent).toBe(3000);
  });
});

describe("ledgerRows", () => {
  it("after 3200 auto against rent 3000 + light 300, rent is paid and light is part paid", () => {
    const rows = ledgerRows([rent("r-oct", "2026-10-01"), light("l-oct", "2026-10-15")], [pay("p1", "2026-10-20", 3200)]);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId["r-oct"]).toMatchObject({ type: "charge", bucket: "rent", amount: 3000, paid: 3000, state: "paid" });
    expect(byId["l-oct"]).toMatchObject({ type: "charge", bucket: "light", amount: 300, paid: 200, state: "part" });
    expect(byId["p1"]).toMatchObject({ type: "payment", amount: 3200, deleted: false });
  });

  it("marks unpaid charges and keeps deleted payments listed without counting them", () => {
    const rows = ledgerRows([rent("r-oct", "2026-10-01")], [pay("p1", "2026-10-05", 3000, "auto", "2026-10-06")]);
    expect(rows.find((r) => r.id === "r-oct")).toMatchObject({ paid: 0, state: "unpaid" });
    expect(rows.find((r) => r.id === "p1")).toMatchObject({ type: "payment", deleted: true, deletedAt: "2026-10-06" });
  });

  it("an overpayment leaves every charge paid", () => {
    const rows = ledgerRows([rent("r-oct", "2026-10-01")], [pay("p1", "2026-10-05", 3500)]);
    expect(rows.find((r) => r.id === "r-oct")).toMatchObject({ state: "paid", paid: 3000 });
  });

  it("labels an opening balance with its bucket", () => {
    const rows = ledgerRows([{ id: "o", kind: "opening", openingFor: "light", dueDate: "2026-09-30", amount: 1390 }], []);
    expect(rows[0]).toMatchObject({ type: "charge", kind: "opening", bucket: "light", state: "unpaid" });
  });

  it("a zero charge counts as paid", () => {
    expect(ledgerRows([light("l0", "2026-10-15", 0)], [])[0]).toMatchObject({ state: "paid" });
  });

  it("lists newest first; on one day payments above charges; ties by id, stable", () => {
    const charges = [rent("r-sep", "2026-09-01"), rent("r-oct", "2026-10-01"), light("l-a", "2026-10-15"), light("l-b", "2026-10-15")];
    const payments = [pay("p-b", "2026-10-15", 100), pay("p-a", "2026-10-15", 100), pay("p-old", "2026-09-03", 3000)];
    const order = ledgerRows(charges, payments).map((r) => r.id);
    expect(order).toEqual(["p-b", "p-a", "l-b", "l-a", "r-oct", "p-old", "r-sep"]);
    expect(ledgerRows([...charges].reverse(), [...payments].reverse()).map((r) => r.id)).toEqual(order);
  });

  it("on one day, a live payment sits above a deleted one", () => {
    const rows = ledgerRows([], [pay("z-live", "2026-10-15", 100), pay("a-gone", "2026-10-15", 100, "auto", "2026-10-15")]);
    expect(rows.map((r) => r.id)).toEqual(["z-live", "a-gone"]);
    const rows2 = ledgerRows([], [pay("a-live", "2026-10-15", 100), pay("z-gone", "2026-10-15", 100, "auto", "2026-10-15")]);
    expect(rows2.map((r) => r.id)).toEqual(["a-live", "z-gone"]);
  });

  it("keeps the extra fields of the charge and payment it was given", () => {
    const rows = ledgerRows([{ ...light("l", "2026-10-15"), units: 30, rate: 10 }], [{ ...pay("p", "2026-10-16", 300), cash: 300 }]);
    const charge = rows.find((r) => r.type === "charge");
    const payment = rows.find((r) => r.type === "payment");
    expect(charge?.type === "charge" && charge.charge.units).toBe(30);
    expect(payment?.type === "payment" && payment.payment.cash).toBe(300);
  });

  it("is empty for nothing", () => {
    expect(ledgerRows([], [])).toEqual([]);
  });
});
