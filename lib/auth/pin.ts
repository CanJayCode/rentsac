import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// PIN hashing with Node's scrypt. Server-only (never imported by proxy.ts).
// Stored format: scrypt$N$r$p$<salt base64url>$<hash base64url>

const PIN_RE = /^\d{6}$/;

/** Exactly six ASCII digits. Checked server-side on every path. */
export function isValidPin(pin: unknown): pin is string {
  return typeof pin === "string" && PIN_RE.test(pin);
}

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;

// Bounds for hashes we agree to verify, so a corrupted setting cannot make us burn CPU/memory.
const MAX_N = 1 << 20;
const MAX_R = 32;
const MAX_P = 16;
const B64URL_RE = /^[A-Za-z0-9_-]+$/;

function scryptAsync(pin: string, salt: Buffer, keyLen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pin, salt, keyLen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

function maxmem(n: number, r: number, p: number): number {
  // scrypt needs about 128 * N * r * (p + 1) bytes; leave headroom.
  return 128 * n * r * (p + 2) + 1024 * 1024;
}

export async function hashPin(pin: string): Promise<string> {
  if (!isValidPin(pin)) throw new Error("PIN must be exactly 6 digits");
  const salt = randomBytes(SALT_LEN);
  const key = await scryptAsync(pin, salt, KEY_LEN, { N, r: R, p: P, maxmem: maxmem(N, R, P) });
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

function parseIntStrict(s: string): number | null {
  return /^[1-9]\d{0,9}$/.test(s) ? Number(s) : null;
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  try {
    if (typeof pin !== "string" || typeof hash !== "string") return false;
    const parts = hash.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const n = parseIntStrict(parts[1]);
    const r = parseIntStrict(parts[2]);
    const p = parseIntStrict(parts[3]);
    if (n === null || r === null || p === null) return false;
    if (n < 2 || n > MAX_N || (n & (n - 1)) !== 0 || r > MAX_R || p > MAX_P) return false;
    if (!B64URL_RE.test(parts[4]) || !B64URL_RE.test(parts[5])) return false;
    const salt = Buffer.from(parts[4], "base64url");
    const expected = Buffer.from(parts[5], "base64url");
    if (salt.length < 8 || expected.length < 16 || expected.length > 128) return false;
    const actual = await scryptAsync(pin, salt, expected.length, { N: n, r, p, maxmem: maxmem(n, r, p) });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
