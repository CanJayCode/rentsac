"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionSecret, SESSION_COOKIE, SESSION_MAX_AGE_MS, SESSION_MAX_AGE_S } from "../../lib/auth/cookie";
import { hashPin, isValidPin, verifyPin } from "../../lib/auth/pin";
import { clientIp, LOCKOUT_LOOKBACK_MS, lockoutState } from "../../lib/auth/ratelimit";
import { signSession } from "../../lib/auth/session";
import { getRepo } from "../../lib/repo";

export type AuthResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "format" | "mismatch" | "setup-code" | "already-set" | "not-set" }
  | { ok: false; error: "locked"; retryInSeconds: number };

const PIN_HASH_KEY = "pin_hash";

async function currentLockout(ip: string, now: number) {
  const repo = await getRepo();
  return lockoutState(await repo.recentFailures(ip, now - LOCKOUT_LOOKBACK_MS), now);
}

function lockedResult(retryInMs: number): AuthResult {
  return { ok: false, error: "locked", retryInSeconds: Math.max(1, Math.ceil(retryInMs / 1000)) };
}

async function startSession(now: number): Promise<void> {
  // Read the secret first so a missing SESSION_SECRET fails loudly before anything is set.
  const token = await signSession(now + SESSION_MAX_AGE_MS, getSessionSecret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

/** Constant-time string compare (hashing first makes lengths equal). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function unlock(pin: unknown): Promise<AuthResult> {
  getSessionSecret();
  const now = Date.now();
  const ip = clientIp(await headers());

  const lock = await currentLockout(ip, now);
  if (lock.locked) return lockedResult(lock.retryInMs);

  if (!isValidPin(pin)) return { ok: false, error: "format" };

  const repo = await getRepo();
  const stored = await repo.getSetting(PIN_HASH_KEY);
  if (!stored) return { ok: false, error: "not-set" };

  if (!(await verifyPin(pin, stored))) {
    await repo.recordAuthAttempt(ip, false);
    const after = await currentLockout(ip, Date.now());
    return after.locked ? lockedResult(after.retryInMs) : { ok: false, error: "invalid" };
  }

  await repo.recordAuthAttempt(ip, true);
  await startSession(now);
  return { ok: true };
}

export async function setupPin(pin: unknown, confirm: unknown, setupCode?: unknown): Promise<AuthResult> {
  getSessionSecret();
  const now = Date.now();
  const ip = clientIp(await headers());
  const repo = await getRepo();

  if (await repo.getSetting(PIN_HASH_KEY)) return { ok: false, error: "already-set" };

  const lock = await currentLockout(ip, now);
  if (lock.locked) return lockedResult(lock.retryInMs);

  const required = process.env.SETUP_CODE?.trim();
  if (required) {
    if (typeof setupCode !== "string" || !safeEqual(setupCode.trim(), required)) {
      await repo.recordAuthAttempt(ip, false);
      const after = await currentLockout(ip, Date.now());
      return after.locked ? lockedResult(after.retryInMs) : { ok: false, error: "setup-code" };
    }
  }

  if (!isValidPin(pin) || !isValidPin(confirm)) return { ok: false, error: "format" };
  if (!safeEqual(pin, confirm)) return { ok: false, error: "mismatch" };

  const hash = await hashPin(pin);
  // Re-check just before writing so a second, slower setup cannot overwrite the first.
  if (await repo.getSetting(PIN_HASH_KEY)) return { ok: false, error: "already-set" };
  await repo.setSetting(PIN_HASH_KEY, hash);

  await startSession(now);
  return { ok: true };
}

export async function lock(): Promise<never> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/lock");
}
