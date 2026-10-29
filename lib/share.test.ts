import { describe, expect, it } from "vitest";
import { billMessage, summaryText, waLink, type ShareCharge } from "./share";

const tenant = { name: "Ramesh Patil", roomNumber: 5 };
const rentCharge: ShareCharge = { kind: "rent", dueDate: "2026-10-01", amount: 3000 };
const oldLight: ShareCharge = {
  kind: "light",
  dueDate: "2026-09-15",
  amount: 450,
  prevReading: 1155,
  currReading: 1200,
  units: 45,
  rate: 10,
};
const newLight: ShareCharge = {
  kind: "light",
  dueDate: "2026-10-15",
  amount: 600,
  prevReading: 1200,
  currReading: 1260,
  units: 60,
  rate: 10,
};

describe("billMessage", () => {
  it("English: rent and the latest light bill", () => {
    const text = billMessage("en", tenant, [rentCharge, newLight, oldLight], { rent: 3000, light: 600, total: 3600 });
    expect(text).toBe(
      [
        "Hello Ramesh Patil, Room 5",
        "",
        "Light bill: previous reading 1200, new reading 1260",
        "60 units × ₹10 = ₹600",
        "Light bill pending: ₹600",
        "Rent pending: ₹3,000",
        "",
        "Total pending: ₹3,600",
        "Thank you.",
      ].join("\n"),
    );
  });

  it("Marathi: rent and the latest light bill", () => {
    const text = billMessage("mr", tenant, [rentCharge, newLight], { rent: 3000, light: 600, total: 3600 });
    expect(text).toBe(
      [
        "नमस्कार Ramesh Patil, खोली 5",
        "",
        "लाईट बिल: मागील रीडिंग 1200, नवीन रीडिंग 1260",
        "60 युनिट × ₹10 = ₹600",
        "लाईट बिल बाकी: ₹600",
        "भाडे बाकी: ₹3,000",
        "",
        "एकूण बाकी: ₹3,600",
        "धन्यवाद.",
      ].join("\n"),
    );
  });

  it("uses only the most recent light charge, whatever the list order", () => {
    const text = billMessage("en", tenant, [newLight, oldLight], { rent: 0, light: 1050, total: 1050 });
    expect(text).toContain("previous reading 1200, new reading 1260");
    expect(text).not.toContain("1155");
    expect(text).toContain("Light bill pending: ₹1,050");
  });

  it("only rent due: no light lines", () => {
    const text = billMessage("en", tenant, [rentCharge], { rent: 3000, light: 0, total: 3000 });
    expect(text).toBe(
      ["Hello Ramesh Patil, Room 5", "", "Rent pending: ₹3,000", "", "Total pending: ₹3,000", "Thank you."].join("\n"),
    );
  });

  it("only light due: no rent line", () => {
    const text = billMessage("en", tenant, [rentCharge, newLight], { rent: 0, light: 600, total: 600 });
    expect(text).toBe(
      [
        "Hello Ramesh Patil, Room 5",
        "",
        "Light bill: previous reading 1200, new reading 1260",
        "60 units × ₹10 = ₹600",
        "Light bill pending: ₹600",
        "",
        "Total pending: ₹600",
        "Thank you.",
      ].join("\n"),
    );
  });

  it("a light bill already paid is not shown", () => {
    const text = billMessage("en", tenant, [rentCharge, newLight], { rent: 3000, light: 0, total: 3000 });
    expect(text).not.toContain("reading");
  });

  it("nothing due: all clear", () => {
    expect(billMessage("en", tenant, [rentCharge], { rent: 0, light: 0, total: 0 })).toBe(
      ["Hello Ramesh Patil, Room 5", "", "All clear, nothing is pending. Thank you."].join("\n"),
    );
    expect(billMessage("mr", tenant, [rentCharge], { rent: 0, light: 0, total: 0 })).toBe(
      ["नमस्कार Ramesh Patil, खोली 5", "", "सर्व हिशोब जमा, काही बाकी नाही. धन्यवाद."].join("\n"),
    );
  });

  it("advance adds a line, with or without a balance", () => {
    expect(billMessage("en", tenant, [rentCharge], { rent: 0, light: 0, total: 0, advance: 500 })).toBe(
      ["Hello Ramesh Patil, Room 5", "", "All clear, nothing is pending.", "Advance paid: ₹500", "Thank you."].join("\n"),
    );
    const owing = billMessage("mr", tenant, [rentCharge], { rent: 1000, light: 0, total: 1000, advance: 500 });
    expect(owing).toContain("आगाऊ जमा: ₹500");
    expect(owing).toContain("एकूण बाकी: ₹1,000");
  });

  it("a light charge with no recorded readings still shows units and amount", () => {
    const bare: ShareCharge = { kind: "light", dueDate: "2026-10-15", amount: 300, units: 30, rate: 10 };
    const text = billMessage("en", tenant, [bare], { rent: 0, light: 300, total: 300 });
    expect(text).toContain("Light bill: 30 units × ₹10 = ₹300");
  });

  it("an opening balance is not a light bill", () => {
    const opening: ShareCharge = { kind: "opening", openingFor: "light", dueDate: "2026-09-30", amount: 1390 };
    const text = billMessage("en", tenant, [opening], { rent: 0, light: 1390, total: 1390 });
    expect(text).not.toContain("reading");
    expect(text).toContain("Light bill pending: ₹1,390");
  });

  it("has no emoji", () => {
    const text = billMessage("mr", tenant, [rentCharge, newLight], { rent: 1, light: 1, total: 2, advance: 1 });
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("waLink", () => {
  it("encodes Devanagari and line breaks", () => {
    expect(waLink("नमस्कार\nबाकी ₹5")).toBe(
      "https://wa.me/?text=" + "%E0%A4%A8%E0%A4%AE%E0%A4%B8%E0%A5%8D%E0%A4%95%E0%A4%BE%E0%A4%B0" + "%0A" + "%E0%A4%AC%E0%A4%BE%E0%A4%95%E0%A5%80%20%E2%82%B95",
    );
  });

  it("round-trips the message", () => {
    const text = billMessage("mr", tenant, [rentCharge, newLight], { rent: 3000, light: 600, total: 3600 });
    const url = waLink(text);
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(url).not.toMatch(/[\s\n]/);
    expect(decodeURIComponent(url.slice("https://wa.me/?text=".length))).toBe(text);
  });
});

const row = (roomNumber: number, tenantName: string, pendingRent: number, pendingLight: number) => ({
  roomNumber,
  tenantName,
  pendingRent,
  pendingLight,
  pendingTotal: pendingRent + pendingLight,
});

describe("summaryText", () => {
  const home = {
    totalPending: 16890,
    rows: [row(3, "Sunita", 0, 0), row(4, "Mahesh", 9000, 0), row(5, "Ramesh Patil", 6000, 1390), row(7, "Kiran", 0, 500)],
    left: [row(9, "Amit", 1000, 0)],
  };

  it("English: owing rooms only, a total, and former tenants", () => {
    expect(summaryText("en", home)).toBe(
      [
        "Pending this month",
        "Room 4, Mahesh: ₹9,000 (rent)",
        "Room 5, Ramesh Patil: ₹7,390 (rent ₹6,000, light bill ₹1,390)",
        "Room 7, Kiran: ₹500 (light bill)",
        "",
        "Total pending: ₹16,890",
        "",
        "Left, still owes",
        "Room 9, Amit: ₹1,000 (rent)",
      ].join("\n"),
    );
  });

  it("Marathi", () => {
    expect(summaryText("mr", home)).toBe(
      [
        "या महिन्याची बाकी",
        "खोली 4, Mahesh: ₹9,000 (भाडे)",
        "खोली 5, Ramesh Patil: ₹7,390 (भाडे ₹6,000, लाईट बिल ₹1,390)",
        "खोली 7, Kiran: ₹500 (लाईट बिल)",
        "",
        "एकूण बाकी: ₹16,890",
        "",
        "सोडून गेले, अजून बाकी",
        "खोली 9, Amit: ₹1,000 (भाडे)",
      ].join("\n"),
    );
  });

  it("nothing pending", () => {
    expect(summaryText("en", { totalPending: 0, rows: [row(3, "Sunita", 0, 0)], left: [] })).toBe(
      ["Pending this month", "Nothing is pending. Every room is paid up."].join("\n"),
    );
    expect(summaryText("mr", { totalPending: 0, rows: [], left: [] })).toBe(
      ["या महिन्याची बाकी", "काही बाकी नाही. सर्व खोल्या जमा आहेत."].join("\n"),
    );
  });

  it("no former-tenant section when none owe", () => {
    const text = summaryText("en", { totalPending: 9000, rows: [row(4, "Mahesh", 9000, 0)], left: [] });
    expect(text).not.toContain("Left");
  });
});
