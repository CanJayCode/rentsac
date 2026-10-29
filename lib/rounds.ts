import { checkReading, lightBill } from "./billing";
import type { Key } from "./i18n";
import { MAIN_METER_KEYS, type MainMeterKey, type Repo, type RepoCharge, type Round } from "./repo/types";
import { isRealDate } from "./validate";

/** Meters count whole units; anything above this is a typing slip. */
export const READING_MAX = 10_000_000;
/** How many earlier steps of a meter count as its usual use. */
const RECENT_STEPS = 6;

export type RowState =
  | { kind: "empty" }
  | { kind: "first" }
  | { kind: "ok"; units: number }
  | { kind: "lower" }
  | { kind: "high"; units: number };

/** What a typed reading means next to the meter's last one: nothing yet, a first base, fine, or a warning. */
export function rowState(prev: number | null, curr: number | null, recent: number[]): RowState {
  if (curr === null) return { kind: "empty" };
  if (prev === null) return { kind: "first" };
  const check = checkReading(prev, curr, recent);
  if (check === "lower") return { kind: "lower" };
  return check === "high" ? { kind: "high", units: curr - prev } : { kind: "ok", units: curr - prev };
}

/** A reading as typed: digits only, empty meaning "not read yet". */
export function parseReading(raw: string): { ok: true; value: number | null } | { ok: false; error: Key } {
  const s = raw.trim();
  if (s === "") return { ok: true, value: null };
  if (!/^\d+$/.test(s)) return { ok: false, error: "readings.error.whole" };
  const value = Number(s);
  if (!Number.isSafeInteger(value) || value > READING_MAX) return { ok: false, error: "readings.error.tooBig" };
  return { ok: true, value };
}

/** A round's date: real, not after today in India, and not before the newest round so far. */
export function validateRoundDate(date: string, today: string, newest: string | null): Key | null {
  if (!isRealDate(date)) return "form.error.date";
  if (date > today) return "readings.error.future";
  if (newest && date < newest) return "readings.error.beforeLast";
  return null;
}

export type LightBill = { amount: number; units: number; prevReading?: number };

/**
 * The bill for one room. No previous reading: the new one is the base and bills 0. A lower reading
 * (a confirmed new meter) restarts the base and bills 0; the base is reset before lightBill runs.
 */
export function billFor(prev: number | null, curr: number, rate: number): LightBill {
  if (prev === null) return { amount: 0, units: 0 };
  if (curr < prev) return { amount: 0, units: 0, prevReading: prev };
  return { ...lightBill(prev, curr, rate), prevReading: prev };
}

/** Units used in each of the last six steps of a meter, oldest first. A new base breaks the chain. */
export function recentUnits(history: { value: number; baseReset: boolean }[]): number[] {
  const units: number[] = [];
  for (let i = 1; i < history.length; i++) {
    const [a, b] = [history[i - 1], history[i]];
    if (b.baseReset || b.value < a.value) continue;
    units.push(b.value - a.value);
  }
  return units.slice(-RECENT_STEPS);
}

export type RoundRow = {
  roomId: string;
  number: number;
  label?: string;
  /** The tenant billed in this round, or else the room's current tenant. */
  tenantName: string | null;
  occupied: boolean;
  prev: number | null;
  recent: number[];
  saved: number | null;
  baseReset: boolean;
  bill: { amount: number; units: number; rate: number; prevReading?: number } | null;
};

export type MainRow = { key: MainMeterKey; last: number | null; recent: number[]; saved: number | null };

export type RoundView = {
  round: Round;
  /** Only the newest round takes readings (done or not: a vacant room can still be noted). */
  editable: boolean;
  rows: RoundRow[];
  main: MainRow[];
  /** Rooms with a current tenant. */
  occupied: number;
};

