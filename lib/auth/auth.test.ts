import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPin, isValidPin, verifyPin } from "./pin";
import { LOCKOUT_LIMIT, LOCKOUT_WINDOW_MS, lockoutState } from "./ratelimit";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config as proxyConfig } from "../../proxy";
import { isPublicPath } from "./public-paths";
import { signSession, verifySession } from "./session";
import { hasValidSession } from "./session-check";

const SECRET = "test-secret-0123456789abcdef";
const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;

describe("isValidPin", () => {
  it("accepts exactly six digits only", () => {
    expect(isValidPin("123456")).toBe(true);
    expect(isValidPin("000000")).toBe(true);
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin("1234567")).toBe(false);
    expect(isValidPin("12345a")).toBe(false);
    expect(isValidPin(" 123456")).toBe(false);
    expect(isValidPin("123456\n")).toBe(false);
    expect(isValidPin("١٢٣٤٥٦")).toBe(false);
    expect(isValidPin(123456 as unknown as string)).toBe(false);
  });
});

describe("hashPin / verifyPin", () => {
  it("verifies the right PIN and rejects any other", async () => {
    const hash = await hashPin("482913");
    expect(await verifyPin("482913", hash)).toBe(true);
    expect(await verifyPin("482914", hash)).toBe(false);
    expect(await verifyPin("000000", hash)).toBe(false);
    expect(await verifyPin("", hash)).toBe(false);
  });

  it("uses a self-describing scrypt format", async () => {
    const hash = await hashPin("482913");
    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  });

  it("salts: two hashes of the same PIN differ but both verify", async () => {
    const a = await hashPin("111111");
    const b = await hashPin("111111");
    expect(a).not.toBe(b);
    expect(await verifyPin("111111", a)).toBe(true);
    expect(await verifyPin("111111", b)).toBe(true);
  });

  it("returns false for a malformed or garbage hash", async () => {
    const good = await hashPin("123456");
    const parts = good.split("$");
    const bad = [
      "",
      "garbage",
      "scrypt$",
      "bcrypt$16384$8$1$abc$def",
      "scrypt$notanumber$8$1$abc$def",
      "scrypt$16384$8$1$$",
      "scrypt$1000$8$1$" + parts[4] + "$" + parts[5], // N not a power of two
      "scrypt$1073741824$8$1$" + parts[4] + "$" + parts[5], // absurd N
      [...parts.slice(0, 5), parts[5].slice(0, 10)].join("$"), // truncated hash
      good + "$extra",
    ];
    for (const h of bad) {
      expect(await verifyPin("123456", h)).toBe(false);
    }
  });
});

describe("signSession / verifySession", () => {
  const now = Date.UTC(2026, 9, 28, 12, 0, 0);

  it("accepts a fresh token signed with the same secret", async () => {
    const token = await signSession(now + 30 * DAY, SECRET);
    expect(token).toMatch(/^\d+\.[A-Za-z0-9_-]+$/);
    expect(await verifySession(token, SECRET, now)).toBe(true);
    expect(await verifySession(token, SECRET, now + 29 * DAY)).toBe(true);
  });

  it("rejects an expired token", async () => {
    const token = await signSession(now + 30 * DAY, SECRET);
    expect(await verifySession(token, SECRET, now + 30 * DAY)).toBe(false);
    expect(await verifySession(token, SECRET, now + 31 * DAY)).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const token = await signSession(now + 30 * DAY, SECRET);
    const [exp, sig] = token.split(".");
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect(await verifySession(`${exp}.${flipped}`, SECRET, now)).toBe(false);
    const middle = sig.slice(0, 10) + (sig[10] === "x" ? "y" : "x") + sig.slice(11);
    expect(await verifySession(`${exp}.${middle}`, SECRET, now)).toBe(false);
  });

  it("rejects a tampered expiry (extending the session)", async () => {
    const token = await signSession(now + 30 * DAY, SECRET);
    const [, sig] = token.split(".");
    expect(await verifySession(`${now + 365 * DAY}.${sig}`, SECRET, now)).toBe(false);
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signSession(now + 30 * DAY, "another-secret-entirely-xyz");
    expect(await verifySession(token, SECRET, now)).toBe(false);
  });

  it("rejects malformed tokens", async () => {
    const token = await signSession(now + 30 * DAY, SECRET);
    for (const t of ["", ".", "abc", `${now + DAY}`, `${now + DAY}.`, `.${token.split(".")[1]}`, `x${token}`, `${token}.extra`, "1e20.abc", "-5.abc", `${token}=`]) {
      expect(await verifySession(t, SECRET, now)).toBe(false);
    }
  });

  it("refuses to sign or verify with an empty secret", async () => {
    await expect(signSession(now + DAY, "")).rejects.toThrow();
    const token = await signSession(now + DAY, SECRET);
    expect(await verifySession(token, "", now)).toBe(false);
  });
});

