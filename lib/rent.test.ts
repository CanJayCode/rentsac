import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "./repo/memory";
import type { Repo, Room, Tenant } from "./repo/types";
import { closeTenancy, ensureRentCharges, homeSummary, regenerateRentCharges, rentPreview, rentTermsEditable, tenantAccount, tenantBalance } from "./rent";

let repo: Repo;
let rooms: Room[];

const room = (n: number) => rooms.find((r) => r.number === n)!;

async function addTenant(n: number, over: Partial<Omit<Tenant, "id" | "roomId">> = {}): Promise<Tenant> {
  return repo.saveTenant({
    roomId: room(n).id,
    name: `Tenant ${n}`,
    rentAmount: 3000,
    cycleStartDay: 1,
    startedOn: "2026-08-01",
    ...over,
  });
}

async function pay(tenant: Tenant, amount: number, paidOn = "2026-10-05", target: "auto" | "rent" | "light" = "auto") {
  return repo.addPayment(
    { tenantId: tenant.id, paidOn, amount, target, cash: amount, upi: 0 },
    crypto.randomUUID(),
  );
}

beforeEach(async () => {
  repo = createMemoryRepo();
  rooms = await repo.listRooms();
});

describe("ensureRentCharges", () => {
  it("creates one charge per period up to today, each only once when run twice", async () => {
    const t = await addTenant(3);
    await ensureRentCharges(repo, t, "2026-10-28");
    await ensureRentCharges(repo, t, "2026-10-28");
    const charges = await repo.listCharges(t.id);
    expect(charges.map((c) => c.periodStart).sort()).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
    for (const c of charges) {
      expect(c).toMatchObject({ kind: "rent", amount: 3000, dueDate: c.periodStart });
    }
  });

  it("charges the full first period that contains the move-in date", async () => {
    const t = await addTenant(4, { cycleStartDay: 26, startedOn: "2026-10-10" });
    await ensureRentCharges(repo, t, "2026-10-25");
    const charges = await repo.listCharges(t.id);
    expect(charges.map((c) => [c.periodStart, c.amount])).toEqual([["2026-09-26", 3000]]);
  });

  it("charges a cycle-12 tenant on the 12th, not before", async () => {
    const t = await addTenant(5, { cycleStartDay: 12, startedOn: "2026-09-12" });
    await ensureRentCharges(repo, t, "2026-10-11");
    expect((await repo.listCharges(t.id)).map((c) => c.periodStart)).toEqual(["2026-09-12"]);
    await ensureRentCharges(repo, t, "2026-10-12");
    expect((await repo.listCharges(t.id)).map((c) => c.periodStart).sort()).toEqual(["2026-09-12", "2026-10-12"]);
  });

  it("creates nothing for a tenant who has not moved in yet", async () => {
    const t = await addTenant(6, { startedOn: "2026-11-05" });
    await ensureRentCharges(repo, t, "2026-10-28");
    expect(await repo.listCharges(t.id)).toEqual([]);
  });

  it("creates nothing before the move-in day even when the period has already started", async () => {
    const t = await addTenant(6, { cycleStartDay: 26, startedOn: "2026-10-30" });
    await ensureRentCharges(repo, t, "2026-10-28");
    expect(await repo.listCharges(t.id)).toEqual([]);
  });

  it("starts after the opening balance date when the tenant was imported", async () => {
    const t = await addTenant(7, { startedOn: "2025-01-01" });
    await repo.addCharge({ tenantId: t.id, kind: "opening", openingFor: "rent", dueDate: "2026-10-15", amount: 9000 });
    await ensureRentCharges(repo, t, "2026-12-03");
    const rent = (await repo.listCharges(t.id)).filter((c) => c.kind === "rent");
    expect(rent.map((c) => c.periodStart).sort()).toEqual(["2026-11-01", "2026-12-01"]);
  });

  it("stops at the day the tenant left", async () => {
    const t = await addTenant(8, { startedOn: "2026-08-01", leftOn: "2026-09-20" });
    await ensureRentCharges(repo, t, "2026-10-28");
    expect((await repo.listCharges(t.id)).map((c) => c.periodStart).sort()).toEqual(["2026-08-01", "2026-09-01"]);
  });

  it("uses the tenant's current rent for new periods and leaves old charges alone", async () => {
    const t = await addTenant(9, { startedOn: "2026-09-01" });
    await ensureRentCharges(repo, t, "2026-09-15");
    const raised = await repo.saveTenant({ ...t, rentAmount: 3500 });
    await ensureRentCharges(repo, raised, "2026-10-15");
    const byPeriod = Object.fromEntries((await repo.listCharges(t.id)).map((c) => [c.periodStart, c.amount]));
    expect(byPeriod).toEqual({ "2026-09-01": 3000, "2026-10-01": 3500 });
  });
});