/** Rounds strictly older than roundId, newest first; null when the round does not exist. */
async function roundsBefore(repo: Repo, roundId: string): Promise<{ all: Round[]; older: Round[] } | null> {
  const all = await repo.listRounds();
  const at = all.findIndex((r) => r.id === roundId);
  return at === -1 ? null : { all, older: all.slice(at + 1) };
}

/** Everything the round screen shows: each room with its last reading, typed value and bill, and the main meters. */
export async function loadRound(repo: Repo, roundId: string): Promise<RoundView | null> {
  const found = await roundsBefore(repo, roundId);
  if (!found) return null;
  const round = found.all.find((r) => r.id === roundId)!;
  const recentRounds = found.older.slice(0, RECENT_STEPS + 1).reverse();

  const [rooms, tenants, readings, mains, history, mainHistory] = await Promise.all([
    repo.listRooms(),
    repo.listTenants(),
    repo.listReadings(roundId),
    repo.listMainReadings(roundId),
    Promise.all(recentRounds.map((r) => repo.listReadings(r.id))),
    Promise.all(recentRounds.map((r) => repo.listMainReadings(r.id))),
  ]);

  const charges = new Map<string, { tenantName: string; charge: RepoCharge }>();
  await Promise.all(
    tenants.map(async (tn) => {
      const c = (await repo.listCharges(tn.id)).find((x) => x.kind === "light" && x.roundId === roundId);
      if (c) charges.set(tn.roomId, { tenantName: tn.name, charge: c });
    }),
  );
  const active = new Map(tenants.filter((tn) => !tn.leftOn).map((tn) => [tn.roomId, tn]));

  const rows = await Promise.all(
    [...rooms]
      .sort((a, b) => a.number - b.number)
      .map(async (room): Promise<RoundRow> => {
        const saved = readings.find((x) => x.roomId === room.id) ?? null;
        const billed = charges.get(room.id);
        const steps = history.flatMap((list) => list.filter((x) => x.roomId === room.id));
        return {
          roomId: room.id,
          number: room.number,
          ...(room.label ? { label: room.label } : {}),
          tenantName: billed?.tenantName ?? active.get(room.id)?.name ?? null,
          occupied: active.has(room.id),
          prev: await repo.lastReading(room.id, roundId),
          recent: recentUnits(steps),
          saved: saved?.value ?? null,
          baseReset: saved?.baseReset ?? false,
          bill: billed
            ? {
                amount: billed.charge.amount,
                units: billed.charge.units ?? 0,
                rate: billed.charge.rate ?? 0,
                ...(billed.charge.prevReading != null ? { prevReading: billed.charge.prevReading } : {}),
              }
            : null,
        };
      }),
  );

  // A main meter's last value may sit further back than the recent rounds: walk on until each is found.
  const last = new Map<MainMeterKey, number>();
  for (const list of [...mainHistory].reverse()) for (const m of list) if (!last.has(m.key)) last.set(m.key, m.value);
  for (const r of found.older.slice(recentRounds.length)) {
    if (last.size === MAIN_METER_KEYS.length) break;
    for (const m of await repo.listMainReadings(r.id)) if (!last.has(m.key)) last.set(m.key, m.value);
  }

  const main = MAIN_METER_KEYS.map((key): MainRow => ({
    key,
    last: last.get(key) ?? null,
    recent: recentUnits(mainHistory.flatMap((list) => list.filter((m) => m.key === key).map((m) => ({ value: m.value, baseReset: false })))),
    saved: mains.find((m) => m.key === key)?.value ?? null,
  }));

  return {
    round,
    editable: found.all[0].id === roundId,
    rows,
    main,
    occupied: rows.filter((r) => r.occupied).length,
  };
}

/**
 * Bills the round: a light charge for each room with a current tenant and a reading in it, at `rate`.
 * Rooms with a tenant but no reading are skipped (and counted); vacant rooms are never billed. Safe to
 * repeat: a room already billed keeps its charge as it was. The round is done once no room is skipped.
 */