describe("lockoutState", () => {
  const now = Date.UTC(2026, 9, 28, 12, 0, 0);

  it("uses 5 failures in 10 minutes", () => {
    expect(LOCKOUT_LIMIT).toBe(5);
    expect(LOCKOUT_WINDOW_MS).toBe(10 * MIN);
  });

  it("is not locked with no failures", () => {
    expect(lockoutState([], now)).toEqual({ locked: false, retryInMs: 0 });
  });

  it("is not locked after 4 failures", () => {
    const failures = [now - 4 * MIN, now - 3 * MIN, now - 2 * MIN, now - 1 * MIN];
    expect(lockoutState(failures, now)).toEqual({ locked: false, retryInMs: 0 });
  });

  it("locks after 5 failures with the remaining time until 10 minutes after the last one", () => {
    const failures = [now - 5 * MIN, now - 4 * MIN, now - 3 * MIN, now - 2 * MIN, now - 1 * MIN];
    expect(lockoutState(failures, now)).toEqual({ locked: true, retryInMs: 9 * MIN });
  });

  it("does not depend on the order of failures", () => {
    const failures = [now - 1 * MIN, now - 5 * MIN, now - 3 * MIN, now - 2 * MIN, now - 4 * MIN];
    expect(lockoutState(failures, now)).toEqual({ locked: true, retryInMs: 9 * MIN });
  });

  it("ignores failures older than 10 minutes", () => {
    const old = [now - 30 * MIN, now - 25 * MIN, now - 21 * MIN];
    const recent = [now - 3 * MIN, now - 2 * MIN, now - 1 * MIN, now - 30 * 1000];
    expect(lockoutState([...old, ...recent], now)).toEqual({ locked: false, retryInMs: 0 });
    expect(lockoutState(old.concat(old, old), now)).toEqual({ locked: false, retryInMs: 0 });
  });

  it("expires 10 minutes after the most recent failure", () => {
    const last = now - 1 * MIN;
    const failures = [now - 5 * MIN, now - 4 * MIN, now - 3 * MIN, now - 2 * MIN, last];
    expect(lockoutState(failures, last + 10 * MIN - 1)).toEqual({ locked: true, retryInMs: 1 });
    expect(lockoutState(failures, last + 10 * MIN)).toEqual({ locked: false, retryInMs: 0 });
    expect(lockoutState(failures, last + 11 * MIN)).toEqual({ locked: false, retryInMs: 0 });
  });

  it("stays locked until 10 minutes after the last failure even when early failures age out", () => {
    // Five failures inside one 10-minute window, the last at 9 minutes.
    const failures = [now, now + 1 * MIN, now + 2 * MIN, now + 3 * MIN, now + 9 * MIN];
    // At 10.5 minutes the first failure is older than 10 minutes, but the lock holds.
    expect(lockoutState(failures, now + 10.5 * MIN)).toEqual({ locked: true, retryInMs: 8.5 * MIN });
    expect(lockoutState(failures, now + 19 * MIN)).toEqual({ locked: false, retryInMs: 0 });
  });

  it("ignores failures timestamped in the future", () => {
    const future = [now + MIN, now + 2 * MIN, now + 3 * MIN, now + 4 * MIN, now + 5 * MIN];
    expect(lockoutState(future, now)).toEqual({ locked: false, retryInMs: 0 });
  });
});

// ---- Server actions (app/lock/actions.ts), with next/headers mocked ----

const cookieJar = vi.hoisted(() => new Map<string, { value: string; options: Record<string, unknown> }>());
const requestHeaders = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, value: string, options: Record<string, unknown>) => cookieJar.set(name, { value, options }),
    delete: (name: string) => cookieJar.delete(name),
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)!.value } : undefined),
  }),
  headers: async () => ({ get: (k: string) => requestHeaders.get(k.toLowerCase()) ?? null }),
}));
// verifyPin stays real; the wrapper only counts how many PINs were actually checked.
vi.mock("./pin", async (importOriginal) => {
  const real = await importOriginal<typeof import("./pin")>();
  return { ...real, verifyPin: vi.fn(real.verifyPin) };
});

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

