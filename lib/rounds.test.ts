import { describe, expect, it } from "vitest";
import { homeSummary, tenantBalance } from "./rent";
import { createMemoryRepo } from "./repo/memory";
import type { Repo, Room } from "./repo/types";
import {
  billFor,
  finishRound,
  loadRound,
  parseReading,
  recentUnits,
  rowState,
  saveRound,
  validateRoundDate,
} from "./rounds";
import { getRate } from "./settings";

async function setup() {
  const repo = createMemoryRepo();
  const rooms = await repo.listRooms();
  const room = (n: number): Room => rooms.find((r) => r.number === n)!;
  const tenant = (n: number, name: string) =>
    repo.saveTenant({ roomId: room(n).id, name, rentAmount: 3000, cycleStartDay: 1, startedOn: "2026-10-01" });
  const t3 = await tenant(3, "Vaibhav");
  const t5 = await tenant(5, "Vijay");
  // The base round: last readings for rooms 3, 5 and vacant 8.
  const base = await repo.createRound("2026-10-01");
  await repo.saveRoundReadings(base.id, [
    { roomId: room(3).id, value: 1502, baseReset: false },
    { roomId: room(5).id, value: 763, baseReset: false },
    { roomId: room(8).id, value: 400, baseReset: false },
  ]);
  return { repo, room, t3, t5, base };
}

const light = async (repo: Repo, tenantId: string) => (await repo.listCharges(tenantId)).filter((c) => c.kind === "light");

