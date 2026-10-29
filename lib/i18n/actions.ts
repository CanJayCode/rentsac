"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isLocale, LANG_COOKIE } from "./index";

const ONE_YEAR_S = 60 * 60 * 24 * 365;

/** Sets the language cookie. Needs no session: the lock screen has the switch too. */
export async function setLocale(locale: unknown): Promise<void> {
  if (!isLocale(locale)) throw new Error("Unsupported language");
  (await cookies()).set(LANG_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR_S,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
}
