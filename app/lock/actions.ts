"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionSecret, SESSION_COOKIE, SESSION_MAX_AGE_MS, SESSION_MAX_AGE_S } from "../../lib/auth/cookie";
import { hashPin, isValidPin, verifyPin } from "../../lib/auth/pin";
import { afterFailure, beginAttempt, type LockedResult } from "../../lib/auth/attempts";
import { clientIp } from "../../lib/auth/ratelimit";
import { signSession } from "../../lib/auth/session";
import { getRepo } from "../../lib/repo";

export type AuthResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "format" | "mismatch" | "setup-code" | "already-set" | "not-set" }
  | LockedResult;

const PIN_HASH_KEY = "pin_hash";

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
