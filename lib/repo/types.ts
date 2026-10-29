import type { Charge, Payment } from "../ledger";

export const MAIN_METER_KEYS = [
  "block_1_4",
  "block_5_8",
  "block_9_12",
  "block_13_16",
  "inverter",
  "motor",
] as const;
export type MainMeterKey = (typeof MAIN_METER_KEYS)[number];

export type Room = { id: string; number: number; label?: string };

export type Tenant = {
  id: string;
  roomId: string;
  name: string;
  rentAmount: number;
  cycleStartDay: number;
  startedOn: string;
  leftOn?: string | null;
};

export type RepoCharge = Charge & {
  tenantId: string;
  periodStart?: string;
  roundId?: string;
  rate?: number;
  prevReading?: number;
  currReading?: number;
  units?: number;
};

export type RepoPayment = Payment & {
  tenantId: string;
  cash: number;
  upi: number;
  note?: string;
  idemKey: string;
};

export type Round = { id: string; date: string; status: "open" | "done" };

export type Reading = { roomId: string; roundId: string; value: number; baseReset: boolean };

export type MainReading = { roundId: string; key: MainMeterKey; value: number };

export interface Repo {
  listRooms(): Promise<Room[]>;
  saveRoom(r: Omit<Room, "id"> & { id?: string }): Promise<Room>;

  listTenants(opts?: { activeOnly?: boolean }): Promise<Tenant[]>;
  getTenant(id: string): Promise<Tenant | null>;
  saveTenant(t: Omit<Tenant, "id"> & { id?: string }): Promise<Tenant>;
  /** Sets leftOn; the tenant's charges and payments stay. */
  vacateTenant(id: string, on: string): Promise<void>;

  listCharges(tenantId: string): Promise<RepoCharge[]>;
  /**
   * Idempotent on tenantId + kind + periodStart (rent), roundId (light) or
   * "opening:" + openingFor (opening). A repeat returns the existing charge.
   * Throws when the discriminator is missing (rent without periodStart, light without roundId).
   */
  addCharge(c: Omit<RepoCharge, "id">): Promise<RepoCharge>;
  /**
   * Hard delete of one charge (a rent charge created by a wrong cycle, move-in or leave date).
   * Its dedupe key is free again afterwards. Throws when the id is unknown.
   */
  deleteCharge(id: string): Promise<void>;

  /** Includes soft-deleted payments (deletedAt set). */
  listPayments(tenantId: string): Promise<RepoPayment[]>;
  /** A repeated idemKey returns the existing payment and stores nothing new. */
  addPayment(p: Omit<RepoPayment, "id" | "idemKey">, idemKey: string): Promise<RepoPayment>;
  /** An empty note clears it. Throws when the id is unknown. */
  updatePayment(
    id: string,
    patch: Partial<Omit<RepoPayment, "id" | "idemKey" | "tenantId">>,
  ): Promise<RepoPayment>;
  /**
   * Soft delete: sets deletedAt to `on` (YYYY-MM-DD; callers pass today in India), or to
   * today's UTC date when `on` is left out. Throws when the id is unknown.
   */
  deletePayment(id: string, on?: string): Promise<void>;

  createRound(date: string): Promise<Round>;
  getRound(id: string): Promise<Round | null>;
  /** Newest date first; rounds on the same date list the later-created one first. */
  listRounds(): Promise<Round[]>;
  /** Upsert per room within the round. */
  saveRoundReadings(roundId: string, rows: Omit<Reading, "roundId">[]): Promise<void>;
  /** Upsert per key within the round. */
  saveMainReadings(roundId: string, rows: Omit<MainReading, "roundId">[]): Promise<void>;
  listReadings(roundId: string): Promise<Reading[]>;
  listMainReadings(roundId: string): Promise<MainReading[]>;
  finishRound(roundId: string): Promise<void>;
  /**
   * Value from the newest round that has a reading for the room. With
   * beforeRoundId, only rounds strictly older than that round count.
   */
  lastReading(roomId: string, beforeRoundId?: string): Promise<number | null>;

  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;

  recordAuthAttempt(ip: string, ok: boolean): Promise<void>;
  /**
   * Epoch-ms timestamps of failed attempts for the ip at or after sinceMs that were recorded
   * after the ip's most recent successful attempt. A success clears every earlier failure,
   * including one recorded in the same millisecond: order is insertion order, not the clock.
   */
  recentFailures(ip: string, sinceMs: number): Promise<number[]>;
}
