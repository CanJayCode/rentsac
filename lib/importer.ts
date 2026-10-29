import type ExcelJS from "exceljs";
import { MAIN_METER_KEYS, type MainMeterKey, type Repo } from "./repo/types";
import { getImportedRounds } from "./settings";

export type DateSource = "header" | "header-swapped" | "estimated";

export type PlanRound = {
  date: string;
  dateSource: DateSource;
  readings: { roomNumber: number; value: number; baseReset: boolean }[];
  main: { key: MainMeterKey; value: number }[];
};

export type ImportPlan = {
  rooms: number[];
  rounds: PlanRound[];
  warnings: string[];
};

const ROOM_COUNT = 16;
const FIRST_ROUND_GUESS = "2025-07-15";
const MAX_GAP_DAYS = 62;
const MAX_COLUMNS = 60;

type Cell = string | number | Date | null;
type Ctx = { warnings: string[] };

function cellOf(ws: ExcelJS.Worksheet, row: number, col: number, ctx: Ctx): Cell {
  let v = ws.getRow(row).getCell(col).value as unknown;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    if ("formula" in o || "sharedFormula" in o) {
      if (o.result === undefined || o.result === null) {
        ctx.warnings.push(
          `${ws.name} ${ws.getRow(row).getCell(col).address}: formula has no cached value, treated as unknown.`,
        );
        return null;
      }
      v = o.result;
    } else if (Array.isArray(o.richText)) {
      v = (o.richText as { text: string }[]).map((t) => t.text).join("");
    } else if (typeof o.text === "string") {
      v = o.text;
    } else {
      return null;
    }
  }
  if (typeof v === "string") return v.replace(/\s+/g, " ").trim() || null;
  if (typeof v === "number" || v instanceof Date) return v;
  return null;
}

const asNumber = (v: Cell): number | null =>
  typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function realIso(y: number, m: number, d: number): string | null {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? iso(y, m, d) : null;
}

function parseDmy(text: string): string | null {
  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/.exec(text);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return realIso(y, Number(m[2]), Number(m[1]));
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function sheetByName(wb: ExcelJS.Workbook, name: string, index: number): ExcelJS.Worksheet | undefined {
  return wb.getWorksheet(name) ?? wb.worksheets[index];
}

function mainKeyOf(label: Cell): MainMeterKey | null {
  let text: string;
  if (label instanceof Date) text = `${label.getUTCMonth() + 1}-${label.getUTCDate()}`;
  else if (typeof label === "string") text = label.toLowerCase().replace(/\s+/g, "").replace("to", "-");
  else return null;
  const map: Record<string, MainMeterKey> = {
    "1-4": "block_1_4",
    "5-8": "block_5_8",
    "9-12": "block_9_12",
    "13-16": "block_13_16",
    inverter: "inverter",
    motar: "motor",
    motor: "motor",
  };
  return map[text] ?? null;
}

type Run = { start: number; header: number };

function findRuns(ws: ExcelJS.Worksheet, ctx: Ctx): Run[] {
  const runs: Run[] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    if (asNumber(cellOf(ws, r, 1, ctx)) !== 1) continue;
    let ok = true;
    for (let i = 1; i < ROOM_COUNT && ok; i++) ok = asNumber(cellOf(ws, r + i, 1, ctx)) === i + 1;
    if (ok) {
      runs.push({ start: r, header: r - 1 });
      r += ROOM_COUNT - 1;
    }
  }
  return runs;
}

function nextRoundDate(prev: string | null): string {
  if (!prev) return FIRST_ROUND_GUESS;
  const [y, m, d] = prev.split("-").map(Number);
  if (d < 15) return iso(y, m, 15);
  return m === 12 ? iso(y + 1, 1, 1) : iso(y, m + 1, 1);
}