describe("homeSummary", () => {
  it("lists active tenants by room number with pending rent and a total", async () => {
    const a = await addTenant(12, { name: "Akshay", startedOn: "2026-10-01" });
    await addTenant(3, { name: "Vaibhav", startedOn: "2026-09-01" });
    await pay(a, 3000);
    const s = await homeSummary(repo, "2026-10-28");
    expect(s.rows.map((r) => [r.roomNumber, r.tenantName, r.pendingRent, r.status])).toEqual([
      [3, "Vaibhav", 6000, "due"],
      [12, "Akshay", 0, "paid"],
    ]);
    expect(s.totalPending).toBe(6000);
    expect(s.left).toEqual([]);
  });

  it("counts an opening balance in its own bucket", async () => {
    const t = await addTenant(5, { startedOn: "2025-01-01" });
    await repo.addCharge({ tenantId: t.id, kind: "opening", openingFor: "rent", dueDate: "2026-10-20", amount: 6000 });
    await repo.addCharge({ tenantId: t.id, kind: "opening", openingFor: "light", dueDate: "2026-10-20", amount: 1390 });
    const s = await homeSummary(repo, "2026-10-28");
    expect(s.rows[0]).toMatchObject({ pendingRent: 6000, pendingLight: 1390, pendingTotal: 7390, status: "due" });
    expect(s.totalPending).toBe(7390);
  });

  it("shows an overpayment as credit, never as negative pending", async () => {
    const t = await addTenant(4, { startedOn: "2026-10-01" });
    await pay(t, 3500);
    const s = await homeSummary(repo, "2026-10-28");
    expect(s.rows[0]).toMatchObject({ pendingRent: 0, pendingTotal: 0, credit: 500, status: "paid" });
    expect(s.totalPending).toBe(0);
  });

  it("ignores soft-deleted payments", async () => {
    const t = await addTenant(4, { startedOn: "2026-10-01" });
    const p = await pay(t, 3000);
    await repo.deletePayment(p.id);
    expect((await homeSummary(repo, "2026-10-28")).rows[0].pendingRent).toBe(3000);
  });

  it("does not count a future payment-free period, but counts charges already made", async () => {
    await addTenant(6, { startedOn: "2026-11-05" });
    const s = await homeSummary(repo, "2026-10-28");
    expect(s.rows[0]).toMatchObject({ pendingTotal: 0, status: "paid" });
  });

  it("puts a vacated tenant who still owes under left and counts it in the total", async () => {
    const gone = await addTenant(13, { name: "Gaikwad", startedOn: "2026-08-01" });
    await ensureRentCharges(repo, gone, "2026-09-10");
    await repo.vacateTenant(gone.id, "2026-09-10");
    await addTenant(14, { name: "Praveen", startedOn: "2026-10-01" });
    const s = await homeSummary(repo, "2026-10-28");
    expect(s.rows.map((r) => r.tenantName)).toEqual(["Praveen"]);
    expect(s.left.map((r) => [r.roomNumber, r.tenantName, r.pendingRent])).toEqual([[13, "Gaikwad", 6000]]);
    expect(s.totalPending).toBe(9000);
  });

  it("leaves out a vacated tenant who has paid everything", async () => {
    const gone = await addTenant(13, { startedOn: "2026-09-01" });
    await ensureRentCharges(repo, gone, "2026-09-10");
    await pay(gone, 3000, "2026-09-05");
    await repo.vacateTenant(gone.id, "2026-09-10");
    const s = await homeSummary(repo, "2026-10-28");
    expect(s.left).toEqual([]);
    expect(s.totalPending).toBe(0);
  });
});

describe("ensureRentCharges with day 31", () => {
  it("clamps the cycle start to the month's last day", async () => {
    const t = await addTenant(11, { cycleStartDay: 31, startedOn: "2026-01-31" });
    await ensureRentCharges(repo, t, "2026-04-05");
    expect((await repo.listCharges(t.id)).map((c) => c.periodStart).sort()).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });
});

