import { describe, expect, it } from "vitest";
import { formatINR } from "../money";
import { en } from "./en";
import { isLocale, t } from "./index";
import { mr } from "./mr";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("dictionaries", () => {
  it("every en key exists in mr", () => {
    const missing = Object.keys(en).filter((k) => !(k in mr));
    expect(missing).toEqual([]);
  });

  it("every mr key exists in en", () => {
    const extra = Object.keys(mr).filter((k) => !(k in en));
    expect(extra).toEqual([]);
  });

  it("no value is empty", () => {
    for (const [k, v] of Object.entries(en)) expect(v.trim(), `en ${k}`).not.toBe("");
    for (const [k, v] of Object.entries(mr)) expect(v.trim(), `mr ${k}`).not.toBe("");
  });

  it("mr uses the same {placeholders} as en for each key", () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(mr[k]), k).toEqual(placeholders(en[k]));
    }
  });
});

describe("t", () => {
  it("returns the string for the locale", () => {
    expect(t("en", "nav.home")).toBe("Home");
    expect(t("mr", "status.pending")).toBe("बाकी");
    expect(t("mr", "status.paid")).toBe("जमा");
  });

  it("interpolates {name} variables, numbers included", () => {
    expect(t("en", "lock.retry.many", { minutes: 5 })).toBe("Try again in 5 minutes.");
    expect(t("mr", "lock.retry.many", { minutes: 5 })).toContain("5");
    expect(t("en", "lock.digitsEntered", { n: 3 })).toBe("3 of 6 digits entered");
  });

  it("replaces every occurrence and leaves unknown placeholders alone", () => {
    expect(t("en", "lock.digitsEntered", { n: 2, other: "x" })).toBe("2 of 6 digits entered");
    expect(t("en", "lock.digitsEntered")).toBe("{n} of 6 digits entered");
  });

  it("does not interpret $ patterns in variable values", () => {
    expect(t("en", "lock.retry.many", { minutes: "$&" })).toBe("Try again in $& minutes.");
  });
});

describe("isLocale", () => {
  it("accepts exactly en and mr", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("mr")).toBe(true);
    for (const bad of ["EN", "hi", "", "en ", undefined, null, 1]) expect(isLocale(bad)).toBe(false);
  });
});

describe("formatINR", () => {
  it("groups digits the Indian way", () => {
    expect(formatINR(1243000)).toBe("₹12,43,000");
    expect(formatINR(12430)).toBe("₹12,430");
    expect(formatINR(999)).toBe("₹999");
    expect(formatINR(1000)).toBe("₹1,000");
    expect(formatINR(100000)).toBe("₹1,00,000");
    expect(formatINR(12345678)).toBe("₹1,23,45,678");
  });

  it("handles zero and negatives", () => {
    expect(formatINR(0)).toBe("₹0");
    expect(formatINR(-1500)).toBe("-₹1,500");
    expect(formatINR(-0)).toBe("₹0");
  });

  it("shows paise only when there are some", () => {
    expect(formatINR(1234.5)).toBe("₹1,234.50");
  });
});
