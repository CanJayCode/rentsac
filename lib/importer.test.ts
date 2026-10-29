import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { applyPlan, buildPlan, formatReport } from "./importer";
import { createMemoryRepo } from "./repo/memory";

const TODAY = "2026-10-29";
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

type Options = { room4Total?: string };

function put(ws: ExcelJS.Worksheet, row: number, cells: Record<string, ExcelJS.CellValue>) {
  for (const [col, value] of Object.entries(cells)) ws.getCell(`${col}${row}`).value = value;
}

function sheet1(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet("Sheet1");
  put(ws, 1, { A: "    ..  Room no 12: Akshay" });
  put(ws, 2, { A: "दिनांक ", B: "चालू रीडिंग ", C: "मागील रीडिंग" });
  put(ws, 3, { A: "14/04/25", B: 376, C: 311, D: "63 x 10", E: "630 जमा " });
  put(ws, 4, { A: "15/05/25", B: 446, C: 376, D: "70 x 10", E: 700 });
  put(ws, 5, { E: 2210 });
  put(ws, 7, { A: "Room no 5 : Vijay " });
  put(ws, 9, { A: "15/08/25", B: 425, C: 408, D: "20x10", E: 200 });
  put(ws, 10, { A: "15/09/25", B: 439, C: 425, D: "20x10", E: 200 });
  put(ws, 11, { E: "2590रू ", F: "1200 रू जमा " });
  put(ws, 12, { E: "1390 बिल बाकी " });
  put(ws, 14, { A: "Room no 13 Gaikwad " });
  put(ws, 16, { A: "15/10/25", B: 589, C: 554, D: "35 x10", E: 350 });
  put(ws, 17, { E: "3120 रु ", F: "800 रू जमा " });
  put(ws, 18, { E: "2320 रू बाकी " });
  put(ws, 20, { A: "Room no :4 kulkarni " });
  put(ws, 21, { A: "15/02/26", B: 1053, C: 1012, D: "41x10", E: 410 });
  put(ws, 23, { A: "Room no 6: ovhal " });
  put(ws, 24, { A: "15/06/25", B: 535, C: 469, D: "66 x 10", E: 660 });
  put(ws, 26, { A: "Room no 14 Praveen " });
  put(ws, 27, { A: "15/04/26", B: 167, C: 124, D: 43, E: 430 });
  put(ws, 28, { A: "15/05/26", B: 194, C: 167, D: 27, E: 270 });
  put(ws, 29, { E: "700 बिल बाकी " });
}

function sheet2(wb: ExcelJS.Workbook, opts: Options) {
  const ws = wb.addWorksheet("Sheet2");
  put(ws, 1, { A: "Room no 3: Vaibhav kusekar" });
  put(ws, 2, { A: "Month", B: "Rent ", C: "Paid" });
  put(ws, 3, { A: "Jan", B: 3000, C: 3500, D: utc(2025, 1, 19) });
  put(ws, 4, { A: "feb", B: 3000, C: 2500, D: utc(2025, 2, 15) });
  put(ws, 5, { A: "Mar", B: 3000 });
  put(ws, 6, { B: 9000, C: 6000 });
  put(ws, 8, { A: "Room 5: Vijay " });
  put(ws, 10, { A: "12/1/25 to11/2/25", B: 3000, C: 3200 });
  put(ws, 11, { A: "12/2/25 to 11/3/25", B: 3000 });
  put(ws, 12, { A: "12/3/25 to 11/4/25", B: "3000 बाकी " });
  put(ws, 13, { A: "12/4/25 to 11/5/25", B: "3000 बाकी " });
  put(ws, 15, { A: "Room no :4 kulkarni " });
  put(ws, 17, { A: "26/02/24 to 25/03/24", B: 3000, C: 2000 });
  put(ws, 18, { A: "26/03/24 to 25/04/24", B: 3000, C: "3000 बाकी " });
  put(ws, 19, { A: "26/04/24 to 25/05/24", B: 3000, C: "3000 बाकी " });
  put(ws, 20, { A: "26/05/24 to 25/06/24", B: 3000, C: "3000 बाकी " });
  put(ws, 21, { B: "                 Total =", C: opts.room4Total ?? "9000 बाकी " });
  put(ws, 23, { A: "Room no :13 Gaikwad " });
  put(ws, 24, { A: "01/02/25 to 28/02/25", B: 3000, C: 3300 });
  put(ws, 25, { A: "01/03/25 to 31/03/25", B: 3000, C: "3000 बाकी " });
  put(ws, 27, { A: "Room no:14 Praveen ", B: "Rent", C: "paid " });
  put(ws, 28, { A: "01/12/24 to 31/12/24", B: 3000, C: 3000 });
  put(ws, 29, { A: "01/01/25 to 31/01/25", B: 3000, C: 3490 });
  put(ws, 30, { A: "01/02/25 to 28/02/25", B: 3000 });
  put(ws, 31, { A: "01/03/25 to 31/03/25", B: 3000 });
  put(ws, 32, { B: 12000, C: 6490 });
  put(ws, 33, { C: "5510बाकी " });
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

function fixture(opts: Options = {}): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  sheet1(wb);
  sheet2(wb, opts);
  sheet3(wb);
  return wb;
}

