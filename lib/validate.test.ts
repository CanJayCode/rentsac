import { describe, expect, it } from "vitest";
import { isRealDate, validateRoom, validateTenant } from "./validate";

const good = { name: "  Vaibhav Kusekar ", rentAmount: "3000", cycleStartDay: "26", startedOn: "2026-10-01" };

describe("isRealDate", () => {
  it("accepts real dates and rejects impossible or malformed ones", () => {
    expect(isRealDate("2026-10-28")).toBe(true);
    expect(isRealDate("2028-02-29")).toBe(true);
    expect(isRealDate("2026-02-29")).toBe(false);
    expect(isRealDate("2026-13-01")).toBe(false);
    expect(isRealDate("2026-4-01")).toBe(false);
    expect(isRealDate("")).toBe(false);
  });
});

describe("validateTenant", () => {
  it("trims the name and parses the numbers", () => {
    expect(validateTenant(good)).toEqual({
      ok: true,
      value: { name: "Vaibhav Kusekar", rentAmount: 3000, cycleStartDay: 26, startedOn: "2026-10-01" },
    });
  });

  it("accepts rent 0 and cycle days 1 and 31", () => {
    expect(validateTenant({ ...good, rentAmount: "0", cycleStartDay: "1" }).ok).toBe(true);
    expect(validateTenant({ ...good, cycleStartDay: "31" }).ok).toBe(true);
  });

  it("returns an i18n key per bad field", () => {
    const r = validateTenant({ name: "   ", rentAmount: "-5", cycleStartDay: "32", startedOn: "2026-02-30" });
    expect(r).toEqual({
      ok: false,
      errors: {
        name: "form.error.nameRequired",
        rentAmount: "form.error.rent",
        cycleStartDay: "form.error.cycleDay",
        startedOn: "form.error.date",
      },
    });
  });

  it("rejects fractions, words, zero cycle day and over-long names", () => {
    const r = validateTenant({ name: "x".repeat(81), rentAmount: "3000.5", cycleStartDay: "0", startedOn: "soon" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual({
      name: "form.error.nameLong",
      rentAmount: "form.error.rent",
      cycleStartDay: "form.error.cycleDay",
      startedOn: "form.error.date",
    });
    expect(validateTenant({ ...good, rentAmount: "abc" }).ok).toBe(false);
    expect(validateTenant({ ...good, cycleStartDay: "12.0" }).ok).toBe(false);
  });

  it("treats missing fields as invalid", () => {
    expect(validateTenant({}).ok).toBe(false);
  });
});

describe("validateRoom", () => {
  it("accepts a positive whole number and an optional trimmed label", () => {
    expect(validateRoom({ number: "17", label: "  Terrace " })).toEqual({
      ok: true,
      value: { number: 17, label: "Terrace" },
    });
    expect(validateRoom({ number: "3", label: "" })).toEqual({ ok: true, value: { number: 3 } });
  });

  it("rejects zero, negatives, fractions and long labels", () => {
    expect(validateRoom({ number: "0" })).toEqual({ ok: false, errors: { number: "form.error.roomNumber" } });
    expect(validateRoom({ number: "-2" }).ok).toBe(false);
    expect(validateRoom({ number: "2.5" }).ok).toBe(false);
    expect(validateRoom({ number: "4", label: "y".repeat(41) })).toEqual({
      ok: false,
      errors: { label: "form.error.labelLong" },
    });
  });
});
