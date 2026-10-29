import type { Locale } from "./i18n";
import { formatINR } from "./money";

/** The part of a stored charge a bill message needs (a RepoCharge fits). */
export type ShareCharge = {
  kind: "rent" | "light" | "opening";
  dueDate: string;
  amount: number;
  openingFor?: "rent" | "light";
  rate?: number;
  prevReading?: number;
  currReading?: number;
  units?: number;
};

export type SharePending = { rent: number; light: number; total: number; advance?: number };

export type ShareRow = {
  roomNumber: number;
  tenantName: string;
  pendingRent: number;
  pendingLight: number;
  pendingTotal: number;
};

const WORDS = {
  en: {
    hello: "Hello {name}, Room {room}",
    lightWithReadings: "Light bill: previous reading {prev}, new reading {curr}",
    lightBill: "Light bill",
    unit: "unit",
    units: "units",
    lightPending: "Light bill pending: {amount}",
    rentPending: "Rent pending: {amount}",
    total: "Total pending: {amount}",
    advance: "Advance paid: {amount}",
    thanks: "Thank you.",
    clear: "All clear, nothing is pending.",
    summaryTitle: "Pending this month",
    room: "Room {room}, {name}: {amount}",
    rent: "rent",
    light: "light bill",
    none: "Nothing is pending. Every room is paid up.",
    left: "Left, still owes",
  },
  mr: {
    hello: "नमस्कार {name}, खोली {room}",
    lightWithReadings: "लाईट बिल: मागील रीडिंग {prev}, नवीन रीडिंग {curr}",
    lightBill: "लाईट बिल",
    unit: "युनिट",
    units: "युनिट",
    lightPending: "लाईट बिल बाकी: {amount}",
    rentPending: "भाडे बाकी: {amount}",
    total: "एकूण बाकी: {amount}",
    advance: "आगाऊ जमा: {amount}",
    thanks: "धन्यवाद.",
    clear: "सर्व हिशोब जमा, काही बाकी नाही.",
    summaryTitle: "या महिन्याची बाकी",
    room: "खोली {room}, {name}: {amount}",
    rent: "भाडे",
    light: "लाईट बिल",
    none: "काही बाकी नाही. सर्व खोल्या जमा आहेत.",
    left: "सोडून गेले, अजून बाकी",
  },
} as const;

type Words = (typeof WORDS)[Locale];

function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** The newest light bill (an opening balance has no readings, so it never counts). */
function latestLight(charges: ShareCharge[]): ShareCharge | null {
  let best: ShareCharge | null = null;
  for (const c of charges) {
    if (c.kind === "light" && (!best || c.dueDate >= best.dueDate)) best = c;
  }
  return best;
}

function lightLines(w: Words, c: ShareCharge): string[] {
  const hasReadings = c.prevReading !== undefined && c.currReading !== undefined;
  const units = c.units ?? (hasReadings ? c.currReading! - c.prevReading! : undefined);
  if (units === undefined || c.rate === undefined) return [`${w.lightBill}: ${formatINR(c.amount)}`];
  const calc = `${units} ${units === 1 ? w.unit : w.units} × ${formatINR(c.rate)} = ${formatINR(c.amount)}`;
  if (!hasReadings) return [`${w.lightBill}: ${calc}`];
  return [fill(w.lightWithReadings, { prev: c.prevReading!, curr: c.currReading! }), calc];
}

/** WhatsApp-ready bill for one tenant: latest light bill, what is pending, advance if any. Plain text. */
export function billMessage(
  locale: Locale,
  tenant: { name: string; roomNumber: number },
  charges: ShareCharge[],
  pending: SharePending,
): string {
  const w = WORDS[locale];
  const lines = [fill(w.hello, { name: tenant.name, room: tenant.roomNumber }), ""];
  const advance = pending.advance && pending.advance > 0 ? fill(w.advance, { amount: formatINR(pending.advance) }) : null;

  if (pending.total <= 0) {
    if (advance) lines.push(w.clear, advance, w.thanks);
    else lines.push(`${w.clear} ${w.thanks}`);
    return lines.join("\n");
  }

  const light = pending.light > 0 ? latestLight(charges) : null;
  if (light) lines.push(...lightLines(w, light));
  if (pending.light > 0) lines.push(fill(w.lightPending, { amount: formatINR(pending.light) }));
  if (pending.rent > 0) lines.push(fill(w.rentPending, { amount: formatINR(pending.rent) }));
  lines.push("", fill(w.total, { amount: formatINR(pending.total) }));
  if (advance) lines.push(advance);
  lines.push(w.thanks);
  return lines.join("\n");
}

export function waLink(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

function summaryLine(w: Words, r: ShareRow): string {
  const parts: string[] = [];
  if (r.pendingRent > 0 && r.pendingLight > 0) {
    parts.push(`${w.rent} ${formatINR(r.pendingRent)}`, `${w.light} ${formatINR(r.pendingLight)}`);
  } else parts.push(r.pendingRent > 0 ? w.rent : w.light);
  return `${fill(w.room, { room: r.roomNumber, name: r.tenantName, amount: formatINR(r.pendingTotal) })} (${parts.join(", ")})`;
}

/** Plain-text building summary of what is pending now: owing rooms, the total, former tenants who owe. */
export function summaryText(
  locale: Locale,
  home: { totalPending: number; rows: ShareRow[]; left: ShareRow[] },
): string {
  const w = WORDS[locale];
  const owing = home.rows.filter((r) => r.pendingTotal > 0);
  const left = home.left.filter((r) => r.pendingTotal > 0);
  const lines: string[] = [w.summaryTitle];
  if (owing.length === 0 && left.length === 0) return [...lines, w.none].join("\n");

  lines.push(...owing.map((r) => summaryLine(w, r)));
  if (owing.length > 0) lines.push("");
  lines.push(fill(w.total, { amount: formatINR(home.totalPending) }));
  if (left.length > 0) lines.push("", w.left, ...left.map((r) => summaryLine(w, r)));
  return lines.join("\n");
}
