// Session tokens: `<expiresAt ms>.<HMAC-SHA256 signature, base64url>`.
// Web Crypto only (globalThis.crypto.subtle), so this runs in proxy.ts as well as on the server.

const encoder = new TextEncoder();
// Domain-separated message so the key can never be used to sign something else by accident.
const message = (expiresAt: number) => encoder.encode(`rentsac-session:v1:${expiresAt}`);

const EXPIRES_RE = /^[1-9]\d{0,15}$/;
// HMAC-SHA256 is 32 bytes: 43 base64url characters without padding.
const SIG_RE = /^[A-Za-z0-9_-]{43}$/;

function importKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function signSession(expiresAt: number, secret: string): Promise<string> {
  if (!secret) throw new Error("Session secret is empty; refusing to sign");
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw new Error("expiresAt must be a positive integer");
  const key = await importKey(secret, "sign");
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, message(expiresAt)));
  return `${expiresAt}.${toBase64Url(sig)}`;
}

export async function verifySession(token: string, secret: string, now: number): Promise<boolean> {
  try {
    if (!secret || typeof token !== "string") return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [exp, sig] = parts;
    if (!EXPIRES_RE.test(exp) || !SIG_RE.test(sig)) return false;
    const expiresAt = Number(exp);
    if (!Number.isSafeInteger(expiresAt) || now >= expiresAt) return false;
    const sigBytes = fromBase64Url(sig);
    // Reject non-canonical encodings (the last character carries 2 unused bits), so exactly
    // one string is valid per signature.
    if (toBase64Url(sigBytes) !== sig) return false;
    const key = await importKey(secret, "verify");
    // subtle.verify compares in constant time.
    return await crypto.subtle.verify("HMAC", key, sigBytes, message(expiresAt));
  } catch {
    return false;
  }
}