const tenant = (plan: ReturnType<typeof buildPlan>, room: number) =>
  plan.tenants.find((t) => t.roomNumber === room)!;

describe("buildPlan: rooms and tenants", () => {
  const plan = buildPlan(fixture(), { today: TODAY });

  it("lists rooms 1 to 16 and only named tenants", () => {
    expect(plan.rooms).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    expect(plan.tenants.map((t) => [t.roomNumber, t.name])).toEqual([
      [3, "Vaibhav Kusekar"],
      [4, "Kulkarni"],
      [5, "Vijay"],
      [6, "Ovhal"],
      [12, "Akshay"],
      [13, "Gaikwad"],
      [14, "Praveen"],
    ]);
  });

  it("reads the cycle start day from period labels", () => {
    expect(tenant(plan, 5).cycleStartDay).toBe(12);
    expect(tenant(plan, 4).cycleStartDay).toBe(26);
    expect(tenant(plan, 13).cycleStartDay).toBe(1);
    expect(tenant(plan, 14).cycleStartDay).toBe(1);
    expect(tenant(plan, 3).cycleStartDay).toBe(1);
  });

  it("defaults rent and cycle with a warning for tenants without rent data", () => {
    for (const room of [6, 12]) {
      expect(tenant(plan, room)).toMatchObject({ rentAmount: 3000, cycleStartDay: 1 });
    }
    expect(plan.warnings.join("\n")).toMatch(/rooms? 6, 12.*only in Sheet1/i);
    expect(tenant(plan, 3).rentAmount).toBe(3000);
  });

  it("starts each tenant in the rent period that contains the import date", () => {
    expect(tenant(plan, 5).startedOn).toBe("2026-10-12");
    expect(tenant(plan, 4).startedOn).toBe("2026-10-26");
    expect(tenant(plan, 13).startedOn).toBe("2026-10-01");
    expect(tenant(plan, 12).startedOn).toBe("2026-10-01");
  });

  it("uses the period before the cycle day when the import date is earlier in the month", () => {
    const early = buildPlan(fixture(), { today: "2026-10-05" });
    expect(tenant(early, 5).startedOn).toBe("2026-09-12");
    expect(tenant(early, 4).startedOn).toBe("2026-09-26");
  });
});

describe("buildPlan: opening balances", () => {
  const plan = buildPlan(fixture(), { today: TODAY });

  it("parses explicit pending notes in Marathi", () => {
    expect(tenant(plan, 5)).toMatchObject({ openingRent: 6000, openingLight: 1390 });
    expect(tenant(plan, 13)).toMatchObject({ openingRent: 3000, openingLight: 2320 });
    expect(tenant(plan, 4).openingRent).toBe(9000);
    expect(tenant(plan, 14)).toMatchObject({ openingRent: 5510, openingLight: 700 });
  });

  it("never infers a pending amount from sums", () => {
    expect(tenant(plan, 12)).toMatchObject({ openingRent: 0, openingLight: 0 });
    expect(tenant(plan, 6)).toMatchObject({ openingRent: 0, openingLight: 0 });
    expect(tenant(plan, 3)).toMatchObject({ openingRent: 0, openingLight: 0 });
    expect(tenant(plan, 4).openingLight).toBe(0);
    expect(plan.warnings.join("\n")).toMatch(/room 3.*not imported/i);
  });

  it("records the as-of dates", () => {
    expect(tenant(plan, 5)).toMatchObject({ openingRentAsOf: "2025-05-11", openingLightAsOf: "2025-09-15" });
  });

  it("warns when a pending figure is not a multiple of the rent", () => {
    expect(plan.warnings.join("\n")).toMatch(/room 14.*5510.*multiple/i);
    expect(plan.warnings.join("\n")).not.toMatch(/room 4.*9000.*multiple/i);
  });

  it("warns about the months that follow the sheet", () => {
    const text = plan.warnings.join("\n");
    expect(text).toMatch(/room 5.*rent.*after 2025-05-11/i);
    expect(text).toMatch(/room 5.*light.*after 2025-09-15/i);
  });

  it("warns when a light pending note equals every bill listed", () => {
    expect(plan.warnings.join("\n")).toMatch(/room 14.*700.*every bill/i);
  });

  it("flags a stated total that disagrees with the row notes", () => {
    const bad = buildPlan(fixture({ room4Total: "6000 बाकी " }), { today: TODAY });
    expect(bad.warnings.join("\n")).toMatch(/room 4.*disagree/i);
    expect(buildPlan(fixture(), { today: TODAY }).warnings.join("\n")).not.toMatch(/room 4.*disagree/i);
  });
});

