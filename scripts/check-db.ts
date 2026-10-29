// Read-only check that the Supabase database is set up. Writes nothing, prints no keys.
//   npm run check:db
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local (see docs/SETUP.md).
import { createClient } from "@supabase/supabase-js";
import { missingEnv, summarize, TABLES, type TableResult } from "../lib/dbcheck";

async function main() {
  const missing = missingEnv(process.env);
  if (missing.length > 0) {
    console.error(`Cannot check the database. These are missing from .env.local: ${missing.join(", ")}`);
    console.error("See docs/SETUP.md, step 2.");
    process.exit(1);
  }
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const results: TableResult[] = [];
  let roomCount: number | null = null;
  for (const table of TABLES) {
    try {
      const { count, error } = await db.from(table).select("*", { count: "exact" }).limit(1);
      if (error) results.push({ table, error: error.message || error.code || "unknown error" });
      else {
        results.push({ table });
        if (table === "rooms") roomCount = count;
      }
    } catch (e) {
      results.push({ table, error: e instanceof Error ? e.message : "request failed" });
    }
  }
  const { lines, ok } = summarize(results, roomCount);
  console.log(lines.join("\n"));
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error("Check failed:", e instanceof Error ? e.message : "unknown error");
  process.exit(1);
});
