import { describe, expect, it } from "vitest";
import { runContract } from "./contract";

describe("supabase module", () => {
  it("loads under Vitest and exports createSupabaseRepo", async () => {
    const mod = await import("./supabase");
    expect(typeof mod.createSupabaseRepo).toBe("function");
  });

  it("names the missing variable when unconfigured", async () => {
    const { createSupabaseRepo } = await import("./supabase");
    expect(() => createSupabaseRepo({ key: "k" })).toThrow(/SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/);
  });
});

// Opt-in, and only against dedicated SUPABASE_TEST_* variables, never the app's
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Use a throwaway project with
// supabase/schema.sql applied. Assertions are scoped to rows the test creates,
// but the suite does leave rows behind.
const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_SERVICE_KEY;

runContract(
  "supabase",
  async () => (await import("./supabase")).createSupabaseRepo({ url, key }),
  { skip: process.env.SUPABASE_TEST !== "1" || !url || !key },
);
