// The one session check used by proxy.ts, pages and server actions. Web Crypto only.
import { getSessionSecret } from "./cookie";
import { verifySession } from "./session";

/** True when the cookie value is a valid, unexpired session signed with SESSION_SECRET. */
export async function hasValidSession(cookieValue: string | undefined, now: number): Promise<boolean> {
  if (!cookieValue) return false;
  return verifySession(cookieValue, getSessionSecret(), now);
}
