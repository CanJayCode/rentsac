import type { Metadata } from "next";
import { headers } from "next/headers";
import { getSessionSecret } from "@/lib/auth/cookie";
import { clientIp, LOCKOUT_LOOKBACK_MS, lockoutState } from "@/lib/auth/ratelimit";
import { getRepo } from "@/lib/repo";
import { LockScreen } from "./LockScreen";

export const metadata: Metadata = { title: "Rentsac" };

/** Request-time state for the lock screen (kept out of the component body: it reads the clock). */
async function loadLockState() {
  // Fail loudly on a missing SESSION_SECRET before showing a form that cannot work.
  getSessionSecret();
  const now = Date.now();

  const repo = await getRepo();
  const hasPin = Boolean(await repo.getSetting("pin_hash"));
  const ip = clientIp(await headers());
  const lock = lockoutState(await repo.recentFailures(ip, now - LOCKOUT_LOOKBACK_MS), now);

  return {
    hasPin,
    // Only whether a code is needed reaches the browser, never the code itself.
    setupCodeRequired: !hasPin && Boolean(process.env.SETUP_CODE?.trim()),
    retryInMs: lock.locked ? lock.retryInMs : 0,
  };
}

// A signed-in visit to /lock is not redirected here: a server action that sets the cookie
// refreshes this route, and redirecting then would cut the unlock moment short. The client
// navigates home itself after a successful unlock.
export default async function LockPage() {
  const state = await loadLockState();

  return (
    <LockScreen
      mode={state.hasPin ? "unlock" : "setup"}
      setupCodeRequired={state.setupCodeRequired}
      initialRetryInMs={state.retryInMs}
    />
  );
}
