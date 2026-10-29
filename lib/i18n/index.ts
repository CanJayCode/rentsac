import { en } from "./en";
import { mr } from "./mr";

export type Locale = "en" | "mr";
export type Key = keyof typeof en;

export const LOCALES: readonly Locale[] = ["en", "mr"];
export const DEFAULT_LOCALE: Locale = "en";
export const LANG_COOKIE = "lang";

const dictionaries: Record<Locale, Record<Key, string>> = { en, mr };

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "mr";
}

/** Looks up `key` and fills `{name}` placeholders. Unknown placeholders are left as written. */
export function t(locale: Locale, key: Key, vars?: Record<string, string | number>): string {
  const text = dictionaries[locale][key];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole,
  );
}
