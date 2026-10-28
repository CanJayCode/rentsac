// Shared session-cookie constants. Safe for proxy.ts (no Node-only imports).

export const SESSION_COOKIE = "rentsac_session";
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;
export const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_S * 1000;

/** The HMAC secret for session cookies. Throws when unset: never sign with an empty or default secret. */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Add a long random value (for example `openssl rand -base64 32`) to the environment.",
    );
  }
  return secret;
}
