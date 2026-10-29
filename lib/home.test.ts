import { describe, expect, it } from "vitest";
import { dueFor, heroState } from "./home";
import type { HomeRow } from "./rent";

const row = (n: number, rent: number, light = 0, credit = 0): HomeRow => ({
  roomId: `r${n}`,
  roomNumber: n,
  tenantId: `t${n}`,
  tenantName: `T${n}`,
  pendingRent: rent,
  pendingLight: light,
  pendingTotal: rent + light,
  credit,
  status: rent + light > 0 ? "due" : "paid",
});

describe("dueFor", () => {
  it("picks the tab's bucket", () => {
    const r = row(1, 3000, 420);
    expect([dueFor(r, "all"), dueFor(r, "rent"), dueFor(r, "light")]).toEqual([3420, 3000, 420]);
  });
});

describe("heroState", () => {
  it("is clear only when the tab total is zero", () => {
    expect(heroState([row(1, 0), row(2, 0)], [], "all")).toEqual({
      total: 0, credit: 0, clear: true, owingRooms: 0, occupied: 2, owingFormer: 0,
    });
  });

  it("counts occupied rooms that owe and former tenants separately", () => {
    const s = heroState([row(1, 3000), row(2, 0, 0, 500)], [row(3, 6000)], "all");
    expect(s).toEqual({ total: 9000, credit: 500, clear: false, owingRooms: 1, occupied: 2, owingFormer: 1 });
  });

  it("is not clear when every room is paid but a former tenant owes", () => {
    const s = heroState([row(1, 0)], [row(3, 6000)], "all");
    expect(s.clear).toBe(false);
    expect(s.owingRooms).toBe(0);
    expect(s.owingFormer).toBe(1);
    expect(s.total).toBe(6000);
  });

  it("follows the tab", () => {
    const s = heroState([row(1, 3000, 0)], [row(3, 0, 200)], "light");
    expect(s).toMatchObject({ total: 200, owingRooms: 0, owingFormer: 1, clear: false });
    expect(heroState([row(1, 3000, 0)], [], "light").clear).toBe(true);
  });
});