describe("regenerateRentCharges", () => {
  it("replaces charges after a cycle and move-in correction and keeps the opening balance", async () => {
    const t = await addTenant(3, { cycleStartDay: 1, startedOn: "2026-06-01" });
    await repo.addCharge({ tenantId: t.id, kind: "opening", openingFor: "light", dueDate: "2026-05-20", amount: 400 });
    await ensureRentCharges(repo, t, "2026-10-28");
    const fixed = await repo.saveTenant({ ...t, cycleStartDay: 26, startedOn: "2026-09-26" });
    await regenerateRentCharges(repo, fixed, "2026-10-28");
    const charges = await repo.listCharges(t.id);
    expect(charges.filter((c) => c.kind === "rent").map((c) => c.periodStart).sort()).toEqual(["2026-09-26", "2026-10-26"]);
    expect(charges.filter((c) => c.kind === "opening")).toHaveLength(1);
  });

  it("refuses once a payment exists, and rentTermsEditable says so", async () => {
    const t = await addTenant(3, { startedOn: "2026-09-01" });
    await ensureRentCharges(repo, t, "2026-10-28");
    expect(await rentTermsEditable(repo, t.id)).toBe(true);
    const p = await pay(t, 1000);
    expect(await rentTermsEditable(repo, t.id)).toBe(false);
    await expect(regenerateRentCharges(repo, { ...t, cycleStartDay: 12 }, "2026-10-28")).rejects.toThrow();
    expect((await repo.listCharges(t.id)).map((c) => c.periodStart).sort()).toEqual(["2026-09-01", "2026-10-01"]);
    await repo.deletePayment(p.id);
    expect(await rentTermsEditable(repo, t.id)).toBe(true);
  });
});

describe("closeTenancy", () => {
  it("removes unpaid periods after the leave date and keeps a paid one", async () => {
    const t = await addTenant(13, { startedOn: "2026-08-01" });
    await ensureRentCharges(repo, t, "2026-11-03");
    // Aug, Sep, Oct, Nov exist. 4000 pays Aug and 1000 of Sep.
    await pay(t, 4000, "2026-08-02");
    await closeTenancy(repo, t, "2026-09-30", "2026-11-03");
    const rent = (await repo.listCharges(t.id)).map((c) => c.periodStart).sort();
    expect(rent).toEqual(["2026-08-01", "2026-09-01"]);
    expect((await repo.getTenant(t.id))?.leftOn).toBe("2026-09-30");
    expect(await tenantBalance(repo, (await repo.getTenant(t.id))!, "2026-11-03")).toEqual({
      rent: 2000, light: 0, total: 2000, credit: 0,
    });
  });

  it("keeps a later period that has money against it", async () => {
    const t = await addTenant(13, { startedOn: "2026-09-01" });
    await ensureRentCharges(repo, t, "2026-11-03");
    await pay(t, 7000, "2026-09-02");
    await closeTenancy(repo, t, "2026-10-31", "2026-11-03");
    expect((await repo.listCharges(t.id)).map((c) => c.periodStart).sort()).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
  });

  it("rejects a leave date before move-in or after today", async () => {
    const t = await addTenant(13, { startedOn: "2026-09-01" });
    await expect(closeTenancy(repo, t, "2026-08-31", "2026-10-28")).rejects.toThrow();
    await expect(closeTenancy(repo, t, "2026-10-29", "2026-10-28")).rejects.toThrow();
    expect((await repo.getTenant(t.id))?.leftOn).toBeFalsy();
  });
});

describe("tenantBalance", () => {
  it("brings rent up to date and reports pending and credit", async () => {
    const t = await addTenant(2, { startedOn: "2026-10-01" });
    await repo.addCharge({ tenantId: t.id, kind: "light", roundId: "round-1", dueDate: "2026-10-15", amount: 420 });
    await pay(t, 3000, "2026-10-02", "light");
    expect(await tenantBalance(repo, t, "2026-10-28")).toEqual({ rent: 3000, light: 0, total: 3000, credit: 2580 });
  });
});

describe("rentPreview", () => {
  it("names the first period and counts periods due", () => {
    expect(rentPreview({ cycleStartDay: 26, startedOn: "2026-10-10", rentAmount: 3000 }, "2026-10-28")).toEqual({
      first: { start: "2026-09-26", end: "2026-10-25" },
      amount: 3000,
      dueCount: 2,
    });
    expect(rentPreview({ cycleStartDay: 1, startedOn: "2026-11-05", rentAmount: 3000 }, "2026-10-28").dueCount).toBe(0);
    expect(rentPreview({ cycleStartDay: 1, startedOn: "2025-10-28", rentAmount: 3000 }, "2026-10-28").dueCount).toBe(13);
  });
});

describe("tenantAccount", () => {
  it("lists every charge and every payment (deleted too) and counts only live payments", async () => {
    const t = await addTenant(6, { startedOn: "2026-10-01" });
    const kept = await pay(t, 1000);
    const gone = await pay(t, 2000);
    await repo.deletePayment(gone.id, "2026-10-06");
    const account = await tenantAccount(repo, t, "2026-10-28");
    expect(account.charges.map((c) => c.periodStart)).toEqual(["2026-10-01"]);
    expect(account.payments.map((p) => p.id).sort()).toEqual([kept.id, gone.id].sort());
    expect(account.balance).toEqual({ rent: 2000, light: 0, total: 2000, credit: 0 });
  });
});
