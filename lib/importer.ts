import type ExcelJS from "exceljs";
import { periodContaining, periodsBetween } from "./cycles";
import { MAIN_METER_KEYS, type MainMeterKey, type Repo } from "./repo/types";
import { todayIST } from "./today";

export type DateSource = "header" | "header-swapped" | "estimated";

export type PlanTenant = {
  roomNumber: number;
  name: string;
  rentAmount: number;
  cycleStartDay: number;
  startedOn: string;
  openingRent: number;
  openingLight: number;
  /** Last date the sheet covers for each opening figure ("as of"). */
  openingRentAsOf: string | null;
  openingLightAsOf: string | null;
  sources: string[];
};

export type PlanRound = {
  date: string;
  dateSource: DateSource;
  readings: { roomNumber: number; value: number; baseReset: boolean }[];
  main: { key: MainMeterKey; value: number }[];
};

export type ImportPlan = {
  today: string;
  rooms: number[];
  tenants: PlanTenant[];
  rounds: PlanRound[];
  warnings: string[];
};

const ROOM_COUNT = 16;
const DEFAULT_RENT = 3000;
const OPENING_DUE = "2000-01-01";
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

const asText = (v: Cell): string | null => (typeof v === "string" ? v : null);
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

function shiftDay(date: string, delta: number): string {
  return new Date((dayNumber(date) + delta) * 86_400_000).toISOString().slice(0, 10);
}

const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;

function lastDayOfMonth(year: number, month: number): string {
  return iso(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());
}

function titleCase(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

const ROOM_HEADING = /room\s*(?:no\.?)?\s*[:.]?\s*(\d{1,3})\s*[:.\-]?\s*(.*)$/i;

type Block = { room: number; name: string; start: number; end: number };

function findBlocks(ws: ExcelJS.Worksheet, ctx: Ctx): Block[] {
  const blocks: Block[] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const text = asText(cellOf(ws, r, 1, ctx));
    const m = text ? ROOM_HEADING.exec(text) : null;
    if (!m) continue;
    const name = titleCase(m[2].replace(/^[\s:.\-]+|[\s:.\-]+$/g, ""));
    blocks.push({ room: Number(m[1]), name, start: r, end: ws.rowCount });
  }
  blocks.forEach((b, i) => {
    if (i + 1 < blocks.length) b.end = blocks[i + 1].start - 1;
  });
  return blocks;
}

/** "1390 बिल बाकी", "2320 रू बाकी", "5510बाकी": the amount of a pending note, or null. */
function pendingAmount(text: string): number | null {
  if (!text.includes("बाकी")) return null;
  const m = /\d[\d,]*/.exec(text);
  return m ? Number(m[0].replace(/,/g, "")) : null;
}

type LightBlock = {
  room: number;
  name: string;
  lastBillDate: string | null;
  pending: number[];
  billTotal: number;
  billCount: number;
};

function readSheet1(ws: ExcelJS.Worksheet, ctx: Ctx): LightBlock[] {
  return findBlocks(ws, ctx).map((b) => {
    const out: LightBlock = { room: b.room, name: b.name, lastBillDate: null, pending: [], billTotal: 0, billCount: 0 };
    for (let r = b.start + 1; r <= b.end; r++) {
      const a = asText(cellOf(ws, r, 1, ctx));
      const date = a ? parseDmy(a) : null;
      if (date && asNumber(cellOf(ws, r, 2, ctx)) !== null && (!out.lastBillDate || date > out.lastBillDate)) {
        out.lastBillDate = date;
      }
      const bill = cellOf(ws, r, 5, ctx);
      if (typeof bill === "number" && date) {
        out.billTotal += bill;
        out.billCount++;
      }
      for (let c = 2; c <= 8; c++) {
        const note = asText(cellOf(ws, r, c, ctx));
        const amount = note ? pendingAmount(note) : null;
        if (amount !== null) out.pending.push(amount);
      }
    }
    return out;
  });
}

const MONTH_NAME = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?$/i;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const PERIOD_LABEL =
  /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\s*to\s*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/i;