describe("finishRound", () => {
  it("bills rooms 3 and 5 at rate 10: 230 and 140, storing rate and readings", async () => {
    const { repo, room, t3, t5 } = await setup();
    const r = await repo.createRound("2026-10-15");
    await repo.saveRoundReadings(r.id, [
      { roomId: room(3).id, value: 1525, baseReset: false },
      { roomId: room(5).id, value: 777, baseReset: false },
    ]);
    expect(await finishRound(repo, r.id, 10)).toEqual({ billed: 2, skipped: 0 });
    const [c3] = await light(repo, t3.id);
    const [c5] = await light(repo, t5.id);
    expect(c3).toMatchObject({ amount: 230, rate: 10, prevReading: 1502, currReading: 1525, units: 23, roundId: r.id, dueDate: "2026-10-15" });
    expect(c5).toMatchObject({ amount: 140, units: 14, prevReading: 763, currReading: 777 });
    expect((await repo.getRound(r.id))!.status).toBe("done");
  });

  it("skips a room without a reading, keeps the round open, and bills it later without duplicates", async () => {
    const { repo, room, t3, t5 } = await setup();
    const r = await repo.createRound("2026-10-15");
    await repo.saveRoundReadings(r.id, [{ roomId: room(3).id, value: 1525, baseReset: false }]);
    expect(await finishRound(repo, r.id, 10)).toEqual({ billed: 1, skipped: 1 });
    expect((await repo.getRound(r.id))!.status).toBe("open");
    expect(await light(repo, t5.id)).toEqual([]);

    await repo.saveRoundReadings(r.id, [{ roomId: room(5).id, value: 777, baseReset: false }]);
    expect(await finishRound(repo, r.id, 10)).toEqual({ billed: 2, skipped: 0 });
    expect(await light(repo, t3.id)).toHaveLength(1);
    expect((await light(repo, t5.id))[0].amount).toBe(140);
    expect((await repo.getRound(r.id))!.status).toBe("done");
  });

  it("finishing the same round twice creates no duplicate charges", async () => {
    const { repo, room, t3 } = await setup();
    const r = await repo.createRound("2026-10-15");
    await repo.saveRoundReadings(r.id, [{ roomId: room(3).id, value: 1525, baseReset: false }]);
    await finishRound(repo, r.id, 10);
    await finishRound(repo, r.id, 10);
    expect(await light(repo, t3.id)).toHaveLength(1);
  });

  it("a confirmed lower reading bills 0 and is the next round's base", async () => {
    const { repo, room, t3 } = await setup();
    const r = await repo.createRound("2026-10-15");
    const saved = await saveRound(repo, r.id, { rows: [{ roomId: room(3).id, raw: "20", confirmed: true }], main: [] }, 10);
    expect(saved.ok).toBe(true);
    expect(await repo.listReadings(r.id)).toEqual([{ roomId: room(3).id, roundId: r.id, value: 20, baseReset: true }]);
    expect((await light(repo, t3.id))[0]).toMatchObject({ amount: 0, units: 0, currReading: 20, prevReading: 1502 });

    const next = await repo.createRound("2026-10-29");
    expect(await repo.lastReading(room(3).id, next.id)).toBe(20);
    await repo.saveRoundReadings(next.id, [{ roomId: room(3).id, value: 45, baseReset: false }]);
    await finishRound(repo, next.id, 10);
    expect((await light(repo, t3.id)).find((c) => c.roundId === next.id)!.amount).toBe(250);
  });

  it("vacant rooms save readings and create no charge", async () => {
    const { repo, room, t3, t5 } = await setup();
    const r = await repo.createRound("2026-10-15");
    await repo.saveRoundReadings(r.id, [{ roomId: room(8).id, value: 420, baseReset: false }]);
    expect(await finishRound(repo, r.id, 10)).toEqual({ billed: 0, skipped: 2 });
    expect((await repo.listReadings(r.id)).map((x) => x.value)).toEqual([420]);
    expect([...(await light(repo, t3.id)), ...(await light(repo, t5.id))]).toEqual([]);
  });

  it("changing the rate afterwards leaves the old charge unchanged", async () => {
    const { repo, room, t3, t5 } = await setup();
    const r = await repo.createRound("2026-10-15");
    await repo.saveRoundReadings(r.id, [{ roomId: room(3).id, value: 1525, baseReset: false }]);
    await finishRound(repo, r.id, 10);
    await repo.setSetting("rate", "12");
    await repo.saveRoundReadings(r.id, [{ roomId: room(5).id, value: 777, baseReset: false }]);
    await finishRound(repo, r.id, await getRate(repo));
    expect((await light(repo, t3.id))[0]).toMatchObject({ amount: 230, rate: 10 });
    expect((await light(repo, t5.id))[0]).toMatchObject({ amount: 168, rate: 12 });
  });

  it("the first reading for a room bills 0", async () => {
    const { repo, room } = await setup();
    const t13 = await repo.saveTenant({ roomId: room(13).id, name: "Gaikwad", rentAmount: 3000, cycleStartDay: 1, startedOn: "2026-10-01" });
    const r = await repo.createRound("2026-10-15");
    await repo.saveRoundReadings(r.id, [{ roomId: room(13).id, value: 5000, baseReset: false }]);
    await finishRound(repo, r.id, 10);
    const [c] = await light(repo, t13.id);
    expect(c).toMatchObject({ amount: 0, units: 0, currReading: 5000 });
    expect(c.prevReading).toBeUndefined();
  });

  it("an equal reading bills 0", async () => {
    const { repo, room, t3 } = await setup();
    const r = await repo.createRound("2026-10-15");
    await repo.saveRoundReadings(r.id, [{ roomId: room(3).id, value: 1502, baseReset: false }]);
    await finishRound(repo, r.id, 10);
    expect((await light(repo, t3.id))[0]).toMatchObject({ amount: 0, units: 0, prevReading: 1502, currReading: 1502 });
  });

  it("the Home total includes the light bill after a round", async () => {
    const { repo, room } = await setup();
    const before = (await homeSummary(repo, "2026-10-29")).totalPending;
    const r = await repo.createRound("2026-10-15");
    await repo.saveRoundReadings(r.id, [
      { roomId: room(3).id, value: 1525, baseReset: false },
      { roomId: room(5).id, value: 777, baseReset: false },
    ]);
    await finishRound(repo, r.id, 10);
    const after = await homeSummary(repo, "2026-10-29");
    expect(after.totalPending - before).toBe(370);
    expect(after.rows.find((x) => x.roomNumber === 3)!.pendingLight).toBe(230);
  });
});

