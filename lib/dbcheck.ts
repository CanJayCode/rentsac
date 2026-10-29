export const TABLES = [
  "rooms",
  "tenants",
  "charges",
  "payments",
  "rounds",
  "readings",
  "main_readings",
  "settings",
  "auth_attempts",
] as const;

export const EXPECTED_ROOMS = 16;

export type TableResult = { table: string; error?: string };

/** The report lines and overall verdict for the database check. Never includes keys. */
export function summarize(results: TableResult[], roomCount: number | null): { lines: string[]; ok: boolean } {
  const lines = results.map((r) => (r.error ? `FAIL ${r.table}: ${r.error}` : `OK   ${r.table}`));
  const failed = results.filter((r) => r.error).length;
  if (roomCount !== null && roomCount !== EXPECTED_ROOMS) {
    lines.push(`WARNING: found ${roomCount} rooms, expected ${EXPECTED_ROOMS}. Re-run supabase/schema.sql in the SQL Editor.`);
  }
  const roomsOk = roomCount === null || roomCount === EXPECTED_ROOMS;
  lines.push(
    failed === 0 && roomsOk
      ? `OK: all ${results.length} tables are reachable and there are ${EXPECTED_ROOMS} rooms.`
      : failed > 0
        ? `NOT OK: ${failed} of ${results.length} tables failed. Run supabase/schema.sql in the Supabase SQL Editor, then try again.`
        : `NOT OK: the room count is wrong.`,
  );
  return { lines, ok: failed === 0 && roomsOk };
}

/** Names of the required environment variables that are missing or empty. */
export function missingEnv(env: Record<string, string | undefined>): string[] {
  return ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !env[k]?.trim());
}
