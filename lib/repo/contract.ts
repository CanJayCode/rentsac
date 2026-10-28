import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Repo, RepoCharge, RepoPayment } from "./types";

type NewCharge = Omit<RepoCharge, "id">;
type NewPayment = Omit<RepoPayment, "id" | "idemKey">;

const rentCharge = (tenantId: string, periodStart: string, amount = 5000): NewCharge => ({
  tenantId,
  kind: "rent",
  dueDate: periodStart,
  amount,
  periodStart,
});

const payment = (tenantId: string, amount: number): NewPayment => ({
  tenantId,
  paidOn: "2026-01-05",
  amount,
  target: "auto",
  cash: amount,
  upi: 0,
});

export function runContract(
  name: string,
  makeRepo: () => Promise<Repo> | Repo,
  opts: { skip?: boolean } = {},
): void {
  describe.skipIf(opts.skip ?? false)(`${name} repo contract`, () => {
    let repo: Repo;
    let tenantId: string;
    let roomId: string;

    beforeEach(async () => {
      repo = await makeRepo();
      const rooms = await repo.listRooms();
      roomId = rooms[0].id;
      const t = await repo.saveTenant({
        roomId,
        name: "Asha",
        rentAmount: 5000,
        cycleStartDay: 1,
        startedOn: "2026-01-01",
      });
      tenantId = t.id;
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("has rooms numbered 1..16", async () => {
      const rooms = await repo.listRooms();
      expect(
        rooms
          .map((r) => r.number)
          .filter((n) => n <= 16)
          .sort((a, b) => a - b),
      ).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    });

    it("saveTenant assigns an id and updates when given one", async () => {
      const t = await repo.getTenant(tenantId);
      expect(t?.name).toBe("Asha");
      expect(t).not.toHaveProperty("leftOn");
      await repo.saveTenant({ ...t!, name: "Asha K" });
      expect((await repo.getTenant(tenantId))?.name).toBe("Asha K");
      expect((await repo.listTenants()).filter((x) => x.id === tenantId)).toHaveLength(1);
    });

    it("addCharge is idempotent for rent", async () => {
      const a = await repo.addCharge(rentCharge(tenantId, "2026-01-01"));
      const b = await repo.addCharge(rentCharge(tenantId, "2026-01-01", 9999));
      expect(b.id).toBe(a.id);
      expect(b.amount).toBe(5000);
      await repo.addCharge(rentCharge(tenantId, "2026-02-01"));
      expect(await repo.listCharges(tenantId)).toHaveLength(2);
    });

    it("addCharge is idempotent for light per round", async () => {
      const r1 = await repo.createRound("2026-01-10");
      const r2 = await repo.createRound("2026-02-10");
      const light = (roundId: string, amount: number): NewCharge => ({
        tenantId,
        kind: "light",
        dueDate: "2026-01-10",
        amount,
        roundId,
      });
      const a = await repo.addCharge(light(r1.id, 120));
      const b = await repo.addCharge(light(r1.id, 999));
      expect(b.id).toBe(a.id);
      expect(b.amount).toBe(120);
      await repo.addCharge(light(r2.id, 80));
      expect(await repo.listCharges(tenantId)).toHaveLength(2);
    });

    it("addCharge is idempotent for opening, per openingFor bucket", async () => {
      const opening = (openingFor?: "rent" | "light", amount = 300): NewCharge => ({
        tenantId,
        kind: "opening",
        dueDate: "2026-01-01",
        amount,
        openingFor,
      });
      const rentA = await repo.addCharge(opening("rent"));
      const rentB = await repo.addCharge(opening(undefined, 700));
      expect(rentB.id).toBe(rentA.id);
      const lightA = await repo.addCharge(opening("light"));
      const lightB = await repo.addCharge(opening("light", 700));
      expect(lightA.id).not.toBe(rentA.id);
      expect(lightB.id).toBe(lightA.id);
      expect(await repo.listCharges(tenantId)).toHaveLength(2);
    });

    it("addCharge keys charges per tenant", async () => {
      const other = await repo.saveTenant({
        roomId: (await repo.listRooms())[1].id,
        name: "Ravi",
        rentAmount: 4000,
        cycleStartDay: 5,
        startedOn: "2026-01-05",
      });
      const a = await repo.addCharge(rentCharge(tenantId, "2026-01-01"));
      const b = await repo.addCharge(rentCharge(other.id, "2026-01-01"));
      expect(b.id).not.toBe(a.id);
      expect(await repo.listCharges(tenantId)).toHaveLength(1);
      expect(await repo.listCharges(other.id)).toHaveLength(1);
    });

    it("addCharge throws when the discriminator is missing", async () => {
      await expect(
        repo.addCharge({ ...rentCharge(tenantId, "2026-01-01"), periodStart: undefined }),
      ).rejects.toThrow();
      await expect(
        repo.addCharge({ tenantId, kind: "light", dueDate: "2026-01-10", amount: 100 }),
      ).rejects.toThrow();
      expect(await repo.listCharges(tenantId)).toHaveLength(0);
    });

    it("addPayment with the same idemKey stores one payment", async () => {
      const a = await repo.addPayment(payment(tenantId, 1000), "key-1");
      const b = await repo.addPayment(payment(tenantId, 1000), "key-1");
      expect(b.id).toBe(a.id);
      expect(a.idemKey).toBe("key-1");
      expect(await repo.listPayments(tenantId)).toHaveLength(1);
      await repo.addPayment(payment(tenantId, 500), "key-2");
      expect(await repo.listPayments(tenantId)).toHaveLength(2);
    });

    it("updatePayment patches fields and keeps id, idemKey and tenantId", async () => {
      const p = await repo.addPayment(payment(tenantId, 1000), "key-1");
      const u = await repo.updatePayment(p.id, { amount: 1200, cash: 700, upi: 500, note: "fix" });
      expect(u).toMatchObject({
        id: p.id,
        idemKey: "key-1",
        tenantId,
        amount: 1200,
        cash: 700,
        upi: 500,
        note: "fix",
      });
      expect((await repo.listPayments(tenantId))[0].amount).toBe(1200);
    });

    it("deletePayment soft deletes and keeps the row visible", async () => {
      const p = await repo.addPayment(payment(tenantId, 1000), "key-1");
      await repo.deletePayment(p.id);
      const list = await repo.listPayments(tenantId);
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(p.id);
      expect(list[0].deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });

    it("vacateTenant sets leftOn, keeps history, and activeOnly filters", async () => {
      await repo.addCharge(rentCharge(tenantId, "2026-01-01"));
      await repo.addPayment(payment(tenantId, 1000), "key-1");
      const other = await repo.saveTenant({
        roomId: (await repo.listRooms())[1].id,
        name: "Ravi",
        rentAmount: 4000,
        cycleStartDay: 5,
        startedOn: "2026-01-05",
      });
      await repo.vacateTenant(tenantId, "2026-03-01");

      expect((await repo.getTenant(tenantId))?.leftOn).toBe("2026-03-01");
      expect(await repo.listCharges(tenantId)).toHaveLength(1);
      expect(await repo.listPayments(tenantId)).toHaveLength(1);
      const mine = new Set([tenantId, other.id]);
      const ours = async (opts?: { activeOnly?: boolean }) =>
        (await repo.listTenants(opts)).map((t) => t.id).filter((id) => mine.has(id));
      expect((await ours()).sort()).toEqual([tenantId, other.id].sort());
      expect(await ours({ activeOnly: true })).toEqual([other.id]);
    });

    it("rounds list newest date first and finishRound marks done", async () => {
      const a = await repo.createRound("2026-01-10");
      const b = await repo.createRound("2026-03-10");
      const c = await repo.createRound("2026-02-10");
      expect(a.status).toBe("open");
      const mine = new Set([a.id, b.id, c.id]);
      const ours = (await repo.listRounds()).map((r) => r.id).filter((id) => mine.has(id));
      expect(ours).toEqual([b.id, c.id, a.id]);
      await repo.finishRound(c.id);
      expect((await repo.getRound(c.id))?.status).toBe("done");
      expect((await repo.getRound(b.id))?.status).toBe("open");
      expect(await repo.getRound("missing")).toBeNull();
    });

    it("rounds on the same date list the later-created one first", async () => {
      const a = await repo.createRound("2026-05-10");
      const b = await repo.createRound("2026-05-10");
      const ids = (await repo.listRounds()).map((r) => r.id);
      expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
    });

    it("saveRoundReadings upserts per room within a round", async () => {
      const round = await repo.createRound("2026-01-10");
      const [r1, r2] = await repo.listRooms();
      await repo.saveRoundReadings(round.id, [
        { roomId: r1.id, value: 100, baseReset: false },
        { roomId: r2.id, value: 200, baseReset: false },
      ]);
      await repo.saveRoundReadings(round.id, [{ roomId: r1.id, value: 110, baseReset: true }]);
      const rows = await repo.listReadings(round.id);
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.roomId === r1.id)).toEqual({
        roomId: r1.id,
        roundId: round.id,
        value: 110,
        baseReset: true,
      });
      expect(rows.find((r) => r.roomId === r2.id)?.value).toBe(200);
    });

    it("saveMainReadings upserts per key within a round", async () => {
      const round = await repo.createRound("2026-01-10");
      await repo.saveMainReadings(round.id, [
        { key: "block_1_4", value: 10 },
        { key: "motor", value: 20 },
      ]);
      await repo.saveMainReadings(round.id, [{ key: "motor", value: 25 }]);
      const rows = await repo.listMainReadings(round.id);
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.key === "motor")).toEqual({
        roundId: round.id,
        key: "motor",
        value: 25,
      });
    });

    it("lastReading returns the newest and respects beforeRoundId", async () => {
      const r1 = await repo.createRound("2026-01-10");
      const r3 = await repo.createRound("2026-03-10");
      const r2 = await repo.createRound("2026-02-10");
      // Fresh rooms: no readings from other tests or earlier runs on a shared store.
      const freshRoom = async () =>
        (await repo.saveRoom({ number: 100_000 + Math.floor(Math.random() * 1_000_000_000) })).id;
      const room = await freshRoom();
      const other = await freshRoom();
      expect(await repo.lastReading(room)).toBeNull();
      await repo.saveRoundReadings(r1.id, [{ roomId: room, value: 100, baseReset: false }]);
      await repo.saveRoundReadings(r2.id, [{ roomId: room, value: 150, baseReset: false }]);
      await repo.saveRoundReadings(r3.id, [{ roomId: other, value: 999, baseReset: false }]);

      expect(await repo.lastReading(room)).toBe(150);
      expect(await repo.lastReading(room, r3.id)).toBe(150);
      expect(await repo.lastReading(room, r2.id)).toBe(100);
      expect(await repo.lastReading(room, r1.id)).toBeNull();
    });

    it("settings round trip", async () => {
      const key = `rate-${crypto.randomUUID()}`;
      expect(await repo.getSetting(key)).toBeNull();
      await repo.setSetting(key, "8");
      expect(await repo.getSetting(key)).toBe("8");
      await repo.setSetting(key, "9");
      expect(await repo.getSetting(key)).toBe("9");
    });

    it("recentFailures returns failed attempts in the window for the ip", async () => {
      const ip = crypto.randomUUID();
      const otherIp = crypto.randomUUID();
      vi.useFakeTimers();
      vi.setSystemTime(1_000_000);
      await repo.recordAuthAttempt(ip, false);
      vi.setSystemTime(2_000_000);
      await repo.recordAuthAttempt(ip, false);
      await repo.recordAuthAttempt(otherIp, false);
      expect(await repo.recentFailures(ip, 0)).toEqual([1_000_000, 2_000_000]);
      expect(await repo.recentFailures(ip, 1_500_000)).toEqual([2_000_000]);
      expect(await repo.recentFailures(ip, 2_000_000)).toEqual([2_000_000]);
      expect(await repo.recentFailures(ip, 2_000_001)).toEqual([]);
    });

    it("recentFailures: a success clears earlier failures, even in the same millisecond", async () => {
      const ip = crypto.randomUUID();
      vi.useFakeTimers();
      vi.setSystemTime(1_000_000);
      await repo.recordAuthAttempt(ip, false);
      vi.setSystemTime(2_000_000);
      await repo.recordAuthAttempt(ip, false);
      await repo.recordAuthAttempt(ip, true);
      expect(await repo.recentFailures(ip, 0)).toEqual([]);
    });

    it("recentFailures: failures after a success count", async () => {
      const ip = crypto.randomUUID();
      vi.useFakeTimers();
      vi.setSystemTime(1_000_000);
      await repo.recordAuthAttempt(ip, false);
      await repo.recordAuthAttempt(ip, true);
      await repo.recordAuthAttempt(ip, false);
      vi.setSystemTime(3_000_000);
      await repo.recordAuthAttempt(ip, false);
      expect(await repo.recentFailures(ip, 0)).toEqual([1_000_000, 3_000_000]);
      expect(await repo.recentFailures(ip, 2_000_000)).toEqual([3_000_000]);
    });

    it("recentFailures: a success for one ip leaves other ips' failures alone", async () => {
      const ip = crypto.randomUUID();
      const otherIp = crypto.randomUUID();
      vi.useFakeTimers();
      vi.setSystemTime(1_000_000);
      await repo.recordAuthAttempt(otherIp, false);
      await repo.recordAuthAttempt(ip, false);
      await repo.recordAuthAttempt(ip, true);
      expect(await repo.recentFailures(otherIp, 0)).toEqual([1_000_000]);
      expect(await repo.recentFailures(ip, 0)).toEqual([]);
    });

    it("returned objects are copies; mutating them does not change stored state", async () => {
      const t = await repo.getTenant(tenantId);
      t!.name = "Hacked";
      expect((await repo.getTenant(tenantId))?.name).toBe("Asha");

      const c = await repo.addCharge(rentCharge(tenantId, "2026-01-01"));
      c.amount = 1;
      (await repo.listCharges(tenantId))[0].amount = 2;
      expect((await repo.listCharges(tenantId))[0].amount).toBe(5000);

      const p = await repo.addPayment(payment(tenantId, 1000), "key-1");
      p.amount = 1;
      expect((await repo.listPayments(tenantId))[0].amount).toBe(1000);
    });
  });
}
