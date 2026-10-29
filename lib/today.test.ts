import { describe, expect, it } from "vitest";
import { todayIST } from "./today";

describe("todayIST", () => {
  it("is still the same IST day just before 18:30 UTC", () => {
    expect(todayIST(new Date("2026-10-28T18:29:59.999Z"))).toBe("2026-10-28");
  });

  it("rolls over to the next IST day at 18:30 UTC", () => {
    expect(todayIST(new Date("2026-10-28T18:30:00.000Z"))).toBe("2026-10-29");
  });

  it("crosses month and year ends in IST, not UTC", () => {
    expect(todayIST(new Date("2026-12-31T19:00:00Z"))).toBe("2027-01-01");
    expect(todayIST(new Date("2026-02-28T18:45:00Z"))).toBe("2026-03-01");
  });

  it("defaults to the current time", () => {
    expect(todayIST()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