describe("saveRound", () => {
  it("rejects a lower or high reading that is not confirmed, and saves nothing", async () => {
    const { repo, room } = await setup();
    const r = await repo.createRound("2026-10-15");
    const res = await saveRound(
      repo,
      r.id,
      { rows: [{ roomId: room(3).id, raw: "1400", confirmed: false }, { roomId: room(5).id, raw: "777", confirmed: false }], main: [] },
      10,
    );
    expect(res).toEqual({ ok: false, errors: { [room(3).id]: "readings.error.confirm" } });
    expect(await repo.listReadings(r.id)).toEqual([]);
  });

  it("rejects non-integer, negative and absurd readings with field errors", async () => {
    const { repo, room } = await setup();
    const r = await repo.createRound("2026-10-15");
    const res = await saveRound(
      repo,
      r.id,
      {
        rows: [
          { roomId: room(3).id, raw: "1525.5", confirmed: false },
          { roomId: room(5).id, raw: "-3", confirmed: false },
        ],
        main: [{ key: "motor", raw: "99999999", confirmed: false }],
      },
      10,
    );
    expect(res).toEqual({
      ok: false,
      errors: { [room(3).id]: "readings.error.whole", [room(5).id]: "readings.error.whole", "main:motor": "readings.error.tooBig" },
    });
  });

  it("is idempotent: the same save twice stores one reading and one charge per room", async () => {
    const { repo, room, t3 } = await setup();
    const r = await repo.createRound("2026-10-15");
    const input = { rows: [{ roomId: room(3).id, raw: "1525", confirmed: false }], main: [{ key: "inverter" as const, raw: "3198", confirmed: false }] };
    await saveRound(repo, r.id, input, 10);
    await saveRound(repo, r.id, input, 10);
    expect(await repo.listReadings(r.id)).toHaveLength(1);
    expect(await repo.listMainReadings(r.id)).toEqual([{ roundId: r.id, key: "inverter", value: 3198 }]);
    expect(await light(repo, t3.id)).toHaveLength(1);
  });

  it("the newest round still takes a vacant room's reading after it is done", async () => {
    const { repo, room } = await setup();
    const r = await repo.createRound("2026-10-15");
    const rows = (raw3: string) => [{ roomId: room(3).id, raw: raw3, confirmed: false }, { roomId: room(5).id, raw: "777", confirmed: false }];
    expect(await saveRound(repo, r.id, { rows: rows("1525"), main: [] }, 10)).toEqual({ ok: true, billed: 2, skipped: 0 });
    expect((await repo.getRound(r.id))!.status).toBe("done");
    const res = await saveRound(repo, r.id, { rows: [...rows("1525"), { roomId: room(8).id, raw: "430", confirmed: false }], main: [] }, 10);
    expect(res.ok).toBe(true);
    expect((await repo.listReadings(r.id)).find((x) => x.roomId === room(8).id)!.value).toBe(430);
  });

  it("refuses to change a round that is not the newest", async () => {
    const { repo, room, base } = await setup();
    await repo.createRound("2026-10-15");
    const res = await saveRound(repo, base.id, { rows: [{ roomId: room(3).id, raw: "1600", confirmed: false }], main: [] }, 10);
    expect(res).toEqual({ ok: false, errors: {}, formError: "readings.error.closed" });
  });
});

