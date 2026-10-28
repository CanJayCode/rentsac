export type Period = { start: string; end: string };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function format(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Start of the cycle that begins in the given month, clamped to its last day.
function startIn(startDay: number, year: number, month: number): string {
  return format(year, month, Math.min(startDay, daysInMonth(year, month)));
}

function shiftMonth(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function dayBefore(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  return format(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate());
}

function periodStartingIn(startDay: number, year: number, month: number): Period {
  const next = shiftMonth(year, month, 1);
  return {
    start: startIn(startDay, year, month),
    end: dayBefore(startIn(startDay, next.year, next.month)),
  };
}

export function periodContaining(startDay: number, date: string): Period {
  const [y, m] = date.split("-").map(Number);
  const { year, month } =
    date >= startIn(startDay, y, m) ? { year: y, month: m } : shiftMonth(y, m, -1);
  return periodStartingIn(startDay, year, month);
}

export function periodsBetween(startDay: number, from: string, to: string): Period[] {
  const periods: Period[] = [];
  let [year, month] = periodContaining(startDay, from).start.split("-").map(Number);
  if (startIn(startDay, year, month) < from) {
    ({ year, month } = shiftMonth(year, month, 1));
  }
  for (;;) {
    const period = periodStartingIn(startDay, year, month);
    if (period.start > to) break;
    periods.push(period);
    ({ year, month } = shiftMonth(year, month, 1));
  }
  return periods;
}
