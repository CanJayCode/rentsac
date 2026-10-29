import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { applyPlan, buildPlan, formatReport, lastReadings } from "./importer";
import { createMemoryRepo } from "./repo/memory";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

function put(ws: ExcelJS.Worksheet, row: number, cells: Record<string, ExcelJS.CellValue>) {
  for (const [col, value] of Object.entries(cells)) ws.getCell(`${col}${row}`).value = value;
}

// Tenant and rent sheets exist in the real file; the importer must leave them alone.
function otherSheets(wb: ExcelJS.Workbook) {
  const s1 = wb.addWorksheet("Sheet1");
  put(s1, 1, { A: "    ..  Room no 12: Akshay" });
  put(s1, 3, { A: "14/04/25", B: 376, C: 311, D: "63 x 10", E: "630 जमा " });
  put(s1, 5, { E: "1390 बिल बाकी " });
  const s2 = wb.addWorksheet("Sheet2");
  put(s2, 1, { A: "Room 5: Vijay " });
  put(s2, 3, { A: "12/1/25 to11/2/25", B: 3000, C: 3200 });
  put(s2, 4, { A: "12/2/25 to 11/3/25", B: "3000 बाकी " });
}

const ROUNDS_1 = 6;
const ROUNDS_2 = 2;

function reading(room: number, round: number): ExcelJS.CellValue {
  if (room === 8 && round <= 2) return null;
  if (room === 9 && (round === 3 || round === 4)) return null;
  if (room === 16 && round === 5) return 106;
  if (room === 2 && round === 2) return { formula: "B3+1", result: room * 100 + round * 10 };
  if (room === 2 && round === 4) return { formula: "B3+3" } as ExcelJS.CellValue;
  return room * 100 + round * 10;
}

function sheet3(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet("Sheet3");
  const cols = "BCDEFGHI";
  const header1: ExcelJS.CellValue[] = [
    "15/07/25",
    "14-08-25",
    utc(2025, 1, 10),
    "14/10/25",
    utc(2025, 2, 11),
    "16/11/25",
  ];
  put(ws, 1, { A: "Room no" });
  header1.forEach((h, i) => (ws.getCell(`${cols[i]}1`).value = h));
  for (let room = 1; room <= 16; room++) {
    ws.getCell(`A${room + 1}`).value = room;
    for (let r = 1; r <= ROUNDS_1; r++) ws.getCell(`${cols[r - 1]}${room + 1}`).value = reading(room, r);
  }
  put(ws, 19, { A: utc(2025, 1, 4) });
  put(ws, 20, { A: utc(2025, 5, 8) });
  put(ws, 21, { A: utc(2025, 9, 12) });
  put(ws, 22, { A: "13-16" });
  put(ws, 23, { A: "inverter " });
  const main = (base: number, r: number) => base + r * 100;
  for (let r = 1; r <= ROUNDS_1; r++) {
    const c = cols[r - 1];
    put(ws, 19, { [c]: main(1000, r) });
    put(ws, 20, { [c]: main(2000, r) });
    put(ws, 21, { [c]: main(3000, r) });
    put(ws, 22, { [c]: main(4000, r) });
    if (r > 1) put(ws, 23, { [c]: r === 5 ? 5000 : main(5000, r) });
  }
  // Unrelated table
  put(ws, 28, { A: "Month ", B: "अदिती ", C: "सोनार ", D: "अतुल ", E: "लाईट बिल.." });
  put(ws, 29, { A: "जाने/फेब्रुवारी ", B: 1500, C: 1200, D: 2080, E: 4780 });
  put(ws, 36, { D: "13680अतुल बाकी" });
  // Second block, first header blank and second one an unusable swap
  put(ws, 38, { C: utc(2025, 1, 12) });
  for (let room = 1; room <= 16; room++) {
    ws.getCell(`A${room + 38}`).value = room;
    for (let k = 0; k < ROUNDS_2; k++) {
      ws.getCell(`${cols[k]}${room + 38}`).value = reading(room, ROUNDS_1 + 1 + k);
    }
  }
  const labels = ["1 to 4", "5 to 8", "9 to 12", "13 to16", "motar "];
  labels.forEach((label, i) => {
    put(ws, 56 + i, { A: label, B: 9000 + i * 10, C: 9100 + i * 10 });
  });
}