describe("correcting a billed reading in the newest round", () => {
  const one = (roomId: string, raw: string, confirmed = false) => ({ rows: [{ roomId, raw, confirmed }], main: [] });
  const roundCharges = async (repo: Repo, tenantId: string, roundId: string) =>
    (await light(repo, tenantId)).filter((c) => c.roundId === roundId);

  it("1525 -> 1535 changes the bill and keeps one charge", async () => {
    const { repo, room, t3 } = await setup();
    const r = await repo.createRound("2026-10-15");
    await saveRound(repo, r.id, one(room(3).id, "1525"), 10);
    expect(await saveRound(repo, r.id, one(room(3).id, "1535"), 10)).toMatchObject({ ok: true });
    const cs = await roundCharges(repo, t3.id, r.id);
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ amount: 330, units: 33, prevReading: 1502, currReading: 1535, rate: 10 });
    expect((await repo.listReadings(r.id))[0]).toMatchObject({ value: 1535, baseReset: false });
  });

  it("fixes a confirmed-lower slip, and the next round bills against the corrected base", async () => {
    const { repo, room, t3 } = await setup();
    const r = await repo.createRound("2026-10-15");
    await saveRound(repo, r.id, one(room(3).id, "1252", true), 10);
    expect((await roundCharges(repo, t3.id, r.id))[0].amount).toBe(0);
    await saveRound(repo, r.id, one(room(3).id, "1525"), 10);
    expect((await repo.listReadings(r.id))[0]).toMatchObject({ value: 1525, baseReset: false });
    expect((await roundCharges(repo, t3.id, r.id))[0]).toMatchObject({ amount: 230, prevReading: 1502, currReading: 1525 });

    const next = await repo.createRound("2026-10-29");
    await saveRound(repo, next.id, one(room(3).id, "1545"), 10);
    expect((await roundCharges(repo, t3.id, next.id))[0]).toMatchObject({ amount: 200, prevReading: 1525 });
  });

  it("a wrong first reading stays a first reading but moves the next round's base", async () => {
    const { repo, room } = await setup();
    const t13 = await repo.saveTenant({ roomId: room(13).id, name: "Gaikwad", rentAmount: 3000, cycleStartDay: 1, startedOn: "2026-10-01" });
    const r = await repo.createRound("2026-10-15");
    await saveRound(repo, r.id, one(room(13).id, "5000"), 10);
    await saveRound(repo, r.id, one(room(13).id, "5100"), 10);
    const [c] = await roundCharges(repo, t13.id, r.id);
    expect(c).toMatchObject({ amount: 0, units: 0, currReading: 5100 });
    expect(c.prevReading).toBeUndefined();
    const next = await repo.createRound("2026-10-29");
    await saveRound(repo, next.id, one(room(13).id, "5130"), 10);
    expect((await roundCharges(repo, t13.id, next.id))[0].amount).toBe(300);
  });

  it("a lower or high correction needs confirming, and a confirmed lower one resets the base", async () => {
    const { repo, room, t3 } = await setup();
    const r = await repo.createRound("2026-10-15");
    await saveRound(repo, r.id, one(room(3).id, "1525"), 10);
    const res = await saveRound(repo, r.id, one(room(3).id, "1400"), 10);
    expect(res).toEqual({ ok: false, errors: { [room(3).id]: "readings.error.confirm" } });
    expect((await repo.listReadings(r.id))[0].value).toBe(1525);
    expect((await roundCharges(repo, t3.id, r.id))[0].amount).toBe(230);

    await saveRound(repo, r.id, one(room(3).id, "1400", true), 10);
    expect((await repo.listReadings(r.id))[0]).toMatchObject({ value: 1400, baseReset: true });
    expect((await roundCharges(repo, t3.id, r.id))[0]).toMatchObject({ amount: 0, currReading: 1400 });
  });

  it("re-bills at the rate stored on the old charge, not the current setting", async () => {
    const { repo, room, t3 } = await setup();
    const r = await repo.createRound("2026-10-15");
    await saveRound(repo, r.id, one(room(3).id, "1525"), 10);
    await repo.setSetting("rate", "12");
    await saveRound(repo, r.id, one(room(3).id, "1535"), await getRate(repo));
    expect((await roundCharges(repo, t3.id, r.id))[0]).toMatchObject({ amount: 330, rate: 10 });
  });

  it("is refused in a round that is no longer the newest", async () => {
    const { repo, room, t3 } = await setup();
    const r = await repo.createRound("2026-10-15");
    await saveRound(repo, r.id, one(room(3).id, "1525"), 10);
    await repo.createRound("2026-10-29");
    expect(await saveRound(repo, r.id, one(room(3).id, "1535"), 10)).toEqual({ ok: false, errors: {}, formError: "readings.error.closed" });
    expect((await roundCharges(repo, t3.id, r.id))[0].amount).toBe(230);
  });

  it("saving unchanged values again deletes and re-adds nothing", async () => {
    const { repo, room, t3 } = await setup();
    const r = await repo.createRound("2026-10-15");
    const input = { rows: [{ roomId: room(3).id, raw: "1525", confirmed: false }, { roomId: room(5).id, raw: "777", confirmed: false }], main: [] };
    await saveRound(repo, r.id, input, 10);
    const before = await roundCharges(repo, t3.id, r.id);
    let deletes = 0;
    const counted: Repo = { ...repo, deleteCharge: async (id) => { deletes++; return repo.deleteCharge(id); } };
    await saveRound(counted, r.id, input, 10);
    await saveRound(counted, r.id, input, 10);
    expect(deletes).toBe(0);
    expect(await roundCharges(repo, t3.id, r.id)).toEqual(before);
  });

  it("after a payment, a lower corrected bill turns the overpaid part into advance", async () => {
    const { repo, room, t3 } = await setup();
    const r = await repo.createRound("2026-10-15");
    await saveRound(repo, r.id, one(room(3).id, "1525"), 10);
    const tenant = (await repo.getTenant(t3.id))!;
    await repo.addPayment({ tenantId: t3.id, paidOn: "2026-10-20", amount: 3230, cash: 3230, upi: 0, target: "auto" }, "pay-1");
    expect(await tenantBalance(repo, tenant, "2026-10-29")).toEqual({ rent: 0, light: 0, total: 0, credit: 0 });
    await saveRound(repo, r.id, one(room(3).id, "1515"), 10);
    expect(await tenantBalance(repo, tenant, "2026-10-29")).toEqual({ rent: 0, light: 0, total: 0, credit: 100 });
  });
});

