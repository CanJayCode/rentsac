import { runContract } from "./contract";

// Opt-in: needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for a throwaway
// project with supabase/schema.sql applied and no existing rounds or settings.
runContract("supabase", async () => (await import("./supabase")).createSupabaseRepo(), {
  skip: process.env.SUPABASE_TEST !== "1",
});
