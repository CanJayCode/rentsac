import { periodContaining, periodsBetween, type Period } from "./cycles";
import { allocate, pending } from "./ledger";
import type { Repo, RepoCharge, RepoPayment, Tenant } from "./repo/types";

export type HomeRow = {
  roomId: string;
  roomNumber: number;
  tenantId: string;
  tenantName: string;
  pendingRent: number;
  pendingLight: number;
  pendingTotal: number;
  /** Money paid beyond every charge so far ("Advance"), never netted against pending. */
  credit: number;
  status: "paid" | "due";
};

export type Balance = { rent: number; light: number; total: number; credit: number };

function dayAfter(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Period starts the tenant owes rent for, from the first period up to `today` (or the day they left). */
function duePeriodStarts(tenant: Tenant, charges: RepoCharge[], today: string): string[] {
  const until = tenant.leftOn && tenant.leftOn < today ? tenant.leftOn : today;
  if (tenant.startedOn > until) return [];

  let from = periodContaining(tenant.cycleStartDay, tenant.startedOn).start;
  // An imported opening balance already covers everything up to its date.
  const openings = charges.filter((c) => c.kind === "opening").map((c) => c.dueDate);
  if (openings.length > 0) {
    const after = dayAfter(openings.sort().at(-1)!);
    if (after > from) from = after;
  }
  return periodsBetween(tenant.cycleStartDay, from, until).map((p) => p.start);
}

/** Adds the missing rent charges and returns the tenant's full charge list. */
async function syncRent(repo: Repo, tenant: Tenant, today: string): Promise<RepoCharge[]> {
  const charges = await repo.listCharges(tenant.id);
  const have = new Set(charges.filter((c) => c.kind === "rent").map((c) => c.periodStart));
  const missing = duePeriodStarts(tenant, charges, today).filter((start) => !have.has(start));
  for (const start of missing) {
    charges.push(
      await repo.addCharge({
        tenantId: tenant.id,
        kind: "rent",
        periodStart: start,
        dueDate: start,
        amount: tenant.rentAmount,
      }),
    );
  }
  return charges;
}

/** One rent charge per cycle period that has started by `today`. Safe to run any number of times. */
export async function ensureRentCharges(repo: Repo, tenant: Tenant, today: string): Promise<void> {
  await syncRent(repo, tenant, today);
}

async function balanceFrom(repo: Repo, tenantId: string, charges: RepoCharge[]): Promise<Balance> {
  const { paidByCharge, credit } = allocate(charges, await livePayments(repo, tenantId));
  return { ...pending(charges, paidByCharge), credit };
}

async function livePayments(repo: Repo, tenantId: string) {
  return (await repo.listPayments(tenantId)).filter((p) => !p.deletedAt);
}

/** Cycle day and move-in date may change only while nothing has been paid against them. */
export async function rentTermsEditable(repo: Repo, tenantId: string): Promise<boolean> {
  return (await livePayments(repo, tenantId)).length === 0;
}

/**
 * After a corrected cycle day or move-in date: drops every generated rent charge and creates them
 * again from the tenant as saved. Opening balances stay. Refuses once a payment exists.
 */
export async function regenerateRentCharges(repo: Repo, tenant: Tenant, today: string): Promise<void> {
  if (!(await rentTermsEditable(repo, tenant.id))) {
    throw new Error("Rent terms are fixed once a payment has been recorded");
  }
  for (const c of await repo.listCharges(tenant.id)) {
    if (c.kind === "rent" && c.periodStart) await repo.deleteCharge(c.id);
  }
  await ensureRentCharges(repo, tenant, today);
}

/**
 * Records the tenant as left on `leftOn` (between move-in and today). Periods that started on or before
 * that day are owed; later rent charges are removed (money paid against them becomes credit).
 */
export async function closeTenancy(repo: Repo, tenant: Tenant, leftOn: string, today: string): Promise<void> {
  if (leftOn < tenant.startedOn || leftOn > today) throw new Error("Leave date out of range");
  const charges = await syncRent(repo, { ...tenant, leftOn }, today);
  // Rent for a period that starts after the leave date is never owed, whatever was paid against it.
  // Money paid toward it then shows as credit.
  for (const c of charges) {
    if (c.kind === "rent" && c.periodStart && c.periodStart > leftOn) await repo.deleteCharge(c.id);
  }
  await repo.vacateTenant(tenant.id, leftOn);
}

/** Above this many periods due at once, saving a tenant needs an explicit confirmation. */
export const MONTHS_CONFIRM_ABOVE = 2;

export type RentPreview = { first: Period; amount: number; dueCount: number };

/** What saving these terms would charge: the first period, and how many periods are already due today. */
export function rentPreview(
  terms: { cycleStartDay: number; startedOn: string; rentAmount: number },
  today: string,
): RentPreview {
  const first = periodContaining(terms.cycleStartDay, terms.startedOn);
  const dueCount = terms.startedOn > today ? 0 : periodsBetween(terms.cycleStartDay, first.start, today).length;
  return { first, amount: terms.rentAmount, dueCount };
}

/** Pending rent and light and advance credit for one tenant, after bringing rent charges up to date. */
export async function tenantBalance(repo: Repo, tenant: Tenant, today: string): Promise<Balance> {
  const charges = tenant.leftOn ? await repo.listCharges(tenant.id) : await syncRent(repo, tenant, today);
  return balanceFrom(repo, tenant.id, charges);
}

export type Account = { charges: RepoCharge[]; payments: RepoPayment[]; balance: Balance };

/**
 * Everything for a tenant's ledger: all charges (rent brought up to date first), all payments
 * including deleted ones, and the balance worked out from the live ones only.
 */
export async function tenantAccount(repo: Repo, tenant: Tenant, today: string): Promise<Account> {
  const charges = tenant.leftOn ? await repo.listCharges(tenant.id) : await syncRent(repo, tenant, today);
  const payments = await repo.listPayments(tenant.id);
  const { paidByCharge, credit } = allocate(charges, payments.filter((p) => !p.deletedAt));
  return { charges, payments, balance: { ...pending(charges, paidByCharge), credit } };
}

export async function homeSummary(
  repo: Repo,
  today: string,
): Promise<{ totalPending: number; rows: HomeRow[]; left: HomeRow[] }> {
  const [rooms, tenants] = await Promise.all([repo.listRooms(), repo.listTenants()]);
  const roomNumber = new Map(rooms.map((r) => [r.id, r.number]));

  const all = await Promise.all(
    tenants.map(async (t): Promise<{ active: boolean; row: HomeRow }> => {
      const active = !t.leftOn;
      const b = await tenantBalance(repo, t, today);
      return {
        active,
        row: {
          roomId: t.roomId,
          roomNumber: roomNumber.get(t.roomId) ?? 0,
          tenantId: t.id,
          tenantName: t.name,
          pendingRent: b.rent,
          pendingLight: b.light,
          pendingTotal: b.total,
          credit: b.credit,
          status: b.total > 0 ? "due" : "paid",
        },
      };
    }),
  );

  const byRoom = (a: HomeRow, b: HomeRow) => a.roomNumber - b.roomNumber || a.tenantName.localeCompare(b.tenantName);
  const rows = all.filter((x) => x.active).map((x) => x.row).sort(byRoom);
  const left = all.filter((x) => !x.active && (x.row.pendingTotal > 0 || x.row.credit > 0)).map((x) => x.row).sort(byRoom);
  const totalPending = [...rows, ...left].reduce((sum, r) => sum + r.pendingTotal, 0);
  return { totalPending, rows, left };
}