describe("loadRound", () => {
  it("lists every room with tenant, last reading, saved value and bill", async () => {
    const { repo, room } = await setup();
    const r = await repo.createRound("2026-10-15");
    await saveRound(repo, r.id, { rows: [{ roomId: room(3).id, raw: "1525", confirmed: false }], main: [] }, 10);
    const data = (await loadRound(repo, r.id))!;
    expect(data.rows).toHaveLength(16);
    expect(data.editable).toBe(true);
    const r3 = data.rows.find((x) => x.number === 3)!;
    expect(r3).toMatchObject({ tenantName: "Vaibhav", prev: 1502, saved: 1525, bill: { amount: 230, units: 23, rate: 10 } });
    expect(data.rows.find((x) => x.number === 8)).toMatchObject({ tenantName: null, prev: 400, saved: null, bill: null });
    expect(data.rows.find((x) => x.number === 1)!.prev).toBeNull();
    expect(data.main.map((m) => m.key)).toEqual(["block_1_4", "block_5_8", "block_9_12", "block_13_16", "inverter", "motor"]);
    expect(data.occupied).toBe(2);
  });
});

describe("rowState", () => {
  it("is empty without a value and first without a previous reading", () => {
    expect(rowState(100, null, [])).toEqual({ kind: "empty" });
    expect(rowState(null, 500, [])).toEqual({ kind: "first" });
  });

  it("flags a lower reading", () => {
    expect(rowState(1502, 1400, [20])).toEqual({ kind: "lower" });
  });

  it("flags an unusually high reading", () => {
    expect(rowState(1502, 1502 + 300, [20, 25, 22])).toEqual({ kind: "high", units: 300 });
  });

  it("an equal reading is ok with 0 units, no warning", () => {
    expect(rowState(1502, 1502, [20])).toEqual({ kind: "ok", units: 0 });
  });

  it("a usual reading is ok with its units", () => {
    expect(rowState(1502, 1525, [20, 25])).toEqual({ kind: "ok", units: 23 });
  });
});

describe("billFor", () => {
  it("resets the base before billing a lower reading", () => {
    expect(billFor(1502, 20, 10)).toEqual({ amount: 0, units: 0, prevReading: 1502 });
    expect(billFor(null, 20, 10)).toEqual({ amount: 0, units: 0 });
    expect(billFor(1502, 1525, 10)).toEqual({ amount: 230, units: 23, prevReading: 1502 });
  });
});

describe("recentUnits", () => {
  it("takes the units of the last six steps, a base reset breaking the chain", () => {
    const h = [100, 110, 130, 160, 5, 15, 40, 50, 60, 75].map((value, i) => ({ value, baseReset: i === 4 }));
    expect(recentUnits(h)).toEqual([10, 20, 30, 10, 25, 10, 10, 15].slice(-6));
  });
});

describe("parseReading", () => {
  it("accepts whole numbers and empty", () => {
    expect(parseReading("1525")).toEqual({ ok: true, value: 1525 });
    expect(parseReading(" 0 ")).toEqual({ ok: true, value: 0 });
    expect(parseReading("")).toEqual({ ok: true, value: null });
  });

  it("rejects fractions, negatives, words and absurd values", () => {
    for (const bad of ["12.5", "-3", "1e3", "abc", "Infinity", "NaN"]) {
      expect(parseReading(bad), bad).toEqual({ ok: false, error: "readings.error.whole" });
    }
    expect(parseReading("10000001")).toEqual({ ok: false, error: "readings.error.tooBig" });
    expect(parseReading("10000000")).toEqual({ ok: true, value: 10_000_000 });
  });
});

describe("validateRoundDate", () => {
  it("needs a real date, not after today and not before the newest round", () => {
    expect(validateRoundDate("2026-10-29", "2026-10-29", null)).toBeNull();
    expect(validateRoundDate("2026-02-30", "2026-10-29", null)).toBe("form.error.date");
    expect(validateRoundDate("2026-10-30", "2026-10-29", null)).toBe("readings.error.future");
    expect(validateRoundDate("2026-10-10", "2026-10-29", "2026-10-15")).toBe("readings.error.beforeLast");
    expect(validateRoundDate("2026-10-15", "2026-10-29", "2026-10-15")).toBeNull();
  });
});

describe("getRate", () => {
  it("defaults to 10 and ignores a bad or non-positive setting", async () => {
    const repo = createMemoryRepo();
    expect(await getRate(repo)).toBe(10);
    await repo.setSetting("rate", "12");
    expect(await getRate(repo)).toBe(12);
    for (const bad of ["0", "-5", "abc", "", "7.5"]) {
      await repo.setSetting("rate", bad);
      expect(await getRate(repo), bad).toBe(10);
    }
  });
});
