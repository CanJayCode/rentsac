import Link from "next/link";
import { t, type Key, type Locale } from "@/lib/i18n";

export type HomeTab = "all" | "rent" | "light";

export const HOME_TABS: { tab: HomeTab; label: Key }[] = [
  { tab: "all", label: "tab.all" },
  { tab: "rent", label: "tab.rent" },
  { tab: "light", label: "tab.light" },
];

export function parseTab(value: unknown): HomeTab {
  return value === "rent" || value === "light" ? value : "all";
}

/** Segmented All / Rent / Light, as links so the page renders on the server and the URL can be shared. */
export function FilterTabs({ locale, current }: { locale: Locale; current: HomeTab }) {
  return (
    <nav aria-label={t(locale, "home.tabs")} className="grid grid-cols-3 rounded-full bg-ink/[0.06] p-1">
      {HOME_TABS.map(({ tab, label }) => {
        const active = tab === current;
        return (
          <Link
            key={tab}
            href={tab === "all" ? "/" : `/?tab=${tab}`}
            scroll={false}
            replace
            aria-current={active ? "page" : undefined}
            className={`press deva-nudge flex min-h-11 items-center justify-center rounded-full px-3 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-green ${
              active ? "bg-card text-ink shadow-[0_1px_3px_rgba(29,43,36,0.12)]" : "text-ink/65"
            }`}
          >
            {t(locale, label)}
          </Link>
        );
      })}
    </nav>
  );
}
