"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertSessionAction } from "@/lib/auth/require-session";
import type { Key } from "@/lib/i18n";
import { getRepo } from "@/lib/repo";
import { MAIN_METER_KEYS, type MainMeterKey } from "@/lib/repo/types";
import { saveRound, validateRoundDate, type RoundInput, type RoundState } from "@/lib/rounds";
import { getRate } from "@/lib/settings";
import { todayIST } from "@/lib/today";

export type StartState = { error?: Key; date?: string };

function field(data: FormData, name: string): string {
  const v = data.get(name);
  return typeof v === "string" ? v : "";
}

/** Creates a round for the chosen date and opens it. A repeated tap reuses the round it just made. */
export async function startRound(_prev: StartState, data: FormData): Promise<StartState> {
  await assertSessionAction();
  const date = field(data, "date").trim();
  const repo = await getRepo();
  const [newest] = await repo.listRounds();
  const error = validateRoundDate(date, todayIST(), newest?.date ?? null);
  if (error) return { error, date };

  // A double tap or a resubmit on slow data: the newest round is this date's, open and still empty.
  if (newest && newest.date === date && newest.status === "open") {
    const [readings, mains] = await Promise.all([repo.listReadings(newest.id), repo.listMainReadings(newest.id)]);
    if (readings.length === 0 && mains.length === 0) redirect(`/readings/${newest.id}`);
  }

  const round = await repo.createRound(date);
  revalidatePath("/readings");
  redirect(`/readings/${round.id}`);
}

/** Saves what was typed in a round (rows left empty stay unread) and bills the rooms read. */
export async function saveRoundAction(_prev: RoundState, data: FormData): Promise<RoundState> {
  await assertSessionAction();
  const roundId = field(data, "roundId");
  const input: RoundInput = { rows: [], main: [] };
  for (const [name, value] of data.entries()) {
    if (typeof value !== "string") continue;
    if (name.startsWith("r:")) {
      const roomId = name.slice(2);
      input.rows.push({ roomId, raw: value, confirmed: field(data, `c:${roomId}`) === value && value !== "" });
    } else if (name.startsWith("m:")) {
      const key = name.slice(2) as MainMeterKey;
      if (!MAIN_METER_KEYS.includes(key)) continue;
      input.main.push({ key, raw: value, confirmed: field(data, `mc:${key}`) === value && value !== "" });
    }
  }

  const repo = await getRepo();
  const result = await saveRound(repo, roundId, input, await getRate(repo));
  if (!result.ok) return { errors: result.errors, formError: result.formError ?? "readings.error.rows" };

  revalidatePath("/", "layout");
  // A fresh value each time, so the screen reloads from what was stored.
  redirect(`/readings/${roundId}?saved=${Date.now().toString(36)}`);
}
