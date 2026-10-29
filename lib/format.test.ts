import { describe, expect, it } from "vitest";
import { cycleText, dateParts, formatDay, formatDayMonth, ordinal } from "./format";

describe("ordinal", () => {
  it("writes English ordinals including the teens", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 26, 31].map((n) => ordinal("en", n))).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "26th", "31st",
    ]);
  });

  it("writes the bare number in Marathi", () => {
    expect(ordinal("mr", 26)).toBe("26");
  });
});

describe("cycleText", () => {
  it("calls a cycle from the 1st a calendar month", () => {
    expect(cycleText("en", 1)).toBe("calendar month");
  });

  it("names the start and the day before it", () => {
    expect(cycleText("en", 26)).toBe("cycle 26th to 25th");
    expect(cycleText("en", 12)).toBe("cycle 12th to 11th");
    expect(cycleText("mr", 26)).toBe("26 ते 25 तारीख");
  });
});

describe("formatDay", () => {
  it("formats an ISO date without shifting it by the time zone", () => {
    expect(formatDay("en", "2026-10-01")).toBe("1 Oct 2026");
    expect(formatDay("mr", "2026-10-01")).toMatch(/^1 .+ 2026$/);
  });
});

describe("formatDayMonth and dateParts", () => {
  it("writes the day and short month", () => {
    expect(formatDayMonth("en", "2026-10-05")).toBe("5 Oct");
    expect(dateParts("en", "2026-10-05")).toEqual({ day: "5", month: "Oct" });
    expect(dateParts("mr", "2026-10-05").day).toBe("5");
  });
});