export async function finishRound(repo: Repo, roundId: string, rate: number): Promise<{ billed: number; skipped: number }> {
  const round = await repo.getRound(roundId);
  if (!round) throw new Error(`Round ${roundId} not found`);
  const [tenants, readings] = await Promise.all([repo.listTenants({ activeOnly: true }), repo.listReadings(roundId)]);
  const byRoom = new Map(readings.map((r) => [r.roomId, r]));

  let billed = 0;
  let skipped = 0;
  const seen = new Set<string>();
  for (const tenant of tenants) {
    if (seen.has(tenant.roomId)) continue;
    seen.add(tenant.roomId);
    const reading = byRoom.get(tenant.roomId);
    if (!reading) {
      skipped++;
      continue;
    }
    const prev = await repo.lastReading(tenant.roomId, roundId);
    const bill = reading.baseReset
      ? { amount: 0, units: 0, ...(prev !== null ? { prevReading: prev } : {}) }
      : billFor(prev, reading.value, rate);
    // Deduped on tenant + round: a repeat returns the charge first made, with its own rate.
    await repo.addCharge({
      tenantId: tenant.id,
      kind: "light",
      dueDate: round.date,
      roundId,
      rate,
      currReading: reading.value,
      ...bill,
    });
    billed++;
  }

  if (skipped === 0 && round.status !== "done") await repo.finishRound(roundId);
  return { billed, skipped };
}

export type RoundInput = {
  rows: { roomId: string; raw: string; confirmed: boolean }[];
  main: { key: MainMeterKey; raw: string; confirmed: boolean }[];
};

export type SaveResult =
  | { ok: true; billed: number; skipped: number }
  | { ok: false; errors: Record<string, Key>; formError?: Key };

const needsConfirm = (s: RowState) => s.kind === "lower" || s.kind === "high";

/**
 * Checks and stores what was typed, then bills. Empty rows stay unread; a lower or unusually high value
 * must come confirmed (a confirmed lower one restarts the meter's base). A room already billed in this
 * round keeps the reading it was billed on. Nothing is stored when any row is wrong. Safe to repeat.
 */
export async function saveRound(repo: Repo, roundId: string, input: RoundInput, rate: number): Promise<SaveResult> {
  const view = await loadRound(repo, roundId);
  if (!view || !view.editable) return { ok: false, errors: {}, formError: "readings.error.closed" };

  const errors: Record<string, Key> = {};
  const rows: { roomId: string; value: number; baseReset: boolean }[] = [];
  for (const typed of input.rows) {
    const row = view.rows.find((r) => r.roomId === typed.roomId);
    if (!row || row.bill) continue;
    const parsed = parseReading(typed.raw);
    if (!parsed.ok) {
      errors[row.roomId] = parsed.error;
      continue;
    }
    if (parsed.value === null) continue;
    const state = rowState(row.prev, parsed.value, row.recent);
    if (needsConfirm(state) && !typed.confirmed) {
      errors[row.roomId] = "readings.error.confirm";
      continue;
    }
    rows.push({ roomId: row.roomId, value: parsed.value, baseReset: state.kind === "lower" });
  }

  const main: { key: MainMeterKey; value: number }[] = [];
  for (const typed of input.main) {
    const meter = view.main.find((m) => m.key === typed.key);
    if (!meter) continue;
    const parsed = parseReading(typed.raw);
    if (!parsed.ok) {
      errors[`main:${meter.key}`] = parsed.error;
      continue;
    }
    if (parsed.value === null) continue;
    if (needsConfirm(rowState(meter.last, parsed.value, meter.recent)) && !typed.confirmed) {
      errors[`main:${meter.key}`] = "readings.error.confirm";
      continue;
    }
    main.push({ key: meter.key, value: parsed.value });
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (rows.length > 0) await repo.saveRoundReadings(roundId, rows);
  if (main.length > 0) await repo.saveMainReadings(roundId, main);
  return { ok: true, ...(await finishRound(repo, roundId, rate)) };
}
