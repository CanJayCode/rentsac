import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "./cookie";
import { hasValidSession } from "./session-check";

async function signedIn(): Promise<boolean> {
  return hasValidSession((await cookies()).get(SESSION_COOKIE)?.value, Date.now());
}

/** For pages and layouts: sends a visitor without a valid session to /lock. */
export async function requireSession(): Promise<void> {
  if (!(await signedIn())) redirect("/lock");
}

/**
 * For server actions: call first. Throws instead of redirecting, because an action is a
 * public endpoint that must not do anything for a caller without a valid session.
 */
export async function assertSessionAction(): Promise<void> {
  if (!(await signedIn())) throw new Error("Unauthorized");
}
