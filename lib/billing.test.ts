import { describe, expect, it } from "vitest";
import { checkReading, lightBill } from "./billing";

describe("lightBill", () => {
  it("multiplies units by the rate", () => {
    expect(lightBill(439, 445, 10)).toEqual({ units: 6, amount: 60 });
    expect(lightBill(1502, 1525, 10)).toEqual({ units: 23, amount: 230 });
  });

  it("bills zero for equal readings", () => {
    expect(lightBill(944, 944, 10)).toEqual({ units: 0, amount: 0 });
  });

  it("keeps decimal units exact and rounds the amount to a whole rupee", () => {
    expect(lightBill(100, 105.5, 7)).toEqual({ units: 5.5, amount: 39 });
    expect(lightBill(100, 102.25, 10)).toEqual({ units: 2.25, amount: 23 });
  });

  it("throws when the new reading is lower than the previous", () => {
    expect(() => lightBill(1354, 106, 10)).toThrow(Error);
  });
});

describe("checkReading", () => {
  it("flags a lower reading", () => {
    expect(checkReading(1354, 106, [30, 40])).toBe("lower");
    expect(checkReading(1354, 106, [])).toBe("lower");
  });

  it("treats equal readings as ok", () => {
    expect(checkReading(944, 944, [0, 0])).toBe("ok");
    expect(checkReading(944, 944, [])).toBe("ok");
  });

  it("flags units over 3x the recent max and over 50", () => {
    expect(checkReading(100, 900, [30, 40, 35])).toBe("high");
  });

  it("is ok for normal use", () => {
    expect(checkReading(100, 140, [30, 40, 35])).toBe("ok");
  });

  it("is never high with no history", () => {
    expect(checkReading(0, 5000, [])).toBe("ok");
  });

  it("is not high at exactly 3x the max", () => {
    expect(checkReading(0, 120, [40])).toBe("ok");
    expect(checkReading(0, 121, [40])).toBe("high");
  });

  it("is not high at exactly 50 units", () => {
    expect(checkReading(0, 50, [10])).toBe("ok");
    expect(checkReading(0, 51, [10])).toBe("high");
  });

  it("flags high use after a run of zero-use rounds when over 50", () => {
    expect(checkReading(944, 1000, [0, 0, 0])).toBe("high");
    expect(checkReading(944, 960, [0, 0, 0])).toBe("ok");
  });
});