function fixture(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  otherSheets(wb);
  sheet3(wb);
  return wb;
}

describe("buildPlan: reading rounds", () => {
  const plan = buildPlan(fixture());

  it("lists rounds in column order across both blocks", () => {
    expect(plan.rounds.map((r) => r.date)).toEqual([
      "2025-07-15",
      "2025-08-14",
      "2025-10-01",
      "2025-10-14",
      "2025-11-02",
      "2025-11-16",
      "2025-12-01",
      "2025-12-15",
    ]);
    expect(plan.rounds.map((r) => r.dateSource)).toEqual([
      "header",
      "header",
      "header-swapped",
      "header",
      "header-swapped",
      "header",
      "estimated",
      "estimated",
    ]);
  });

  it("saves a reading per room and skips blanks", () => {
    const first = plan.rounds[0];
    expect(first.readings).toHaveLength(15);
    expect(first.readings.find((r) => r.roomNumber === 8)).toBeUndefined();
    expect(first.readings.find((r) => r.roomNumber === 3)).toMatchObject({ value: 310, baseReset: false });
    const third = plan.rounds[2];
    expect(third.readings.find((r) => r.roomNumber === 9)).toBeUndefined();
    expect(plan.rounds[4].readings.find((r) => r.roomNumber === 9)).toMatchObject({ value: 950, baseReset: false });
  });

  it("uses a cached formula result and treats a formula without one as unknown", () => {
    expect(plan.rounds[1].readings.find((r) => r.roomNumber === 2)?.value).toBe(220);
    expect(plan.rounds[3].readings.find((r) => r.roomNumber === 2)).toBeUndefined();
    expect(plan.warnings.join("\n")).toMatch(/no cached value/i);
  });

  it("marks a lower reading as a base reset and warns", () => {
    const round5 = plan.rounds[4];
    expect(round5.readings.find((r) => r.roomNumber === 16)).toMatchObject({ value: 106, baseReset: true });
    expect(plan.warnings.join("\n")).toMatch(/room 16.*106.*lower/i);
  });

  it("maps main meters, including mis-parsed date labels", () => {
    expect(plan.rounds[0].main).toEqual([
      { key: "block_1_4", value: 1100 },
      { key: "block_5_8", value: 2100 },
      { key: "block_9_12", value: 3100 },
      { key: "block_13_16", value: 4100 },
    ]);
    expect(plan.rounds[1].main.find((m) => m.key === "inverter")?.value).toBe(5200);
    expect(plan.rounds[6].main).toEqual([
      { key: "block_1_4", value: 9000 },
      { key: "block_5_8", value: 9010 },
      { key: "block_9_12", value: 9020 },
      { key: "block_13_16", value: 9030 },
      { key: "motor", value: 9040 },
    ]);
    expect(plan.warnings.join("\n")).toMatch(/inverter.*5000.*lower/i);
  });

  it("ignores the unrelated table", () => {
    expect(plan.rooms).toHaveLength(16);
    expect(plan.warnings.join("\n")).not.toMatch(/aditi|अदिती|13680/i);
  });
});


describe("buildPlan: scope and blanks", () => {
  const plan = buildPlan(fixture());

  it("lists rooms 1 to 16 and nothing about tenants or money", () => {
    expect(plan.rooms).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect(Object.keys(plan).sort()).toEqual(["rooms", "rounds", "warnings"]);
    expect(plan.warnings.join("\n")).not.toMatch(/akshay|vijay|rent|बाकी|1390/i);
  });

  it("warns about blank cells before a first reading and between readings", () => {
    const text = plan.warnings.join("\n");
    expect(text).toMatch(/room 8 starts at round 3/i);
    expect(text).toMatch(/room 9 blank in rounds 3, 4/i);
  });
});