function resolveRoundDate(header: Cell, prev: string | null): { date: string; source: DateSource; rejected: boolean } {
  const fits = (c: string) => prev === null || (c > prev && dayNumber(c) - dayNumber(prev) <= MAX_GAP_DAYS);
  const candidates: { date: string; source: DateSource }[] = [];
  if (typeof header === "string") {
    const d = parseDmy(header);
    if (d) candidates.push({ date: d, source: "header" });
  } else if (header instanceof Date) {
    const y = header.getUTCFullYear();
    const m = header.getUTCMonth() + 1;
    const d = header.getUTCDate();
    const swapped = realIso(y, d, m);
    if (swapped) candidates.push({ date: swapped, source: "header-swapped" });
    candidates.push({ date: iso(y, m, d), source: "header" });
  }
  const hit = candidates.find((c) => fits(c.date));
  if (hit) return { ...hit, rejected: false };
  return { date: nextRoundDate(prev), source: "estimated", rejected: candidates.length > 0 };
}

function readSheet3(ws: ExcelJS.Worksheet, ctx: Ctx): PlanRound[] {
  const runs = findRuns(ws, ctx);
  if (runs.length === 0) {
    ctx.warnings.push(`${ws.name}: no block with rooms 1 to ${ROOM_COUNT} found, so no readings were imported.`);
    return [];
  }
  const lastCol = Math.min(ws.columnCount, MAX_COLUMNS);
  const rounds: PlanRound[] = [];
  const prevRoom = new Map<number, number>();
  const prevMain = new Map<MainMeterKey, number>();
  const estimated: string[] = [];
  const swapped: string[] = [];

  runs.forEach((run, ri) => {
    const roomsEnd = run.start + ROOM_COUNT - 1;
    const limit = ri + 1 < runs.length ? runs[ri + 1].header - 1 : roomsEnd + 10;
    const mainRows: { row: number; key: MainMeterKey }[] = [];
    for (let r = roomsEnd + 1; r <= Math.min(limit, roomsEnd + 10); r++) {
      const key = mainKeyOf(cellOf(ws, r, 1, ctx));
      if (key) mainRows.push({ row: r, key });
    }
    for (let c = 2; c <= lastCol; c++) {
      const header = run.header >= 1 ? cellOf(ws, run.header, c, ctx) : null;
      const roomCells = Array.from({ length: ROOM_COUNT }, (_, i) => cellOf(ws, run.start + i, c, ctx));
      const mainCells = mainRows.map((m) => cellOf(ws, m.row, c, ctx));
      if (![...roomCells, ...mainCells].some((v) => v !== null)) continue;

      const prev = rounds.length > 0 ? rounds[rounds.length - 1].date : null;
      const { date, source, rejected } = resolveRoundDate(header, prev);
      const label = `round ${rounds.length + 1} (${ws.name} column ${ws.getRow(1).getCell(c).address.replace(/\d+/, "")})`;
      if (source === "estimated") estimated.push(`${label} -> ${date}`);
      if (source === "header-swapped") swapped.push(`${label} -> ${date}`);
      if (rejected) ctx.warnings.push(`Header of ${label} did not fit the column order and was ignored.`);

      const round: PlanRound = { date, dateSource: source, readings: [], main: [] };
      roomCells.forEach((v, i) => {
        const room = i + 1;
        if (v === null) return;
        const value = asNumber(v);
        if (value === null) {
          ctx.warnings.push(`Room ${room}, ${label}: "${String(v)}" is not a number and was skipped.`);
          return;
        }
        const before = prevRoom.get(room);
        const baseReset = before !== undefined && value < before;
        if (baseReset) {
          ctx.warnings.push(
            `Room ${room}, ${label}, ${date}: reading ${value} is lower than the previous ${before} (typo or meter swap); imported as given with a new base.`,
          );
        }
        prevRoom.set(room, value);
        round.readings.push({ roomNumber: room, value, baseReset });
      });
      mainRows.forEach((m, i) => {
        const value = asNumber(mainCells[i]);
        if (value === null) return;
        const before = prevMain.get(m.key);
        if (before !== undefined && value < before) {
          ctx.warnings.push(
            `Main meter ${m.key}, ${label}, ${date}: reading ${value} is lower than the previous ${before} (typo or meter swap); imported as given.`,
          );
        }
        prevMain.set(m.key, value);
        round.main.push({ key: m.key, value });
      });
      round.main.sort((a, b) => MAIN_METER_KEYS.indexOf(a.key) - MAIN_METER_KEYS.indexOf(b.key));
      rounds.push(round);
    }
  });

  if (swapped.length > 0) {
    ctx.warnings.push(
      `${swapped.length} round dates came from header cells Sheets read with day and month swapped; swapped back (best effort): ${swapped.join("; ")}.`,
    );
  }
  if (estimated.length > 0) {
    ctx.warnings.push(
      `${estimated.length} round dates have no usable header and are estimates (alternating the 1st and 15th): ${estimated.join("; ")}.`,
    );
  }
  return rounds;
}


