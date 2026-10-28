import { describe, expect, it } from "vitest";
import { allocate, pending, type Charge, type Payment } from "./ledger";

const rent = (id: string, dueDate: string, amount: number): Charge => ({
  id,
  kind: "rent",
  dueDate,
  amount,
});
const light = (id: string, dueDate: string, amount: number): Charge => ({
  id,
  kind: "light",
  dueDate,
  amount,
});
const pay = (
  id: string,
  paidOn: string,
  amount: number,
  target: Payment["target"] = "auto",
): Payment => ({ id, paidOn, amount, target });

describe("allocate", () => {
  it("pays rent first then part of light with a 3200 auto payment", () => {
    const charges = [rent("r1", "2026-10-01", 3000), light("l1", "2026-10-10", 300)];
    const { paidByCharge, credit } = allocate(charges, [pay("p1", "2026-10-12", 3200)]);
    expect(paidByCharge).toEqual({ r1: 3000, l1: 200 });
    expect(credit).toBe(0);
    expect(pending(charges, paidByCharge)).toEqual({ rent: 0, light: 100, total: 100 });
  });

  it("applies charges oldest dueDate first regardless of input order", () => {
    const charges = [rent("r2", "2026-11-01", 3000), rent("r1", "2026-10-01", 3000)];
    const { paidByCharge } = allocate(charges, [pay("p1", "2026-11-05", 4000)]);
    expect(paidByCharge).toEqual({ r1: 3000, r2: 1000 });
  });

  it("processes payments in paidOn order, ties by id", () => {
    const charges = [rent("r1", "2026-10-01", 3000), light("l1", "2026-10-02", 500)];
    // Targeted rent payment dated later than the auto one: auto goes first and takes rent.
    const payments = [
      pay("p2", "2026-10-20", 3000, "rent"),
      pay("p1", "2026-10-05", 3000, "auto"),
    ];
    const { paidByCharge, credit } = allocate(charges, payments);
    // p1 auto: rent 3000 (oldest). p2 rent-target: no rent left -> all credit.
    expect(paidByCharge).toEqual({ r1: 3000, l1: 0 });
    expect(credit).toBe(3000);

    // Same date: id breaks the tie (a before b).
    const tied = allocate(charges, [
      pay("b", "2026-10-05", 3000, "rent"),
      pay("a", "2026-10-05", 3000, "auto"),
    ]);
    expect(tied.paidByCharge).toEqual({ r1: 3000, l1: 0 });
    expect(tied.credit).toBe(3000);
  });

  it("breaks dueDate ties with opening before others, then id", () => {
    const charges: Charge[] = [
      rent("b", "2026-10-01", 100),
      { id: "z-open", kind: "opening", dueDate: "2026-10-01", amount: 100 },
      rent("a", "2026-10-01", 100),
    ];
    const { paidByCharge } = allocate(charges, [pay("p1", "2026-10-02", 150)]);
    expect(paidByCharge).toEqual({ "z-open": 100, a: 50, b: 0 });
  });

  it("never lets a light-target payment touch rent", () => {
    const charges = [rent("r1", "2026-10-01", 3000), light("l1", "2026-10-10", 300)];
    const { paidByCharge, credit } = allocate(charges, [pay("p1", "2026-10-12", 500, "light")]);
    expect(paidByCharge).toEqual({ r1: 0, l1: 300 });
    expect(credit).toBe(200);
  });

  it("never lets a rent-target payment touch light", () => {
    const charges = [light("l1", "2026-10-01", 300), rent("r1", "2026-10-10", 3000)];
    const { paidByCharge, credit } = allocate(charges, [pay("p1", "2026-10-12", 500, "rent")]);
    expect(paidByCharge).toEqual({ l1: 0, r1: 500 });
    expect(credit).toBe(0);
  });

  it("sends a targeted payment with no eligible charge entirely to credit", () => {
    const charges = [rent("r1", "2026-10-01", 3000)];
    const { paidByCharge, credit } = allocate(charges, [pay("p1", "2026-10-02", 700, "light")]);
    expect(paidByCharge).toEqual({ r1: 0 });
    expect(credit).toBe(700);
  });

  it("leaves credit for a 5000 payment on 3000 owed, then a new 3000 charge absorbs 2000", () => {
    const payments = [pay("p1", "2026-10-05", 5000)];
    const first = allocate([rent("r1", "2026-10-01", 3000)], payments);
    expect(first.paidByCharge).toEqual({ r1: 3000 });
    expect(first.credit).toBe(2000);

    const charges = [rent("r1", "2026-10-01", 3000), rent("r2", "2026-11-01", 3000)];
    const second = allocate(charges, payments);
    expect(second.paidByCharge).toEqual({ r1: 3000, r2: 2000 });
    expect(second.credit).toBe(0);
    expect(pending(charges, second.paidByCharge)).toEqual({ rent: 1000, light: 0, total: 1000 });
  });

  it("applies advance payments to charges due after the payment date", () => {
    const { paidByCharge, credit } = allocate(
      [rent("r1", "2026-12-01", 3000)],
      [pay("p1", "2026-10-01", 1000)],
    );
    expect(paidByCharge).toEqual({ r1: 1000 });
    expect(credit).toBe(0);
  });

  it("sums credit across payments", () => {
    const { credit } = allocate([], [pay("p1", "2026-10-01", 100), pay("p2", "2026-10-02", 250)]);
    expect(credit).toBe(350);
  });

  it("handles a payment exactly equal to what is owed", () => {
    const charges = [rent("r1", "2026-10-01", 3000), light("l1", "2026-10-02", 300)];
    const { paidByCharge, credit } = allocate(charges, [pay("p1", "2026-10-05", 3300)]);
    expect(paidByCharge).toEqual({ r1: 3000, l1: 300 });
    expect(credit).toBe(0);
  });

  it("handles no charges and no payments", () => {
    expect(allocate([], [])).toEqual({ paidByCharge: {}, credit: 0 });
    const { paidByCharge, credit } = allocate([rent("r1", "2026-10-01", 3000)], []);
    expect(paidByCharge).toEqual({ r1: 0 });
    expect(credit).toBe(0);
  });

  it("changes the result when a payment is deleted from the array", () => {
    const charges = [rent("r1", "2026-10-01", 3000)];
    const p1 = pay("p1", "2026-10-02", 2000);
    const p2 = pay("p2", "2026-10-03", 1000);
    expect(allocate(charges, [p1, p2]).paidByCharge).toEqual({ r1: 3000 });
    expect(allocate(charges, [p1]).paidByCharge).toEqual({ r1: 2000 });
  });

  it("ignores soft-deleted payments entirely", () => {
    const charges = [rent("r1", "2026-10-01", 3000)];
    const gone: Payment = { ...pay("p2", "2026-10-03", 5000), deletedAt: "2026-10-04" };
    const { paidByCharge, credit } = allocate(charges, [pay("p1", "2026-10-02", 1000), gone]);
    expect(paidByCharge).toEqual({ r1: 1000 });
    expect(credit).toBe(0);
  });

  it("does not mutate its inputs", () => {
    const charges = [rent("r2", "2026-11-01", 100), rent("r1", "2026-10-01", 100)];
    const payments = [pay("p2", "2026-10-09", 50), pay("p1", "2026-10-01", 50)];
    const cSnap = JSON.parse(JSON.stringify(charges));
    const pSnap = JSON.parse(JSON.stringify(payments));
    allocate(charges, payments);
    expect(charges).toEqual(cSnap);
    expect(payments).toEqual(pSnap);
  });

  it("throws on negative or non-integer amounts", () => {
    expect(() => allocate([rent("r1", "2026-10-01", -1)], [])).toThrow();
    expect(() => allocate([rent("r1", "2026-10-01", 10.5)], [])).toThrow();
    expect(() => allocate([], [pay("p1", "2026-10-01", -5)])).toThrow();
    expect(() => allocate([], [pay("p1", "2026-10-01", 2.5)])).toThrow();
  });

  it("counts opening balances by effective kind and lets targets match them", () => {
    const charges: Charge[] = [
      { id: "o1", kind: "opening", dueDate: "2026-09-01", amount: 6000, openingFor: "rent" },
      { id: "o2", kind: "opening", dueDate: "2026-09-01", amount: 1390, openingFor: "light" },
    ];
    expect(pending(charges, {})).toEqual({ rent: 6000, light: 1390, total: 7390 });

    const { paidByCharge, credit } = allocate(charges, [pay("p1", "2026-10-01", 1500, "light")]);
    expect(paidByCharge).toEqual({ o1: 0, o2: 1390 });
    expect(credit).toBe(110);
  });

  it("treats an opening charge without openingFor as rent", () => {
    const charges: Charge[] = [{ id: "o1", kind: "opening", dueDate: "2026-09-01", amount: 500 }];
    expect(pending(charges, {})).toEqual({ rent: 500, light: 0, total: 500 });
    expect(allocate(charges, [pay("p1", "2026-10-01", 500, "light")]).credit).toBe(500);
    expect(allocate(charges, [pay("p1", "2026-10-01", 500, "rent")]).paidByCharge).toEqual({
      o1: 500,
    });
  });
});

describe("pending", () => {
  it("sums unpaid amounts per bucket and never goes negative", () => {
    const charges = [rent("r1", "2026-10-01", 3000), light("l1", "2026-10-02", 300)];
    expect(pending(charges, { r1: 1000, l1: 300 })).toEqual({ rent: 2000, light: 0, total: 2000 });
    expect(pending(charges, { r1: 9999 })).toEqual({ rent: 0, light: 300, total: 300 });
    expect(pending([], {})).toEqual({ rent: 0, light: 0, total: 0 });
  });
});
