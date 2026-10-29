import type { HomeRow } from "./rent";

export type HomeTab = "all" | "rent" | "light";

export function dueFor(row: HomeRow, tab: HomeTab): number {
  return tab === "rent" ? row.pendingRent : tab === "light" ? row.pendingLight : row.pendingTotal;
}

export type HeroState = {
  /** What the big figure shows for this tab: occupied rooms and former tenants together. */
  total: number;
  credit: number;
  /** Only true when nothing at all is pending for this tab. */
  clear: boolean;
  owingRooms: number;
  occupied: number;
  owingFormer: number;
};

export function heroState(rows: HomeRow[], left: HomeRow[], tab: HomeTab): HeroState {
  const all = [...rows, ...left];
  const total = all.reduce((sum, r) => sum + dueFor(r, tab), 0);
  return {
    total,
    credit: all.reduce((sum, r) => sum + r.credit, 0),
    clear: total === 0,
    owingRooms: rows.filter((r) => dueFor(r, tab) > 0).length,
    occupied: rows.length,
    owingFormer: left.filter((r) => dueFor(r, tab) > 0).length,
  };
}