type RentBlock = {
  room: number;
  name: string;
  rentAmount: number | null;
  rentVaries: boolean;
  cycleDay: number | null;
  cycleMixed: boolean;
  lastEnd: string | null;
  rowPending: number[];
  statedTotal: number | null;
  totalsRow: { rent: number; paid: number } | null;
  rowRent: number;
  rowPaid: number;
  periodRows: number;
};

function readSheet2(ws: ExcelJS.Worksheet, ctx: Ctx): RentBlock[] {
  return findBlocks(ws, ctx).map((b) => {
    const out: RentBlock = {
      room: b.room,
      name: b.name,
      rentAmount: null,
      rentVaries: false,
      cycleDay: null,
      cycleMixed: false,
      lastEnd: null,
      rowPending: [],
      statedTotal: null,
      totalsRow: null,
      rowRent: 0,
      rowPaid: 0,
      periodRows: 0,
    };
    const startDays: number[] = [];
    const rents: number[] = [];
    let monthLabels = false;
    let year: number | null = null;
    let lastMonth = 0;
    for (let r = b.start + 1; r <= b.end; r++) {
      for (let c = 2; c <= 6; c++) {
        const v = cellOf(ws, r, c, ctx);
        if (v instanceof Date && year === null) year = v.getUTCFullYear();
      }
    }
    for (let r = b.start + 1; r <= b.end; r++) {
      const label = asText(cellOf(ws, r, 1, ctx));
      const period = label ? PERIOD_LABEL.exec(label) : null;
      const monthRow = !!label && !period && MONTH_NAME.test(label);
      const labeled = !!period || monthRow;
      if (period) {
        out.periodRows++;
        startDays.push(Number(period[1]));
        const y = period[6].length === 2 ? 2000 + Number(period[6]) : Number(period[6]);
        const end = realIso(y, Number(period[5]), Number(period[4]));
        if (end && (!out.lastEnd || end > out.lastEnd)) out.lastEnd = end;
      } else if (monthRow) {
        out.periodRows++;
        monthLabels = true;
        const month = MONTHS.indexOf(label!.slice(0, 3).toLowerCase()) + 1;
        if (year !== null) {
          if (lastMonth && month < lastMonth) year++;
          out.lastEnd = lastDayOfMonth(year, month);
        }
        lastMonth = month;
      }
      const rent = cellOf(ws, r, 2, ctx);
      const paid = cellOf(ws, r, 3, ctx);
      if (labeled) {
        if (typeof rent === "number") {
          rents.push(rent);
          out.rowRent += rent;
        }
        if (typeof paid === "number") out.rowPaid += paid;
      } else if (typeof rent === "number" && typeof paid === "number") {
        out.totalsRow = { rent, paid };
      }
      for (let c = 2; c <= 6; c++) {
        const note = asText(cellOf(ws, r, c, ctx));
        const amount = note ? pendingAmount(note) : null;
        if (amount === null) continue;
        if (labeled) out.rowPending.push(amount);
        else out.statedTotal = amount;
      }
    }
    if (rents.length > 0) {
      out.rentAmount = rents[rents.length - 1];
      out.rentVaries = new Set(rents).size > 1;
    }
    if (startDays.length > 0) {
      const counts = new Map<number, number>();
      for (const d of startDays) counts.set(d, (counts.get(d) ?? 0) + 1);
      out.cycleDay = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
      out.cycleMixed = counts.size > 1;
    } else if (monthLabels) {
      out.cycleDay = 1;
    }
    return out;
  });
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

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

export function buildPlan(workbook: ExcelJS.Workbook, opts: { today?: string } = {}): ImportPlan {
  const today = opts.today ?? todayIST();
  const ctx: Ctx = { warnings: [] };
  const warn = (s: string) => ctx.warnings.push(s);

  const ws1 = sheetByName(workbook, "Sheet1", 0);
  const ws2 = sheetByName(workbook, "Sheet2", 1);
  const ws3 = sheetByName(workbook, "Sheet3", 2);
  if (!ws1) warn("Sheet1 (light bills) not found.");
  if (!ws2) warn("Sheet2 (rent) not found.");
  if (!ws3) warn("Sheet3 (readings) not found.");

  const light = new Map<number, LightBlock>();
  const rent = new Map<number, RentBlock>();
  for (const b of ws1 ? readSheet1(ws1, ctx) : []) {
    if (b.room < 1 || b.room > ROOM_COUNT) warn(`Sheet1 block "Room ${b.room}" is outside rooms 1 to ${ROOM_COUNT} and was skipped.`);
    else {
      if (light.has(b.room)) warn(`Room ${b.room} has more than one block in Sheet1; the last one is used.`);
      light.set(b.room, b);
    }
  }
  for (const b of ws2 ? readSheet2(ws2, ctx) : []) {
    if (b.room < 1 || b.room > ROOM_COUNT) warn(`Sheet2 block "Room ${b.room}" is outside rooms 1 to ${ROOM_COUNT} and was skipped.`);
    else {
      if (rent.has(b.room)) warn(`Room ${b.room} has more than one block in Sheet2; the last one is used.`);
      rent.set(b.room, b);
    }
  }

  const rounds = ws3 ? readSheet3(ws3, ctx) : [];
  const latestRound = rounds.length > 0 ? rounds[rounds.length - 1].date : null;

  const tenants: PlanTenant[] = [];
  const sheet1Only: number[] = [];
  const noCycle: number[] = [];
  const noRent: number[] = [];
  const roomNumbers = [...new Set([...light.keys(), ...rent.keys()])].sort((a, b) => a - b);

  for (const room of roomNumbers) {
    const l = light.get(room);
    const r = rent.get(room);
    const tag = `Room ${room}`;
    const name = l?.name || r?.name || "";
    if (l?.name && r?.name && l.name.toLowerCase() !== r.name.toLowerCase()) {
      warn(`${tag}: Sheet1 calls the tenant "${l.name}" but Sheet2 "${r.name}"; using "${l.name}".`);
    }
    if (!name) {
      warn(`${tag} has a block without a tenant name and was skipped.`);
      continue;
    }

    const rentAmount = r?.rentAmount ?? DEFAULT_RENT;
    if (r?.rentAmount == null) noRent.push(room);
    if (r?.rentVaries) warn(`${tag}: rent differs between rows in Sheet2; using the latest (${rentAmount}).`);
    const cycleStartDay = r?.cycleDay ?? 1;
    if (r?.cycleDay == null) noCycle.push(room);
    if (r?.cycleMixed) warn(`${tag}: period labels in Sheet2 start on different days; using the most common (${cycleStartDay}).`);
    if (r && !l) warn(`${tag} (${name}) appears only in Sheet2, so there is no light-bill history for it.`);
    if (l && !r) sheet1Only.push(room);

    const startedOn = periodContaining(cycleStartDay, today).start;

    let openingRent = 0;
    let openingRentAsOf: string | null = null;
    if (r) {
      const rows = sum(r.rowPending);
      const shortfall = r.totalsRow ? r.totalsRow.rent - r.totalsRow.paid : null;
      if (r.statedTotal !== null) {
        openingRent = r.statedTotal;
        if (r.rowPending.length > 0 && rows !== r.statedTotal) {
          warn(`${tag}: Sheet2 row notes add up to ${rows} but the stated total is ${r.statedTotal}; the figures disagree, using the stated total.`);
        } else if (r.rowPending.length === 0) {
          const derived = shortfall ?? r.rowRent - r.rowPaid;
          if (derived !== r.statedTotal) {
            warn(`${tag}: Sheet2 stated total ${r.statedTotal} but rent minus paid is ${derived}; the figures disagree, using the stated total.`);
          }
        }
      } else {
        openingRent = rows;
        if (shortfall !== null && shortfall !== rows) {
          warn(
            shortfall > 0
              ? `${tag}: Sheet2 totals show ${shortfall} unpaid rent with no "बाकी" note; not imported.`
              : `${tag}: Sheet2 totals show rent paid ${-shortfall} above rent due; not imported.`,
          );
        }
      }
      if (openingRent > 0) {
        openingRentAsOf = r.lastEnd;
        if (openingRent % rentAmount !== 0) {
          warn(`${tag}: pending rent ${openingRent} is not a multiple of the rent ${rentAmount}; it probably includes light bill or extra payments, so please split it.`);
        }
      }
      if (r.lastEnd) {
        const from = shiftDay(r.lastEnd, 1);
        const to = shiftDay(startedOn, -1);
        const gap = from <= to ? periodsBetween(cycleStartDay, from, to).length : 0;
        if (gap > 0) {
          warn(`${tag}: rent after ${r.lastEnd} is not in the sheet; ${gap} rent period${gap === 1 ? "" : "s"} up to ${to} are not charged by the import.`);
        }
      }
    }

    let openingLight = 0;
    let openingLightAsOf: string | null = null;
    if (l) {
      openingLight = sum(l.pending);
      if (l.pending.length > 1) warn(`${tag}: Sheet1 has ${l.pending.length} pending notes (${l.pending.join(", ")}); added together.`);
      if (openingLight > 0) {
        openingLightAsOf = l.lastBillDate;
        if (l.billCount >= 2 && openingLight === l.billTotal) {
          warn(`${tag}: pending light ${openingLight} equals the total of every bill listed (${l.billCount}), so no payment is recorded; please confirm.`);
        }
      }
      if (l.lastBillDate && latestRound) {
        const months = monthIndex(latestRound) - monthIndex(l.lastBillDate);
        if (months >= 1) {
          warn(`${tag}: light bills after ${l.lastBillDate} are not in the sheet; readings continue to ${latestRound} (about ${months} month${months === 1 ? "" : "s"}) and are not billed by the import.`);
        }
      }
    }

    tenants.push({
      roomNumber: room,
      name,
      rentAmount,
      cycleStartDay,
      startedOn,
      openingRent,
      openingLight,
      openingRentAsOf,
      openingLightAsOf,
      sources: [l ? "Sheet1" : null, r ? "Sheet2" : null].filter((s): s is string => s !== null),
    });
  }

  if (sheet1Only.length > 0) {
    const last = sheet1Only
      .map((n) => light.get(n)?.lastBillDate)
      .filter((d): d is string => !!d)
      .sort()
      .at(-1);
    warn(
      `Room${sheet1Only.length === 1 ? "" : "s"} ${sheet1Only.join(", ")} appear${sheet1Only.length === 1 ? "s" : ""} only in Sheet1${last ? ` (last dated ${last})` : ""} with no rent data; please confirm they are still tenants.`,
    );
  }
  if (noRent.length > 0) warn(`Rent defaulted to ${DEFAULT_RENT} for room${noRent.length === 1 ? "" : "s"} ${noRent.join(", ")} (no rent rows in Sheet2).`);
  if (noCycle.length > 0) warn(`Rent cycle defaulted to day 1 for room${noCycle.length === 1 ? "" : "s"} ${noCycle.join(", ")} (no period labels in Sheet2).`);
  if (tenants.some((t) => t.openingRent + t.openingLight > 0)) {
    warn(`Opening balances are only the explicit "बाकी" amounts; rent and light after the "as of" dates are not charged. Each tenant starts in the rent period containing ${today}.`);
  }

  const rooms = Array.from({ length: ROOM_COUNT }, (_, i) => i + 1);
  return { today, rooms, tenants, rounds, warnings: ctx.warnings };
}

function row(cols: string[], widths: number[]): string {
  return cols.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
}

export function formatReport(plan: ImportPlan): string {
  const out: string[] = [];
  out.push(`RENTSAC IMPORT PLAN (import date ${plan.today})`, "");

  out.push("ROOMS AND TENANTS");
  const named = new Set(plan.tenants.map((t) => t.roomNumber));
  const vacant = plan.rooms.filter((n) => !named.has(n));
  const widths = [4, 18, 6, 5, 18, 19, 14];
  out.push(row(["Room", "Tenant", "Rent", "Cycle", "Opening rent", "Opening light", "Source"], widths));
  for (const t of plan.tenants) {
    out.push(
      row(
        [
          String(t.roomNumber),
          t.name,
          String(t.rentAmount),
          String(t.cycleStartDay),
          t.openingRent ? `${t.openingRent}${t.openingRentAsOf ? ` (${t.openingRentAsOf})` : ""}` : "-",
          t.openingLight ? `${t.openingLight}${t.openingLightAsOf ? ` (${t.openingLightAsOf})` : ""}` : "-",
          t.sources.join("+"),
        ],
        widths,
      ),
    );
  }
  out.push(`Tenants start in the rent period containing ${plan.today}: ${plan.tenants.map((t) => `${t.roomNumber}=${t.startedOn}`).join(", ")}`);
  out.push(`Rooms 1 to ${plan.rooms.length} (existing); vacant, readings only: ${vacant.join(", ") || "none"}`);
  out.push("");

  out.push("ROUNDS");
  const bySource = (s: DateSource) => plan.rounds.filter((r) => r.dateSource === s).length;
  out.push(
    `${plan.rounds.length} rounds, ${plan.rounds[0]?.date ?? "-"} to ${plan.rounds.at(-1)?.date ?? "-"}; dates from header: ${bySource("header")}, swapped back: ${bySource("header-swapped")}, estimated: ${bySource("estimated")}`,
  );
  plan.rounds.forEach((r, i) => {
    out.push(`  ${String(i + 1).padStart(2)}  ${r.date}  ${r.dateSource.padEnd(14)}  ${String(r.readings.length).padStart(2)} rooms  ${r.main.length} main meters`);
  });
  out.push("");

  out.push("MAIN METERS");
  const keys = MAIN_METER_KEYS.filter((k) => plan.rounds.some((r) => r.main.some((m) => m.key === k)));
  out.push(
    keys.length > 0
      ? keys.map((k) => `${k} (${plan.rounds.filter((r) => r.main.some((m) => m.key === k)).length} rounds)`).join(", ")
      : "none found",
  );
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

export async function applyPlan(
  repo: Repo,
  plan: ImportPlan,
): Promise<{ tenants: number; openingCharges: number; rounds: number }> {
  const result = { tenants: 0, openingCharges: 0, rounds: 0 };

  const roomIds = new Map<number, string>();
  for (const room of await repo.listRooms()) roomIds.set(room.number, room.id);
  for (const n of plan.rooms) {
    if (!roomIds.has(n)) roomIds.set(n, (await repo.saveRoom({ number: n })).id);
  }

  const existingTenants = await repo.listTenants();
  for (const t of plan.tenants) {
    const roomId = roomIds.get(t.roomNumber)!;
    const occupant = existingTenants.find((x) => x.roomId === roomId && !x.leftOn);
    let tenantId: string;
    if (occupant) {
      if (occupant.name.trim().toLowerCase() !== t.name.toLowerCase()) continue;
      tenantId = occupant.id;
    } else {
      const saved = await repo.saveTenant({
        roomId,
        name: t.name,
        rentAmount: t.rentAmount,
        cycleStartDay: t.cycleStartDay,
        startedOn: t.startedOn,
      });
      tenantId = saved.id;
      result.tenants++;
    }
    const have = await repo.listCharges(tenantId);
    for (const [openingFor, amount] of [["rent", t.openingRent], ["light", t.openingLight]] as const) {
      if (amount <= 0) continue;
      if (have.some((c) => c.kind === "opening" && (c.openingFor ?? "rent") === openingFor)) continue;
      await repo.addCharge({ tenantId, kind: "opening", openingFor, dueDate: OPENING_DUE, amount });
      result.openingCharges++;
    }
  }

  const existingRounds = await repo.listRounds();
  for (const pr of plan.rounds) {
    const readings = pr.readings.map((r) => ({ roomId: roomIds.get(r.roomNumber)!, value: r.value, baseReset: r.baseReset }));
    const sameDate = existingRounds.filter((r) => r.date === pr.date);
    let reuse: (typeof sameDate)[number] | undefined;
    let identical = false;
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
        break;
      }
    }
    if (identical) continue;
    const round = reuse ?? (await repo.createRound(pr.date));
    await repo.saveRoundReadings(round.id, readings);
    await repo.saveMainReadings(round.id, pr.main);
    await repo.finishRound(round.id);
    result.rounds++;
  }
  return result;
}
