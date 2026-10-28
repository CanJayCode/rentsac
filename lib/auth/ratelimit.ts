// PIN lockout: 5 or more failures inside 10 minutes locks the client until
// 10 minutes after its most recent failure.

export const LOCKOUT_LIMIT = 5;
export const LOCKOUT_WINDOW_MS = 10 * 60 * 1000;
/**
 * How far back callers should fetch failures. A lock lasts until 10 minutes after the
 * last failure, and the failures that triggered it can start up to 10 minutes before
 * that, so 20 minutes of history is needed to keep the lock for its full length.
 */
export const LOCKOUT_LOOKBACK_MS = 2 * LOCKOUT_WINDOW_MS;

/** The client IP used as the rate-limit key: first `x-forwarded-for` value, else "unknown". */
export function clientIp(headers: Pick<Headers, "get">): string {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first ? first.slice(0, 64) : "unknown";
}

export function lockoutState(failures: number[], now: number): { locked: boolean; retryInMs: number } {
  const past = failures.filter((t) => Number.isFinite(t) && t <= now);
  if (past.length < LOCKOUT_LIMIT) return { locked: false, retryInMs: 0 };
  const last = Math.max(...past);
  const until = last + LOCKOUT_WINDOW_MS;
  if (now >= until) return { locked: false, retryInMs: 0 };
  const inWindow = past.filter((t) => t > last - LOCKOUT_WINDOW_MS).length;
  if (inWindow < LOCKOUT_LIMIT) return { locked: false, retryInMs: 0 };
  return { locked: true, retryInMs: until - now };
}
