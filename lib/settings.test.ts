import { describe, expect, it } from "vitest";
import { parseRate } from "./settings";

describe("parseRate", () => {
  it("accepts whole numbers from 1 to 1000", () => {
    expect(parseRate("1")).toBe(1);
    expect(parseRate(" 12 ")).toBe(12);
    expect(parseRate("1000")).toBe(1000);
  });

  it("rejects everything else", () => {
    for (const bad of ["", "0", "1001", "-5", "7.5", "1e2", "ten", "१२", "00012345", undefined, 10, null]) {
      expect(parseRate(bad), String(bad)).toBeNull();
    }
  });
});