describe("buildPlan: reading rounds", () => {
  const plan = buildPlan(fixture(), { today: TODAY });

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

describe("report", () => {
  it("shows tenants, rounds, main meters and warnings", () => {
    const text = formatReport(buildPlan(fixture(), { today: TODAY }));
    expect(text).toMatch(/ROOMS AND TENANTS/);
    expect(text).toMatch(/ROUNDS/);
    expect(text).toMatch(/MAIN METERS/);
    expect(text).toMatch(/WARNINGS/);
    expect(text).toMatch(/Vaibhav Kusekar/);
  });
});

describe("applyPlan", () => {
  it("writes tenants, opening balances and finished rounds", async () => {
    const repo = createMemoryRepo();
    const plan = buildPlan(fixture(), { today: TODAY });
    const result = await applyPlan(repo, plan);
    expect(result).toEqual({ tenants: 7, openingCharges: 7, rounds: 8 });

    const rooms = await repo.listRooms();
    expect(rooms).toHaveLength(16);
    const tenants = await repo.listTenants();
    const kulkarni = tenants.find((t) => t.name === "Kulkarni")!;
    expect(kulkarni).toMatchObject({ rentAmount: 3000, cycleStartDay: 26, startedOn: "2026-10-26" });
    expect(rooms.find((r) => r.id === kulkarni.roomId)?.number).toBe(4);
    const charges = await repo.listCharges(kulkarni.id);
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ kind: "opening", openingFor: "rent", amount: 9000, dueDate: "2000-01-01" });
    const vijay = tenants.find((t) => t.name === "Vijay")!;
    const vijayCharges = await repo.listCharges(vijay.id);
    expect(vijayCharges.map((c) => [c.openingFor, c.amount]).sort()).toEqual([
      ["light", 1390],
      ["rent", 6000],
    ]);
    expect(vijayCharges.some((c) => c.kind === "light" || c.kind === "rent")).toBe(false);

    const rounds = await repo.listRounds();
    expect(rounds).toHaveLength(8);
    expect(rounds.every((r) => r.status === "done")).toBe(true);
    const room16 = rooms.find((r) => r.number === 16)!;
    expect(await repo.lastReading(room16.id)).toBe(1680);
    const newest = rounds[0];
    expect((await repo.listMainReadings(newest.id)).find((m) => m.key === "motor")?.value).toBe(9140);
    const reset = (await repo.listReadings(rounds.find((r) => r.date === "2025-11-02")!.id)).find(
      (r) => r.roomId === room16.id,
    );
    expect(reset).toMatchObject({ value: 106, baseReset: true });
  });

  it("does nothing the second time", async () => {
    const repo = createMemoryRepo();
    const plan = buildPlan(fixture(), { today: TODAY });
    await applyPlan(repo, plan);
    const again = await applyPlan(repo, plan);
    expect(again).toEqual({ tenants: 0, openingCharges: 0, rounds: 0 });
    expect(await repo.listTenants()).toHaveLength(7);
    expect(await repo.listRounds()).toHaveLength(8);
    for (const t of await repo.listTenants()) {
      expect((await repo.listCharges(t.id)).length).toBeLessThanOrEqual(2);
    }
  });

  it("leaves a room that already has a different tenant alone", async () => {
    const repo = createMemoryRepo();
    const room5 = (await repo.listRooms()).find((r) => r.number === 5)!;
    await repo.saveTenant({ roomId: room5.id, name: "Someone Else", rentAmount: 4000, cycleStartDay: 1, startedOn: "2026-01-01" });
    const result = await applyPlan(repo, buildPlan(fixture(), { today: TODAY }));
    expect(result.tenants).toBe(6);
    const tenants = await repo.listTenants();
    expect(tenants.filter((t) => t.roomId === room5.id).map((t) => t.name)).toEqual(["Someone Else"]);
    expect(await repo.listCharges(tenants.find((t) => t.name === "Someone Else")!.id)).toHaveLength(0);
  });

  it("finishes a half-written round on rerun instead of duplicating it", async () => {
    const repo = createMemoryRepo();
    const plan = buildPlan(fixture(), { today: TODAY });
    await repo.createRound(plan.rounds[0].date);
    await applyPlan(repo, plan);
    const rounds = await repo.listRounds();
    expect(rounds).toHaveLength(8);
    expect(rounds.every((r) => r.status === "done")).toBe(true);
  });
});
