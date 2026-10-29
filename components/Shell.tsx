"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LangSwitch } from "@/components/LangSwitch";
import { t, type Key, type Locale } from "@/lib/i18n";

type NavItem = { href: string; label: Key; icon: (props: { filled: boolean }) => ReactNode };

const NAV: NavItem[] = [
  { href: "/", label: "nav.home", icon: HomeIcon },
  { href: "/readings", label: "nav.readings", icon: ReadingsIcon },
  { href: "/rooms", label: "nav.rooms", icon: RoomsIcon },
  { href: "/settings", label: "nav.settings", icon: SettingsIcon },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** The frame every signed-in screen lives in: header, scrolling content and a thumb-sized bottom bar. */
export function Shell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex w-full max-w-[30rem] flex-1 flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-bg px-5 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-[0.6rem] bg-green text-bg" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 4 4.5 10.2V19h15v-8.8L12 4Z" fill="currentColor" />
              <circle cx="12" cy="12.4" r="1.7" fill="var(--green)" />
              <path d="M11.2 13.6h1.6l.5 3.2h-2.6l.5-3.2Z" fill="var(--green)" />
            </svg>
          </span>
          <span className="font-display text-[1.3rem] font-semibold tracking-[-0.01em] text-green">
            {t(locale, "app.name")}
          </span>
        </div>
        <LangSwitch locale={locale} />
      </header>

      <main className="flex flex-1 flex-col px-5 pb-[calc(6.25rem+env(safe-area-inset-bottom))] pt-3">{children}</main>

      <nav
        aria-label={t(locale, "nav.label")}
        className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[30rem] rounded-t-[1.75rem] bg-card px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-6px_28px_rgba(29,43,36,0.09)]"
      >
        <ul className="grid grid-cols-4">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1 text-[0.8125rem] leading-tight font-medium outline-none focus-visible:ring-2 focus-visible:ring-green ${
                    active ? "text-green" : "text-ink/60"
                  }`}
                >
                  <span
                    className={`grid h-7 w-14 place-items-center rounded-full transition-colors duration-150 motion-reduce:transition-none ${
                      active ? "bg-green/12" : ""
                    }`}
                  >
                    <Icon filled={active} />
                  </span>
                  <span className={active ? "font-semibold" : ""}>{t(locale, label)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

const stroke = { stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function tint(filled: boolean) {
  return { fill: filled ? "currentColor" : "none", fillOpacity: filled ? 0.18 : 0 } as const;
}

function HomeIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 10.6 12 4l8 6.6V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.4Z" {...stroke} {...tint(filled)} />
    </svg>
  );
}

function ReadingsIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" {...stroke} {...tint(filled)} />
      <path d="M12 12 15.4 8.4" {...stroke} />
      <path d="M8.2 15.6h7.6" {...stroke} />
    </svg>
  );
}

function RoomsIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="3.5" width="14" height="17" rx="1.6" {...stroke} {...tint(filled)} />
      <path d="M9 8h1.6M13.4 8H15M9 12h1.6M13.4 12H15" {...stroke} />
      <path d="M10.5 20.5V17h3v3.5" {...stroke} />
    </svg>
  );
}

function SettingsIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 8h9M17 8h3M4 16h3M11 16h9" {...stroke} />
      <circle cx="15" cy="8" r="2.1" {...stroke} {...tint(filled)} />
      <circle cx="9" cy="16" r="2.1" {...stroke} {...tint(filled)} />
    </svg>
  );
}
