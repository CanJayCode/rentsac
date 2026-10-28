import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chargeDedupeKey } from "./charge-key";
import type {
  MainMeterKey,
  MainReading,
  Reading,
  Repo,
  RepoCharge,
  RepoPayment,
  Room,
  Round,
  Tenant,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
type Query = PromiseLike<{ data: any; error: { code?: string; message: string } | null }>;

const UNIQUE_VIOLATION = "23505";

const today = () => new Date().toISOString().slice(0, 10);

// Row <-> type mappers: the only place snake_case column names appear.
const toRoom = (r: Row): Room => ({
  id: r.id,
  number: r.number,
  ...(r.label != null ? { label: r.label } : {}),
});

const toTenant = (r: Row): Tenant => ({
  id: r.id,
  roomId: r.room_id,
  name: r.name,
  rentAmount: r.rent_amount,
  cycleStartDay: r.cycle_start_day,
  startedOn: r.started_on,
  leftOn: r.left_on,
});

const toCharge = (r: Row): RepoCharge => ({
  id: r.id,
  tenantId: r.tenant_id,
  kind: r.kind,
  dueDate: r.due_date,
  amount: r.amount,
  ...(r.opening_for != null ? { openingFor: r.opening_for } : {}),
  ...(r.period_start != null ? { periodStart: r.period_start } : {}),
  ...(r.round_id != null ? { roundId: r.round_id } : {}),
  ...(r.rate != null ? { rate: r.rate } : {}),
  ...(r.prev_reading != null ? { prevReading: Number(r.prev_reading) } : {}),
  ...(r.curr_reading != null ? { currReading: Number(r.curr_reading) } : {}),
  ...(r.units != null ? { units: Number(r.units) } : {}),
});

const toPayment = (r: Row): RepoPayment => ({
  id: r.id,
  tenantId: r.tenant_id,
  paidOn: r.paid_on,
  amount: r.amount,
  target: r.target,
  cash: r.cash,
  upi: r.upi,
  idemKey: r.idem_key,
  ...(r.note != null ? { note: r.note } : {}),
  ...(r.deleted_at != null ? { deletedAt: r.deleted_at } : {}),
});

const toRound = (r: Row): Round => ({ id: r.id, date: r.date, status: r.status });

const toReading = (r: Row): Reading => ({
  roomId: r.room_id,
  roundId: r.round_id,
  value: Number(r.value),
  baseReset: r.base_reset,
});

const toMainReading = (r: Row): MainReading => ({
  roundId: r.round_id,
  key: r.key as MainMeterKey,
  value: Number(r.value),
});

/** Drops undefined values, so omitted fields keep their stored value on update. */
function defined(row: Row): Row {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
}

function createClientFromEnv(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export function createSupabaseRepo(db: SupabaseClient = createClientFromEnv()): Repo {
  async function list(q: Query, what: string): Promise<Row[]> {
    const { data, error } = await q;
    if (error) throw new Error(`${what}: ${error.message}`);
    return data ?? [];
  }

  async function maybeOne(q: Query, what: string): Promise<Row | null> {
    const { data, error } = await q;
    if (error) throw new Error(`${what}: ${error.message}`);
    return data ?? null;
  }

  async function mustOne(q: Query, what: string, id: string): Promise<Row> {
    const row = await maybeOne(q, what);
    if (!row) throw new Error(`${what} ${id} not found`);
    return row;
  }

  const requireRound = async (id: string) => {
    await mustOne(db.from("rounds").select("id").eq("id", id).maybeSingle(), "Round", id);
  };

  // Newest date first, ties by created_at: the exact order the memory repo produces.
  async function listRounds(): Promise<Round[]> {
    const data = await list(
      db
        .from("rounds")
        .select("id,date,status")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
      "listRounds",
    );
    return data.map(toRound);
  }

  return {
    async listRooms() {
      return (await list(db.from("rooms").select("*").order("number"), "listRooms")).map(toRoom);
    },
    async saveRoom(r) {
      const row = defined({ id: r.id, number: r.number, label: r.label });
      const q = r.id
        ? db.from("rooms").upsert(row, { onConflict: "id" })
        : db.from("rooms").insert(row);
      return toRoom((await maybeOne(q.select().single(), "saveRoom"))!);
    },

    async listTenants(opts) {
      let q = db.from("tenants").select("*").order("started_on").order("id");
      if (opts?.activeOnly) q = q.is("left_on", null);
      return (await list(q, "listTenants")).map(toTenant);
    },
    async getTenant(id) {
      const row = await maybeOne(
        db.from("tenants").select("*").eq("id", id).maybeSingle(),
        "getTenant",
      );
      return row ? toTenant(row) : null;
    },
    async saveTenant(t) {
      const row = defined({
        id: t.id,
        room_id: t.roomId,
        name: t.name,
        rent_amount: t.rentAmount,
        cycle_start_day: t.cycleStartDay,
        started_on: t.startedOn,
        left_on: t.leftOn,
      });
      const q = t.id
        ? db.from("tenants").upsert(row, { onConflict: "id" })
        : db.from("tenants").insert(row);
      return toTenant((await maybeOne(q.select().single(), "saveTenant"))!);
    },
    async vacateTenant(id, on) {
      await mustOne(
        db.from("tenants").update({ left_on: on }).eq("id", id).select("id").maybeSingle(),
        "Tenant",
        id,
      );
    },

    async listCharges(tenantId) {
      const data = await list(
        db.from("charges").select("*").eq("tenant_id", tenantId).order("created_at").order("id"),
        "listCharges",
      );
      return data.map(toCharge);
    },
    async addCharge(c) {
      const dedupeKey = chargeDedupeKey(c);
      const { data, error } = await db
        .from("charges")
        .insert({
          tenant_id: c.tenantId,
          kind: c.kind,
          due_date: c.dueDate,
          amount: c.amount,
          opening_for: c.openingFor,
          period_start: c.periodStart,
          round_id: c.roundId,
          rate: c.rate,
          prev_reading: c.prevReading,
          curr_reading: c.currReading,
          units: c.units,
          dedupe_key: dedupeKey,
        })
        .select()
        .single();
      if (!error) return toCharge(data);
      if (error.code !== UNIQUE_VIOLATION) throw new Error(`addCharge: ${error.message}`);
      return toCharge(
        await mustOne(
          db
            .from("charges")
            .select("*")
            .eq("tenant_id", c.tenantId)
            .eq("dedupe_key", dedupeKey)
            .maybeSingle(),
          "Charge",
          dedupeKey,
        ),
      );
    },

    async listPayments(tenantId) {
      const data = await list(
        db.from("payments").select("*").eq("tenant_id", tenantId).order("created_at").order("id"),
        "listPayments",
      );
      return data.map(toPayment);
    },
    async addPayment(p, idemKey) {
      const { data, error } = await db
        .from("payments")
        .insert({
          tenant_id: p.tenantId,
          paid_on: p.paidOn,
          amount: p.amount,
          target: p.target,
          cash: p.cash,
          upi: p.upi,
          note: p.note,
          deleted_at: p.deletedAt,
          idem_key: idemKey,
        })
        .select()
        .single();
      if (!error) return toPayment(data);
      if (error.code !== UNIQUE_VIOLATION) throw new Error(`addPayment: ${error.message}`);
      return toPayment(
        await mustOne(
          db.from("payments").select("*").eq("idem_key", idemKey).maybeSingle(),
          "Payment",
          idemKey,
        ),
      );
    },
    async updatePayment(id, patch) {
      const row = defined({
        paid_on: patch.paidOn,
        amount: patch.amount,
        target: patch.target,
        cash: patch.cash,
        upi: patch.upi,
        note: patch.note,
        deleted_at: patch.deletedAt,
      });
      const q =
        Object.keys(row).length > 0
          ? db.from("payments").update(row).eq("id", id).select().maybeSingle()
          : db.from("payments").select("*").eq("id", id).maybeSingle();
      return toPayment(await mustOne(q, "Payment", id));
    },
    async deletePayment(id) {
      await mustOne(
        db.from("payments").update({ deleted_at: today() }).eq("id", id).select("id").maybeSingle(),
        "Payment",
        id,
      );
    },

    async createRound(date) {
      return toRound(
        (await maybeOne(db.from("rounds").insert({ date }).select().single(), "createRound"))!,
      );
    },
    async getRound(id) {
      const row = await maybeOne(
        db.from("rounds").select("id,date,status").eq("id", id).maybeSingle(),
        "getRound",
      );
      return row ? toRound(row) : null;
    },
    listRounds,
    async saveRoundReadings(roundId, rows) {
      await requireRound(roundId);
      const byRoom = new Map(
        rows.map((r) => [
          r.roomId,
          { round_id: roundId, room_id: r.roomId, value: r.value, base_reset: r.baseReset },
        ]),
      );
      if (byRoom.size === 0) return;
      await list(
        db.from("readings").upsert([...byRoom.values()], { onConflict: "round_id,room_id" }),
        "saveRoundReadings",
      );
    },
    async saveMainReadings(roundId, rows) {
      await requireRound(roundId);
      const byKey = new Map(
        rows.map((r) => [r.key, { round_id: roundId, key: r.key, value: r.value }]),
      );
      if (byKey.size === 0) return;
      await list(
        db.from("main_readings").upsert([...byKey.values()], { onConflict: "round_id,key" }),
        "saveMainReadings",
      );
    },
    async listReadings(roundId) {
      const data = await list(db.from("readings").select("*").eq("round_id", roundId), "listReadings");
      return data.map(toReading);
    },
    async listMainReadings(roundId) {
      const data = await list(
        db.from("main_readings").select("*").eq("round_id", roundId),
        "listMainReadings",
      );
      return data.map(toMainReading);
    },
    async finishRound(roundId) {
      await mustOne(
        db.from("rounds").update({ status: "done" }).eq("id", roundId).select("id").maybeSingle(),
        "Round",
        roundId,
      );
    },
    async lastReading(roomId, beforeRoundId) {
      let candidates = await listRounds(); // newest first
      if (beforeRoundId) {
        const at = candidates.findIndex((r) => r.id === beforeRoundId);
        candidates = at === -1 ? [] : candidates.slice(at + 1);
      }
      if (candidates.length === 0) return null;
      const data = await list(
        db
          .from("readings")
          .select("round_id,value")
          .eq("room_id", roomId)
          .in(
            "round_id",
            candidates.map((r) => r.id),
          ),
        "lastReading",
      );
      const valueByRound = new Map(data.map((r) => [r.round_id as string, Number(r.value)]));
      for (const round of candidates) {
        const v = valueByRound.get(round.id);
        if (v !== undefined) return v;
      }
      return null;
    },

    async getSetting(key) {
      const row = await maybeOne(
        db.from("settings").select("value").eq("key", key).maybeSingle(),
        "getSetting",
      );
      return row ? (row.value as string) : null;
    },
    async setSetting(key, value) {
      await list(db.from("settings").upsert({ key, value }, { onConflict: "key" }), "setSetting");
    },

    async recordAuthAttempt(ip, ok) {
      await list(
        db.from("auth_attempts").insert({ ip, ok, at: new Date().toISOString() }),
        "recordAuthAttempt",
      );
    },
    async recentFailures(ip, sinceMs) {
      const data = await list(
        db
          .from("auth_attempts")
          .select("at")
          .eq("ip", ip)
          .eq("ok", false)
          .gte("at", new Date(sinceMs).toISOString())
          .order("at"),
        "recentFailures",
      );
      return data.map((r) => Date.parse(r.at));
    },
  };
}