describe("lock actions", () => {
  const env = { ...process.env };

  beforeEach(() => {
    cookieJar.clear();
    requestHeaders.clear();
    requestHeaders.set("x-forwarded-for", "203.0.113.7, 10.0.0.1");
    delete (globalThis as { __rentsacMemoryRepo?: unknown }).__rentsacMemoryRepo;
    process.env.REPO = "memory";
    process.env.SESSION_SECRET = SECRET;
    delete process.env.SETUP_CODE;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("first run: setupPin stores a hash, logs in, and cannot run twice", async () => {
    const { setupPin } = await import("../../app/lock/actions");
    const { getRepo } = await import("../repo");
    expect(await setupPin("12345", "12345")).toEqual({ ok: false, error: "format" });
    expect(await setupPin("123456", "654321")).toEqual({ ok: false, error: "mismatch" });
    expect(cookieJar.size).toBe(0);

    expect(await setupPin("482913", "482913")).toEqual({ ok: true });
    const stored = await (await getRepo()).getSetting("pin_hash");
    expect(stored).toMatch(/^scrypt\$/);
    expect(stored).not.toContain("482913");
    expect(await verifyPin("482913", stored!)).toBe(true);

    const c = cookieJar.get("rentsac_session")!;
    expect(c.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 });
    expect(await verifySession(c.value, SECRET, Date.now())).toBe(true);
    expect(await verifySession(c.value, SECRET, Date.now() + 31 * DAY)).toBe(false);

    expect(await setupPin("111111", "111111")).toEqual({ ok: false, error: "already-set" });
    expect(await verifyPin("482913", (await (await getRepo()).getSetting("pin_hash"))!)).toBe(true);
  });

  it("requires SETUP_CODE when set, with failures counted toward lockout", async () => {
    process.env.SETUP_CODE = "orchid-42";
    const { setupPin } = await import("../../app/lock/actions");
    expect(await setupPin("482913", "482913")).toEqual({ ok: false, error: "setup-code" });
    expect(await setupPin("482913", "482913", "orchid-41")).toEqual({ ok: false, error: "setup-code" });
    expect(await setupPin("482913", "482913", "orchid-42")).toEqual({ ok: true });
  });

  it("unlock: wrong PINs are generic, the fifth locks, and the right PIN is refused while locked", async () => {
    const { setupPin, unlock } = await import("../../app/lock/actions");
    await setupPin("482913", "482913");
    cookieJar.clear();

    expect(await unlock("abcdef")).toEqual({ ok: false, error: "format" });
    for (let i = 0; i < 4; i++) expect(await unlock("000000")).toEqual({ ok: false, error: "invalid" });
    const fifth = await unlock("000000");
    expect(fifth).toMatchObject({ ok: false, error: "locked" });
    expect((fifth as { retryInSeconds: number }).retryInSeconds).toBeGreaterThan(9 * 60);

    expect(await unlock("482913")).toMatchObject({ ok: false, error: "locked" });
    expect(cookieJar.size).toBe(0);

    // Another client IP is not affected.
    requestHeaders.set("x-forwarded-for", "198.51.100.2");
    expect(await unlock("482913")).toEqual({ ok: true });
    expect(cookieJar.has("rentsac_session")).toBe(true);
  });

  it("a burst of 20 concurrent wrong PINs gets at most 5 checks; the rest are refused as locked", async () => {
    const { setupPin, unlock } = await import("../../app/lock/actions");
    await setupPin("482913", "482913");
    vi.mocked(verifyPin).mockClear();
    const results = await Promise.all(Array.from({ length: 20 }, () => unlock("000000")));
    expect(vi.mocked(verifyPin).mock.calls.length).toBeLessThanOrEqual(5);
    const invalid = results.filter((r) => !r.ok && r.error === "invalid").length;
    const locked = results.filter((r) => !r.ok && r.error === "locked").length;
    expect(invalid).toBeLessThanOrEqual(5);
    expect(invalid + locked).toBe(20);
    // Afterwards even the right PIN is refused from that IP.
    expect(await unlock("482913")).toMatchObject({ ok: false, error: "locked" });
  });

  it("the right PIN as the third attempt succeeds and clears the failures", async () => {
    const { setupPin, unlock } = await import("../../app/lock/actions");
    const { getRepo } = await import("../repo");
    await setupPin("482913", "482913");
    cookieJar.clear();
    expect(await unlock("000000")).toEqual({ ok: false, error: "invalid" });
    expect(await unlock("111111")).toEqual({ ok: false, error: "invalid" });
    expect(await unlock("482913")).toEqual({ ok: true });
    expect(cookieJar.has("rentsac_session")).toBe(true);
    expect(await (await getRepo()).recentFailures("203.0.113.7", 0)).toEqual([]);
    // A fresh run of failures starts from zero: four more wrong tries do not lock.
    for (let i = 0; i < 4; i++) expect(await unlock("000000")).toEqual({ ok: false, error: "invalid" });
  });

  it("setup-code guesses are counted before checking, so a burst is capped too", async () => {
    process.env.SETUP_CODE = "orchid-42";
    const { setupPin } = await import("../../app/lock/actions");
    const results = await Promise.all(Array.from({ length: 20 }, () => setupPin("482913", "482913", "nope")));
    const wrongCode = results.filter((r) => !r.ok && r.error === "setup-code").length;
    expect(wrongCode).toBeLessThanOrEqual(5);
    expect(results.every((r) => !r.ok && (r.error === "setup-code" || r.error === "locked"))).toBe(true);
    expect(await setupPin("482913", "482913", "orchid-42")).toMatchObject({ ok: false, error: "locked" });
  });

  it("requireSession redirects and assertSessionAction throws without a valid session", async () => {
    const { requireSession, assertSessionAction } = await import("./require-session");
    await expect(requireSession()).rejects.toThrow("REDIRECT:/lock");
    await expect(assertSessionAction()).rejects.toThrow("Unauthorized");
    cookieJar.set("rentsac_session", { value: "1.bogus", options: {} });
    await expect(assertSessionAction()).rejects.toThrow("Unauthorized");
    cookieJar.set("rentsac_session", { value: await signSession(Date.now() + DAY, SECRET), options: {} });
    await expect(requireSession()).resolves.toBeUndefined();
    await expect(assertSessionAction()).resolves.toBeUndefined();
  });

  it("lock clears the session cookie and goes to /lock", async () => {
    const { lock, setupPin } = await import("../../app/lock/actions");
    await setupPin("482913", "482913");
    expect(cookieJar.has("rentsac_session")).toBe(true);
    await expect(lock()).rejects.toThrow("REDIRECT:/lock");
    expect(cookieJar.has("rentsac_session")).toBe(false);
  });

  it("throws a clear error when SESSION_SECRET is missing", async () => {
    delete process.env.SESSION_SECRET;
    const { setupPin, unlock } = await import("../../app/lock/actions");
    await expect(setupPin("482913", "482913")).rejects.toThrow(/SESSION_SECRET/);
    await expect(unlock("482913")).rejects.toThrow(/SESSION_SECRET/);
  });
});

describe("hasValidSession", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.SESSION_SECRET = SECRET;
  });
  afterEach(() => {
    process.env = { ...env };
  });
  const now = Date.UTC(2026, 9, 28, 12, 0, 0);

  it("rejects a missing cookie", async () => {
    expect(await hasValidSession(undefined, now)).toBe(false);
    expect(await hasValidSession("", now)).toBe(false);
  });
  it("rejects a tampered cookie", async () => {
    const [exp, sig] = (await signSession(now + DAY, SECRET)).split(".");
    expect(await hasValidSession(`${Number(exp) + 1}.${sig}`, now)).toBe(false);
  });
  it("rejects an expired cookie", async () => {
    expect(await hasValidSession(await signSession(now + DAY, SECRET), now + 2 * DAY)).toBe(false);
  });
  it("accepts a valid cookie", async () => {
    expect(await hasValidSession(await signSession(now + DAY, SECRET), now)).toBe(true);
  });
  it("throws when SESSION_SECRET is missing", async () => {
    delete process.env.SESSION_SECRET;
    await expect(hasValidSession("1.x", now)).rejects.toThrow(/SESSION_SECRET/);
  });
});

describe("isPublicPath and the proxy matcher", () => {
  const cases: [string, boolean][] = [
    ["/lock", true],
    ["/lock/x", false],
    ["/rooms/5.png", false],
    ["/x.txt", false],
    ["/_next/static/a.js", true],
    ["/manifest.webmanifest", true],
    ["/favicon.ico", true],
    ["/", false],
    ["/icons/icon-192.png", true],
    ["/icons/../rooms", false],
    ["/icons/a/b.png", false],
    ["/_next/data/build/x.json", false],
    ["/lockout", false],
  ];
  it.each(cases)("%s -> %s", (path, expected) => {
    expect(isPublicPath(path)).toBe(expected);
  });

  it("runs the proxy for every non-static path, whatever its extension", () => {
    for (const url of ["/", "/lock", "/rooms/5", "/rooms/5.png", "/x.txt", "/icons/a.png", "/manifest.webmanifest"]) {
      expect(unstable_doesMiddlewareMatch({ config: proxyConfig, url }), url).toBe(true);
    }
    for (const url of ["/_next/static/chunks/a.js", "/_next/image", "/favicon.ico"]) {
      expect(unstable_doesMiddlewareMatch({ config: proxyConfig, url }), url).toBe(false);
    }
  });
});
