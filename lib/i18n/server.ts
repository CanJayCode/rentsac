import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LANG_COOKIE, type Locale } from "./index";

/** The visitor's language from the `lang` cookie; English when missing or not recognised. */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
