import { t, type Locale } from "./i18n";

const intlLocale = (locale: Locale) => (locale === "mr" ? "mr-IN-u-nu-latn" : "en-IN");

export function ordinal(locale: Locale, n: number): string {
  if (locale === "mr") return String(n);
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** The rent cycle in plain words: "calendar month" or "cycle 26th to 25th". */
export function cycleText(locale: Locale, startDay: number): string {
  if (startDay === 1) return t(locale, "cycle.calendar");
  return t(locale, "cycle.range", { from: ordinal(locale, startDay), to: ordinal(locale, startDay - 1) });
}

function utc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "1 Oct 2026" from YYYY-MM-DD. */
export function formatDay(locale: Locale, iso: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(utc(iso));
}

/** "Thursday, 29 October" from YYYY-MM-DD. */
export function formatWeekday(locale: Locale, iso: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(utc(iso));
}
