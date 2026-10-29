import { getRepo } from "../repo";
import { LOCKOUT_LIMIT, LOCKOUT_LOOKBACK_MS, LOCKOUT_WINDOW_MS, lockoutState } from "./ratelimit";

export type LockedResult = { ok: false; error: "locked"; retryInSeconds: number };

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
export async function beginAttempt(ip: string): Promise<LockedResult | null> {
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
export async function afterFailure(ip: string): Promise<LockedResult | null> {
  const lock = await currentLockout(ip);
  return lock.locked ? lockedResult(lock.retryInMs) : null;
}

function lockedResult(retryInMs: number): LockedResult {
  return { ok: false, error: "locked", retryInSeconds: Math.max(1, Math.ceil(retryInMs / 1000)) };
}
