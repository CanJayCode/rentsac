import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./lib/auth/cookie";
import { isPublicPath } from "./lib/auth/public-paths";
import { hasValidSession } from "./lib/auth/session-check";

// Next 16 file convention (formerly middleware.ts). Web Crypto only: no node:crypto, no repo.
// Every request without a valid session cookie goes to /lock, except the explicit public paths.
// This is the first gate only: pages call requireSession() and server actions call
// assertSessionAction() themselves.
export async function proxy(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next();
  if (await hasValidSession(request.cookies.get(SESSION_COOKIE)?.value, Date.now())) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/lock", request.url));
}

export const config = {
  // Skip only Next's own build output and the favicon here, for speed. Everything else,
  // whatever its extension, runs through isPublicPath above.
  matcher: ["/((?!_next/static/|_next/image$|favicon\\.ico$).*)"],
};
