// Which request paths the proxy lets through without a session. An explicit allow list:
// no extension patterns, so a future dynamic route such as /rooms/5.png is still guarded.

const PUBLIC_FILES = new Set(["/favicon.ico", "/manifest.webmanifest"]);
const ICON_RE = /^\/icons\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/lock") return true;
  if (PUBLIC_FILES.has(pathname)) return true;
  if (pathname.startsWith("/_next/static/")) return true;
  if (pathname === "/_next/image") return true;
  return ICON_RE.test(pathname) && !pathname.includes("..");
}
