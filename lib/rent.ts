import { periodContaining, periodsBetween } from "./cycles";
import { allocate, pending } from "./ledger";
import type { Repo, RepoCharge, Tenant } from "./repo/types";

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
  const payments = (await repo.listPayments(tenantId)).filter((p) => !p.deletedAt);
  const { paidByCharge, credit } = allocate(charges, payments);
  return { ...pending(charges, paidByCharge), credit };
}

/** Pending rent and light and advance credit for one tenant, after bringing rent charges up to date. */
export async function tenantBalance(repo: Repo, tenant: Tenant, today: string): Promise<Balance> {
  const charges = tenant.leftOn ? await repo.listCharges(tenant.id) : await syncRent(repo, tenant, today);
  return balanceFrom(repo, tenant.id, charges);
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
  const left = all.filter((x) => !x.active && x.row.pendingTotal > 0).map((x) => x.row).sort(byRoom);
  const totalPending = [...rows, ...left].reduce((sum, r) => sum + r.pendingTotal, 0);
  return { totalPending, rows, left };
}
