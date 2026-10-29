import type { Key } from "./i18n";

export type Validated<T, F extends string> =
  | { ok: true; value: T }
  | { ok: false; errors: Partial<Record<F, Key>> };

export type TenantInput = { name: string; rentAmount: number; cycleStartDay: number; startedOn: string };
export type TenantField = keyof TenantInput;
export type RoomInput = { number: number; label?: string };
export type RoomField = keyof RoomInput;

export const NAME_MAX = 80;
export const LABEL_MAX = 40;
const ROOM_MAX = 9999;
const RENT_MAX = 10_000_000;

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** A whole number written as plain digits, or null. */
function wholeNumber(v: unknown): number | null {
  const s = text(v);
  return /^\d{1,9}$/.test(s) ? Number(s) : null;
}

export function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function validateTenant(raw: Record<string, unknown>): Validated<TenantInput, TenantField> {
  const errors: Partial<Record<TenantField, Key>> = {};

  const name = text(raw.name);
  if (!name) errors.name = "form.error.nameRequired";
  else if (name.length > NAME_MAX) errors.name = "form.error.nameLong";

  const rentAmount = wholeNumber(raw.rentAmount);
  if (rentAmount === null || rentAmount > RENT_MAX) errors.rentAmount = "form.error.rent";

  const cycleStartDay = wholeNumber(raw.cycleStartDay);
  if (cycleStartDay === null || cycleStartDay < 1 || cycleStartDay > 31) errors.cycleStartDay = "form.error.cycleDay";

  const startedOn = text(raw.startedOn);
  if (!isRealDate(startedOn)) errors.startedOn = "form.error.date";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, rentAmount: rentAmount!, cycleStartDay: cycleStartDay!, startedOn } };
}

export function validateRoom(raw: Record<string, unknown>): Validated<RoomInput, RoomField> {
  const errors: Partial<Record<RoomField, Key>> = {};

  const number = wholeNumber(raw.number);
  if (number === null || number < 1 || number > ROOM_MAX) errors.number = "form.error.roomNumber";

  const label = text(raw.label);
  if (label.length > LABEL_MAX) errors.label = "form.error.labelLong";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: label ? { number: number!, label } : { number: number! } };
}
