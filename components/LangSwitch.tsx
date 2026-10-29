"use client";

import { useTransition } from "react";
import { setLocale } from "@/lib/i18n/actions";
import { t, type Locale } from "@/lib/i18n";

const OPTIONS: { locale: Locale; label: string }[] = [
  { locale: "en", label: "EN" },
  { locale: "mr", label: "मराठी" },
];

type Props = {
  locale: Locale;
  /** Smaller and quieter, for the lock screen. */
  compact?: boolean;
};

/** Two-way language toggle. Writes the lang cookie through a server action, then the page re-renders. */
export function LangSwitch({ locale, compact = false }: Props) {
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === locale || pending) return;
    startTransition(async () => {
      await setLocale(next);
    });
  }

  return (
    <div
      role="group"
      aria-label={t(locale, "lang.label")}
      className={`inline-flex rounded-full bg-ink/[0.06] p-[3px] ${pending ? "opacity-70" : ""}`}
    >
      {OPTIONS.map((o) => {
        const active = o.locale === locale;
        return (
          <button
            key={o.locale}
            type="button"
            lang={o.locale}
            aria-pressed={active}
            onClick={() => choose(o.locale)}
            className={`rounded-full font-semibold leading-none transition-colors duration-150 motion-reduce:transition-none ${
              compact ? "min-h-8 min-w-10 px-2.5 text-[0.8125rem]" : "min-h-9 min-w-11 px-3 text-sm"
            } ${o.locale === "mr" ? "pt-[0.2rem]" : ""} ${active ? "bg-green text-white" : "text-ink/65 active:bg-ink/10"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
