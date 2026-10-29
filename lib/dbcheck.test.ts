import { describe, expect, it } from "vitest";
import { missingEnv, summarize, TABLES } from "./dbcheck";

const allOk = TABLES.map((table) => ({ table }));

describe("summarize", () => {
  it("is ok when every table works and there are 16 rooms", () => {
    const s = summarize(allOk, 16);
    expect(s.ok).toBe(true);
    expect(s.lines[0]).toBe("OK   rooms");
    expect(s.lines.at(-1)).toMatch(/^OK: all 9 tables/);
  });
  it("fails and names the table and message", () => {
    const s = summarize([{ table: "rooms" }, { table: "tenants", error: "relation does not exist" }], null);
    expect(s.ok).toBe(false);
    expect(s.lines).toContain("FAIL tenants: relation does not exist");
  });
  it("warns and fails when the room count is not 16", () => {
    const s = summarize(allOk, 3);
    expect(s.ok).toBe(false);
    expect(s.lines.join("\n")).toMatch(/found 3 rooms, expected 16/);
  });
});

describe("missingEnv", () => {
  it("lists missing or blank variables", () => {
    expect(missingEnv({})).toEqual(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    expect(missingEnv({ SUPABASE_URL: "x", SUPABASE_SERVICE_ROLE_KEY: " " })).toEqual(["SUPABASE_SERVICE_ROLE_KEY"]);
    expect(missingEnv({ SUPABASE_URL: "x", SUPABASE_SERVICE_ROLE_KEY: "y" })).toEqual([]);
  });
});