describe("report", () => {
  const plan = buildPlan(fixture());

  it("shows rounds, last readings per room, main meters and warnings only", () => {
    const text = formatReport(plan);
    expect(text).toMatch(/ROUNDS/);
    expect(text).toMatch(/LAST READING PER ROOM/);
    expect(text).toMatch(/MAIN METERS/);
    expect(text).toMatch(/WARNINGS/);
    expect(text).not.toMatch(/ROOMS AND TENANTS|Opening/);
    expect(text).toMatch(/^16 +1680 +2025-12-15$/m);
  });

  it("finds the newest value per room and main meter", () => {
    const last = lastReadings(plan);
    expect(last.rooms.get(1)).toEqual({ value: 180, date: "2025-12-15" });
    expect(last.main.get("motor")).toEqual({ value: 9140, date: "2025-12-15" });
    expect(last.main.get("inverter")).toEqual({ value: 5600, date: "2025-11-16" });
  });
});

describe("applyPlan", () => {
  it("writes finished rounds and nothing else", async () => {
    const repo = createMemoryRepo();
    const result = await applyPlan(repo, buildPlan(fixture()));
    expect(result).toEqual({ rounds: 8 });

    const rooms = await repo.listRooms();
    expect(rooms).toHaveLength(16);
    expect(await repo.listTenants()).toHaveLength(0);

    const rounds = await repo.listRounds();
    expect(rounds).toHaveLength(8);
    expect(rounds.every((r) => r.status === "done")).toBe(true);
    const room16 = rooms.find((r) => r.number === 16)!;
    expect(await repo.lastReading(room16.id)).toBe(1680);
    expect((await repo.listMainReadings(rounds[0].id)).find((m) => m.key === "motor")?.value).toBe(9140);
    const reset = (await repo.listReadings(rounds.find((r) => r.date === "2025-11-02")!.id)).find(
      (r) => r.roomId === room16.id,
    );
    expect(reset).toMatchObject({ value: 106, baseReset: true });
  });

  it("does nothing the second time", async () => {
    const repo = createMemoryRepo();
    const plan = buildPlan(fixture());
    await applyPlan(repo, plan);
    const again = await applyPlan(repo, plan);
    expect(again).toEqual({ rounds: 0 });
    expect(await repo.listRounds()).toHaveLength(8);
    expect(await repo.listTenants()).toHaveLength(0);
  });

  it("creates no charges even when tenants already exist", async () => {
    const repo = createMemoryRepo();
    const room5 = (await repo.listRooms()).find((r) => r.number === 5)!;
    const t = await repo.saveTenant({ roomId: room5.id, name: "Someone", rentAmount: 4000, cycleStartDay: 1, startedOn: "2026-01-01" });
    await applyPlan(repo, buildPlan(fixture()));
    expect(await repo.listTenants()).toHaveLength(1);
    expect(await repo.listCharges(t.id)).toHaveLength(0);
  });

  it("finishes a half-written round on rerun instead of duplicating it", async () => {
    const repo = createMemoryRepo();
    const plan = buildPlan(fixture());
    await repo.createRound(plan.rounds[0].date);
    await applyPlan(repo, plan);
    const rounds = await repo.listRounds();
    expect(rounds).toHaveLength(8);
    expect(rounds.every((r) => r.status === "done")).toBe(true);
  });

  it("records the imported round ids in the imported_rounds setting, merged and without duplicates", async () => {
    const repo = createMemoryRepo();
    const plan = buildPlan(fixture());
    await repo.setSetting("imported_rounds", JSON.stringify(["older-id"]));
    await applyPlan(repo, plan);
    await applyPlan(repo, plan);
    const ids: string[] = JSON.parse((await repo.getSetting("imported_rounds"))!);
    const rounds = await repo.listRounds();
    expect(ids).toContain("older-id");
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of rounds) expect(ids).toContain(r.id);
    expect(ids.length).toBe(rounds.length + 1);
  });
});
