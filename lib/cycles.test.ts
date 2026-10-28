import { describe, expect, it } from "vitest";
import { periodContaining, periodsBetween } from "./cycles";

describe("periodContaining", () => {
  it("startDay 1 covers the calendar month", () => {
    expect(periodContaining(1, "2025-02-10")).toEqual({
      start: "2025-02-01",
      end: "2025-02-28",
    });
  });

  it("starts in the previous month when date is before the start day", () => {
    expect(periodContaining(12, "2025-02-10")).toEqual({
      start: "2025-01-12",
      end: "2025-02-11",
    });
  });

  it("starts in the same month when date is on or after the start day", () => {
    expect(periodContaining(26, "2025-03-01")).toEqual({
      start: "2025-02-26",
      end: "2025-03-25",
    });
    expect(periodContaining(26, "2025-03-26")).toEqual({
      start: "2025-03-26",
      end: "2025-04-25",
    });
  });

  it("clamps a start day missing from a short month", () => {
    const p = periodContaining(31, "2025-02-20");
    expect(p).toEqual({ start: "2025-01-31", end: "2025-02-27" });
    expect(periodContaining(31, "2025-02-28").start).toBe("2025-02-28");
    expect(periodContaining(31, "2025-02-27").end).toBe("2025-02-27");
  });

  it("handles leap-year February", () => {
    expect(periodContaining(29, "2024-02-29")).toEqual({
      start: "2024-02-29",
      end: "2024-03-28",
    });
    expect(periodContaining(30, "2024-02-10")).toEqual({
      start: "2024-01-30",
      end: "2024-02-28",
    });
    expect(periodContaining(29, "2025-02-28")).toEqual({
      start: "2025-02-28",
      end: "2025-03-28",
    });
  });

  it("crosses the year boundary", () => {
    expect(periodContaining(15, "2025-01-05")).toEqual({
      start: "2024-12-15",
      end: "2025-01-14",
    });
    expect(periodContaining(15, "2024-12-20")).toEqual({
      start: "2024-12-15",
      end: "2025-01-14",
    });
  });

  it("ends the day before a clamped next start", () => {
    expect(periodContaining(30, "2025-03-05")).toEqual({
      start: "2025-02-28",
      end: "2025-03-29",
    });
  });
});

describe("periodsBetween", () => {
  it("returns contiguous periods whose start is within the range", () => {
    const ps = periodsBetween(1, "2025-01-01", "2025-03-31");
    expect(ps).toEqual([
      { start: "2025-01-01", end: "2025-01-31" },
      { start: "2025-02-01", end: "2025-02-28" },
      { start: "2025-03-01", end: "2025-03-31" },
    ]);
  });

  it("has no gap or overlap with a clamped start day", () => {
    const ps = periodsBetween(31, "2025-01-31", "2025-04-30");
    expect(ps.map((p) => p.start)).toEqual([
      "2025-01-31",
      "2025-02-28",
      "2025-03-31",
      "2025-04-30",
    ]);
    expect(ps[0].end).toBe("2025-02-27");
    expect(ps[1].end).toBe("2025-03-30");
  });

  it("only includes periods that start inside [from, to]", () => {
    expect(periodsBetween(12, "2025-02-01", "2025-03-11")).toEqual([
      { start: "2025-02-12", end: "2025-03-11" },
    ]);
  });

  it("includes a period starting exactly on from or to", () => {
    const ps = periodsBetween(12, "2025-02-12", "2025-03-12");
    expect(ps.map((p) => p.start)).toEqual(["2025-02-12", "2025-03-12"]);
  });

  it("returns [] when from is after to", () => {
    expect(periodsBetween(1, "2025-03-01", "2025-01-01")).toEqual([]);
  });

  it("returns [] when no period starts in range", () => {
    expect(periodsBetween(26, "2025-02-01", "2025-02-20")).toEqual([]);
  });
});