export function buildPlan(workbook: ExcelJS.Workbook): ImportPlan {
  const ctx: Ctx = { warnings: [] };
  const ws = sheetByName(workbook, "Sheet3", 2);
  const rounds = ws ? readSheet3(ws, ctx) : [];
  if (!ws) ctx.warnings.push("Sheet3 (readings) not found.");

  const leading: string[] = [];
  const gaps: string[] = [];
  const never: number[] = [];
  const rooms = Array.from({ length: ROOM_COUNT }, (_, i) => i + 1);
  for (const room of rooms) {
    const has = rounds.map((r) => r.readings.some((x) => x.roomNumber === room));
    const first = has.indexOf(true);
    if (first === -1) {
      if (rounds.length > 0) never.push(room);
      continue;
    }
    if (first > 0) leading.push(`room ${room} starts at round ${first + 1}`);
    const missing = has.map((h, i) => (!h && i > first ? i + 1 : 0)).filter(Boolean);
    if (missing.length > 0) gaps.push(`room ${room} blank in round${missing.length === 1 ? "" : "s"} ${missing.join(", ")}`);
  }
  if (never.length > 0) ctx.warnings.push(`No readings at all for room${never.length === 1 ? "" : "s"} ${never.join(", ")}.`);
  if (leading.length > 0) ctx.warnings.push(`Blank cells before the first reading (vacant or new meter): ${leading.join("; ")}.`);
  if (gaps.length > 0) ctx.warnings.push(`Blank cells between readings (skipped, the next reading is compared with the last one present): ${gaps.join("; ")}.`);

  return { rooms, rounds, warnings: ctx.warnings };
}

/** Newest reading per room and per main meter, with the date of the round it came from. */
export function lastReadings(plan: ImportPlan): {
  rooms: Map<number, { value: number; date: string }>;
  main: Map<MainMeterKey, { value: number; date: string }>;
} {
  const rooms = new Map<number, { value: number; date: string }>();
  const main = new Map<MainMeterKey, { value: number; date: string }>();
  for (const round of plan.rounds) {
    for (const r of round.readings) rooms.set(r.roomNumber, { value: r.value, date: round.date });
    for (const m of round.main) main.set(m.key, { value: m.value, date: round.date });
  }
  return { rooms, main };
}

