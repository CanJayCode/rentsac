import { NextResponse, type NextRequest } from "next/server";
import { getSessionSecret, SESSION_COOKIE } from "./lib/auth/cookie";
import { verifySession } from "./lib/auth/session";

// Next 16 file convention (formerly middleware.ts). Web Crypto only: no node:crypto, no repo.
// Every page without a valid session cookie goes to /lock.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/lock" || pathname.startsWith("/lock/")) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await verifySession(token, getSessionSecret(), Date.now()))) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/lock", request.url));
}

export const config = {
  matcher: [
    // Everything except Next's static output, the favicon, icons, the manifest and files with
    // a static-asset extension.
    "/((?!_next/static|_next/image|favicon\\.ico|icons/|manifest\\.webmanifest|manifest\\.json|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|txt|xml|woff|woff2|webmanifest)$).*)",
  ],
};
