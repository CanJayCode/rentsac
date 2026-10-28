"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionSecret, SESSION_COOKIE, SESSION_MAX_AGE_MS, SESSION_MAX_AGE_S } from "../../lib/auth/cookie";
import { hashPin, isValidPin, verifyPin } from "../../lib/auth/pin";
import {
  clientIp,
  LOCKOUT_LIMIT,
  LOCKOUT_LOOKBACK_MS,
  LOCKOUT_WINDOW_MS,
  lockoutState,
} from "../../lib/auth/ratelimit";
import { signSession } from "../../lib/auth/session";
import { getRepo } from "../../lib/repo";

export type AuthResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "format" | "mismatch" | "setup-code" | "already-set" | "not-set" }
  | { ok: false; error: "locked"; retryInSeconds: number };

const PIN_HASH_KEY = "pin_hash";

/** Lock state from the failures already on record (no new attempt). */
async function currentLockout(ip: string) {
  const repo = await getRepo();
  const now = Date.now();
  return lockoutState(await repo.recentFailures(ip, now - LOCKOUT_LOOKBACK_MS), now);
}

/**
 * Ruling O: record the attempt as a failure first, then count, then decide whether it may be
 * checked at all. Concurrent requests each see their own record, so a burst cannot get more
 * than LOCKOUT_LIMIT checks: the request whose record is the n-th sees at least n failures.
 * Returns a locked result when the attempt must be refused without checking, else null.
 * A later recordAuthAttempt(ip, true) clears this pending failure.
 */
async function beginAttempt(ip: string): Promise<AuthResult | null> {
  const repo = await getRepo();
  await repo.recordAuthAttempt(ip, false);
  const now = Date.now();
  const failures = await repo.recentFailures(ip, now - LOCKOUT_LOOKBACK_MS);
  const inWindow = failures.filter((t) => t > now - LOCKOUT_WINDOW_MS).length;
  // Locked by the failures before this attempt (drop one newest entry: this attempt's own).
  const prior = [...failures].sort((a, b) => a - b).slice(0, -1);
  if (lockoutState(prior, now).locked || inWindow > LOCKOUT_LIMIT) {
    return lockedResult(Math.max(lockoutState(failures, now).retryInMs, 1000));
  }
  return null;
}

/** After a checked attempt failed: locked if this failure completed a lockout, else null. */
async function afterFailure(ip: string): Promise<AuthResult | null> {
  const lock = await currentLockout(ip);
  return lock.locked ? lockedResult(lock.retryInMs) : null;
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
  const ip = clientIp(await headers());
  const repo = await getRepo();

  // Neither of these checks anything secret, so they come before the attempt is counted.
  if (!isValidPin(pin)) return { ok: false, error: "format" };
  const stored = await repo.getSetting(PIN_HASH_KEY);
  if (!stored) return { ok: false, error: "not-set" };

  const refused = await beginAttempt(ip);
  if (refused) return refused;

  if (!(await verifyPin(pin, stored))) return (await afterFailure(ip)) ?? { ok: false, error: "invalid" };

  await repo.recordAuthAttempt(ip, true);
  await startSession(Date.now());
  return { ok: true };
}

export async function setupPin(pin: unknown, confirm: unknown, setupCode?: unknown): Promise<AuthResult> {
  getSessionSecret();
  const ip = clientIp(await headers());
  const repo = await getRepo();

  if (await repo.getSetting(PIN_HASH_KEY)) return { ok: false, error: "already-set" };

  const required = process.env.SETUP_CODE?.trim();
  if (required) {
    const refused = await beginAttempt(ip);
    if (refused) return refused;
    if (typeof setupCode !== "string" || !safeEqual(setupCode.trim(), required)) {
      return (await afterFailure(ip)) ?? { ok: false, error: "setup-code" };
    }
    await repo.recordAuthAttempt(ip, true);
  }

  if (!isValidPin(pin) || !isValidPin(confirm)) return { ok: false, error: "format" };
  if (!safeEqual(pin, confirm)) return { ok: false, error: "mismatch" };

  const hash = await hashPin(pin);
  // Re-check just before writing so a second, slower setup cannot overwrite the first.
  if (await repo.getSetting(PIN_HASH_KEY)) return { ok: false, error: "already-set" };
  await repo.setSetting(PIN_HASH_KEY, hash);

  await startSession(Date.now());
  return { ok: true };
}

// Logout is deliberately not gated by assertSessionAction(): clearing a cookie is harmless
// without a session, and an expired session must still be able to log out cleanly.
export async function lock(): Promise<never> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/lock");
}