export function formatReport(plan: ImportPlan): string {
  const out: string[] = [];
  out.push("RENTSAC IMPORT PLAN (meter readings only; no tenants, no charges)", "");

  out.push("ROUNDS");
  const bySource = (s: DateSource) => plan.rounds.filter((r) => r.dateSource === s).length;
  out.push(
    `${plan.rounds.length} rounds, ${plan.rounds[0]?.date ?? "-"} to ${plan.rounds.at(-1)?.date ?? "-"}; dates from header: ${bySource("header")}, swapped back: ${bySource("header-swapped")}, estimated: ${bySource("estimated")}`,
  );
  plan.rounds.forEach((r, i) => {
    out.push(`  ${String(i + 1).padStart(2)}  ${r.date}  ${r.dateSource.padEnd(14)}  ${String(r.readings.length).padStart(2)} rooms  ${r.main.length} main meters`);
  });
  out.push("");

  const last = lastReadings(plan);
  out.push("LAST READING PER ROOM (seeds the next round)");
  out.push("Room  Reading  Round date");
  for (const n of plan.rooms) {
    const l = last.rooms.get(n);
    out.push(`${String(n).padEnd(4)}  ${l ? String(l.value).padEnd(7) : "-".padEnd(7)}  ${l?.date ?? "-"}`);
  }
  out.push("");

  out.push("MAIN METERS (last value)");
  const keys = MAIN_METER_KEYS.filter((k) => last.main.has(k));
  if (keys.length === 0) out.push("none found");
  for (const k of keys) {
    const l = last.main.get(k)!;
    const n = plan.rounds.filter((r) => r.main.some((m) => m.key === k)).length;
    out.push(`${k.padEnd(12)}  ${String(l.value).padEnd(7)}  ${l.date}  (${n} rounds)`);
  }
  out.push("");

  out.push(`WARNINGS (${plan.warnings.length})`);
  plan.warnings.forEach((w, i) => out.push(`${String(i + 1).padStart(2)}. ${w}`));
  out.push("");
  out.push("Dry run: nothing was written.");
  return out.join("\n");
}

function sameReadings(
  existing: { roomId: string; value: number; baseReset: boolean }[],
  wanted: { roomId: string; value: number; baseReset: boolean }[],
): boolean {
  if (existing.length !== wanted.length) return false;
  return wanted.every((w) => existing.some((e) => e.roomId === w.roomId && e.value === w.value && e.baseReset === w.baseReset));
}

/** Writes finished rounds with their readings only. Creates no tenants and no charges; safe to run twice. */
export async function applyPlan(repo: Repo, plan: ImportPlan): Promise<{ rounds: number }> {
  const roomIds = new Map<number, string>();
  for (const room of await repo.listRooms()) roomIds.set(room.number, room.id);
  for (const n of plan.rooms) {
    if (!roomIds.has(n)) roomIds.set(n, (await repo.saveRoom({ number: n })).id);
  }

  let imported = 0;
  const importedIds = new Set(await getImportedRounds(repo));
  const existingRounds = await repo.listRounds();
  for (const pr of plan.rounds) {
    const readings = pr.readings.map((r) => ({ roomId: roomIds.get(r.roomNumber)!, value: r.value, baseReset: r.baseReset }));
    const sameDate = existingRounds.filter((r) => r.date === pr.date);
    let reuse: (typeof sameDate)[number] | undefined;
    let identical = false;
    let identicalId: string | undefined;
    for (const r of sameDate) {
      if (r.status === "open") {
        reuse = r;
        break;
      }
      const main = await repo.listMainReadings(r.id);
      if (
        sameReadings(await repo.listReadings(r.id), readings) &&
        main.length === pr.main.length &&
        pr.main.every((m) => main.some((x) => x.key === m.key && x.value === m.value))
      ) {
        identical = true;
        identicalId = r.id;
        break;
      }
    }
    if (identical) {
      importedIds.add(identicalId!);
      continue;
    }
    const round = reuse ?? (await repo.createRound(pr.date));
    await repo.saveRoundReadings(round.id, readings);
    await repo.saveMainReadings(round.id, pr.main);
    await repo.finishRound(round.id);
    importedIds.add(round.id);
    imported++;
  }
  // Imported rounds stay read-only and are never billed (see loadRound and billRound).
  await repo.setSetting("imported_rounds", JSON.stringify([...importedIds]));
  return { rounds: imported };
}
