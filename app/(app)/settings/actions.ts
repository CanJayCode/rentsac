"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { afterFailure, beginAttempt } from "@/lib/auth/attempts";
import { hashPin, isValidPin, verifyPin } from "@/lib/auth/pin";
import { clientIp } from "@/lib/auth/ratelimit";
import { assertSessionAction } from "@/lib/auth/require-session";
import type { Key } from "@/lib/i18n";
import { getRepo } from "@/lib/repo";
import { parseRate } from "@/lib/settings";

export type RateState = { error?: Key; value?: string; saved?: number };
export type PinState = { error?: Key; minutes?: number; done?: boolean };

function field(data: FormData, name: string): string {
  const v = data.get(name);
  return typeof v === "string" ? v : "";
}

function lockedState(retryInSeconds: number): PinState {
  return { error: "settings.pin.error.locked", minutes: Math.max(1, Math.ceil(retryInSeconds / 60)) };
}

/** Light rate for rounds saved from now on. Bills already made keep the rate stored with them. */
export async function saveRate(_prev: RateState, data: FormData): Promise<RateState> {
  await assertSessionAction();
  const value = field(data, "rate");
  const rate = parseRate(value);
  if (rate === null) return { error: "settings.rate.error", value };

  await (await getRepo()).setSetting("rate", String(rate));
  revalidatePath("/settings");
  return { saved: rate };
}

/** Changes the PIN after checking the old one with the lock screen's attempt limit. The session stays as it is. */
export async function changePin(_prev: PinState, data: FormData): Promise<PinState> {
  await assertSessionAction();
  const [oldPin, newPin, confirm] = [field(data, "oldPin"), field(data, "newPin"), field(data, "confirmPin")];
  if (!isValidPin(oldPin) || !isValidPin(newPin) || !isValidPin(confirm)) return { error: "settings.pin.error.format" };
  if (newPin !== confirm) return { error: "settings.pin.error.mismatch" };

  const repo = await getRepo();
  const stored = await repo.getSetting("pin_hash");
  if (!stored) return { error: "settings.pin.error.failed" };

  const ip = clientIp(await headers());
  const refused = await beginAttempt(ip);
  if (refused) return lockedState(refused.retryInSeconds);
  if (!(await verifyPin(oldPin, stored))) {
    const locked = await afterFailure(ip);
    return locked ? lockedState(locked.retryInSeconds) : { error: "settings.pin.error.wrong" };
  }

  await repo.recordAuthAttempt(ip, true);
  await repo.setSetting("pin_hash", await hashPin(newPin));
  return { done: true };
}
