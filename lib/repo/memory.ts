import type {
  MainReading,
  Reading,
  Repo,
  RepoCharge,
  RepoPayment,
  Room,
  Round,
  Tenant,
} from "./types";

const copy = <T extends object>(x: T): T => ({ ...x });

function chargeKey(c: Omit<RepoCharge, "id">): string {
  const discriminator =
    c.kind === "rent"
      ? c.periodStart
      : c.kind === "light"
        ? c.roundId
        : `opening:${c.openingFor ?? "rent"}`;
  return `${c.tenantId}|${c.kind}|${discriminator}`;
}

export function createMemoryRepo(): Repo {
  const rooms: Room[] = Array.from({ length: 16 }, (_, i) => ({
    id: crypto.randomUUID(),
    number: i + 1,
  }));
  const tenants: Tenant[] = [];
  const charges: RepoCharge[] = [];
  const payments: RepoPayment[] = [];
  const rounds: Round[] = [];
  const readings: Reading[] = [];
  const mainReadings: MainReading[] = [];
  const settings = new Map<string, string>();
  const attempts: { ip: string; ok: boolean; at: number }[] = [];

  // Rounds in age order: by date, ties by creation order.
  const roundsOldestFirst = () =>
    rounds
      .map((r, i) => ({ r, i }))
      .sort((a, b) => (a.r.date < b.r.date ? -1 : a.r.date > b.r.date ? 1 : a.i - b.i))
      .map((x) => x.r);

  function upsert<T extends { id: string }>(list: T[], item: Omit<T, "id"> & { id?: string }): T {
    const existing = item.id ? list.find((x) => x.id === item.id) : undefined;
    if (existing) {
      Object.assign(existing, item);
      return existing;
    }
    const created = { ...item, id: item.id ?? crypto.randomUUID() } as T;
    list.push(created);
    return created;
  }

  function need<T>(found: T | undefined, what: string, id: string): T {
    if (!found) throw new Error(`${what} ${id} not found`);
    return found;
  }

  return {
    async listRooms() {
      return rooms.map(copy);
    },
    async saveRoom(r) {
      return copy(upsert(rooms, r));
    },

    async listTenants(opts) {
      return tenants.filter((t) => !opts?.activeOnly || !t.leftOn).map(copy);
    },
    async getTenant(id) {
      const t = tenants.find((x) => x.id === id);
      return t ? copy(t) : null;
    },
    async saveTenant(t) {
      return copy(upsert(tenants, t));
    },
    async vacateTenant(id, on) {
      need(tenants.find((t) => t.id === id), "Tenant", id).leftOn = on;
    },

    async listCharges(tenantId) {
      return charges.filter((c) => c.tenantId === tenantId).map(copy);
    },
    async addCharge(c) {
      const key = chargeKey(c);
      const existing = charges.find((x) => chargeKey(x) === key);
      if (existing) return copy(existing);
      const created: RepoCharge = { ...c, id: crypto.randomUUID() };
      charges.push(created);
      return copy(created);
    },

    async listPayments(tenantId) {
      return payments.filter((p) => p.tenantId === tenantId).map(copy);
    },
    async addPayment(p, idemKey) {
      const existing = payments.find((x) => x.idemKey === idemKey);
      if (existing) return copy(existing);
      const created: RepoPayment = { ...p, id: crypto.randomUUID(), idemKey };
      payments.push(created);
      return copy(created);
    },
    async updatePayment(id, patch) {
      const p = need(payments.find((x) => x.id === id), "Payment", id);
      Object.assign(p, patch);
      return copy(p);
    },
    async deletePayment(id) {
      need(payments.find((x) => x.id === id), "Payment", id).deletedAt = new Date()
        .toISOString()
        .slice(0, 10);
    },

    async createRound(date) {
      const round: Round = { id: crypto.randomUUID(), date, status: "open" };
      rounds.push(round);
      return copy(round);
    },
    async getRound(id) {
      const r = rounds.find((x) => x.id === id);
      return r ? copy(r) : null;
    },
    async listRounds() {
      return roundsOldestFirst().reverse().map(copy);
    },
    async saveRoundReadings(roundId, rows) {
      need(rounds.find((r) => r.id === roundId), "Round", roundId);
      for (const row of rows) {
        const existing = readings.find((x) => x.roundId === roundId && x.roomId === row.roomId);
        if (existing) Object.assign(existing, row);
        else readings.push({ ...row, roundId });
      }
    },
    async saveMainReadings(roundId, rows) {
      need(rounds.find((r) => r.id === roundId), "Round", roundId);
      for (const row of rows) {
        const existing = mainReadings.find((x) => x.roundId === roundId && x.key === row.key);
        if (existing) existing.value = row.value;
        else mainReadings.push({ ...row, roundId });
      }
    },
    async listReadings(roundId) {
      return readings.filter((r) => r.roundId === roundId).map(copy);
    },
    async listMainReadings(roundId) {
      return mainReadings.filter((r) => r.roundId === roundId).map(copy);
    },
    async finishRound(roundId) {
      need(rounds.find((r) => r.id === roundId), "Round", roundId).status = "done";
    },
    async lastReading(roomId, beforeRoundId) {
      let candidates = roundsOldestFirst();
      if (beforeRoundId) {
        const at = candidates.findIndex((r) => r.id === beforeRoundId);
        candidates = at === -1 ? [] : candidates.slice(0, at);
      }
      for (let i = candidates.length - 1; i >= 0; i--) {
        const hit = readings.find((x) => x.roundId === candidates[i].id && x.roomId === roomId);
        if (hit) return hit.value;
      }
      return null;
    },

    async getSetting(key) {
      return settings.get(key) ?? null;
    },
    async setSetting(key, value) {
      settings.set(key, value);
    },

    async recordAuthAttempt(ip, ok) {
      attempts.push({ ip, ok, at: Date.now() });
    },
    async recentFailures(ip, sinceMs) {
      return attempts.filter((a) => a.ip === ip && !a.ok && a.at >= sinceMs).map((a) => a.at);
    },
  };
}
