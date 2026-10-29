import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { BuildingGlance, WINDOW_FILL, type WindowState } from "@/components/BuildingGlance";
import { FilterTabs, parseTab, type HomeTab } from "@/components/FilterTabs";
import { RoomList, RoomRow } from "@/components/RoomRow";
import { StatusChip } from "@/components/StatusChip";
import { requireSession } from "@/lib/auth/require-session";
import { formatWeekday } from "@/lib/format";
import { t, type Key, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { formatINR } from "@/lib/money";
import { homeSummary, type HomeRow } from "@/lib/rent";
import { getRepo } from "@/lib/repo";
import { todayIST } from "@/lib/today";

const TOTAL_LABEL: Record<HomeTab, Key> = {
  all: "home.pendingTotal",
  rent: "home.pendingRent",
  light: "home.pendingLight",
};

function dueFor(row: HomeRow, tab: HomeTab): number {
  return tab === "rent" ? row.pendingRent : tab === "light" ? row.pendingLight : row.pendingTotal;
}

async function loadHome() {
  const today = todayIST();
  const repo = await getRepo();
  const [summary, rooms] = await Promise.all([homeSummary(repo, today), repo.listRooms()]);
  return { today, summary, rooms: rooms.sort((a, b) => a.number - b.number) };
}

export default async function Home({ searchParams }: PageProps<"/">) {
  await requireSession();
  const [locale, { tab: rawTab }, { today, summary, rooms }] = await Promise.all([getLocale(), searchParams, loadHome()]);
  const tab = parseTab(rawTab);
  const { rows, left } = summary;

  const total = [...rows, ...left].reduce((sum, r) => sum + dueFor(r, tab), 0);
  const credit = [...rows, ...left].reduce((sum, r) => sum + r.credit, 0);
  const owing = rows.filter((r) => dueFor(r, tab) > 0).length;
  const empty = rows.length === 0 && left.length === 0;

  const byRoom = new Map(rows.map((r) => [r.roomId, r]));
  const windows = rooms.map((room) => {
    const row = byRoom.get(room.id);
    const state: WindowState = !row ? "vacant" : dueFor(row, tab) > 0 ? "due" : "paid";
    return { number: room.number, state };
  });

  const owingLine =
    owing === 0
      ? t(locale, tab === "rent" ? "home.roomsOwe.noneRent" : tab === "light" ? "home.roomsOwe.noneLight" : "home.roomsOwe.none")
      : t(locale, owing === 1 ? "home.roomsOwe.one" : "home.roomsOwe.many", { n: owing, total: rows.length });

  return (
    <div className="flex flex-col gap-5">
      <p className="rise px-1 text-base font-medium text-ink/60">{formatWeekday(locale, today)}</p>

      <section className="rise rounded-card bg-card p-5 shadow-soft" style={{ "--i": 1 } as CSSProperties}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-base font-medium text-ink/70">{t(locale, TOTAL_LABEL[tab])}</h1>
            <p className="figure mt-1.5 text-[2.75rem] leading-none font-semibold text-ink">{formatINR(total)}</p>
            {!empty ? (
              <p className={`mt-3 text-base leading-snug ${owing > 0 ? "text-ink/75" : "font-medium text-green-deep"}`}>
                {owingLine}
              </p>
            ) : null}
            {credit > 0 ? (
              <p className="mt-1 text-base leading-snug text-green-deep">
                {t(locale, "home.advanceHeld", { amount: formatINR(credit) })}
              </p>
            ) : null}
          </div>
          <BuildingGlance rooms={windows} label={t(locale, "home.glance")} />
        </div>
        {!empty ? <Legend locale={locale} /> : null}
      </section>

      <div className="rise grid grid-cols-2 gap-3" style={{ "--i": 2 } as CSSProperties}>
        <ActionLink href="/rooms" primary icon={<RupeeIcon />}>
          {t(locale, "home.recordPayment")}
        </ActionLink>
        <ActionLink href="/readings" icon={<MeterIcon />}>
          {t(locale, "home.startRound")}
        </ActionLink>
      </div>

      {empty ? (
        <FirstTenant locale={locale} />
      ) : (
        <>
          <div className="rise" style={{ "--i": 3 } as CSSProperties}>
            <FilterTabs locale={locale} current={tab} />
          </div>

          {rows.length > 0 ? (
            <section className="flex flex-col gap-2.5">
              <h2 className="px-1 text-lg font-semibold text-ink">{t(locale, "home.occupied")}</h2>
              <RoomList>
                {rows.map((row, i) => (
                  <RoomRow
                    key={row.tenantId}
                    index={4 + Math.min(i, 8)}
                    href={`/rooms/${row.roomNumber}`}
                    number={row.roomNumber}
                    title={row.tenantName}
                    detail={<DueLine locale={locale} row={row} tab={tab} />}
                    trailing={<StatusChip locale={locale} due={dueFor(row, tab)} />}
                  />
                ))}
              </RoomList>
            </section>
          ) : null}

          {left.length > 0 ? (
            <section className="flex flex-col gap-2.5">
              <div className="px-1">
                <h2 className="text-lg font-semibold text-ink">{t(locale, "home.leftTitle")}</h2>
                <p className="text-[0.9375rem] leading-snug text-ink/65">{t(locale, "home.leftHint")}</p>
              </div>
              <RoomList>
                {left.map((row, i) => (
                  <RoomRow
                    key={row.tenantId}
                    index={6 + Math.min(i, 8)}
                    href={`/rooms/${row.roomNumber}?tenant=${row.tenantId}`}
                    number={row.roomNumber}
                    muted
                    title={row.tenantName}
                    detail={<DueLine locale={locale} row={row} tab={tab} />}
                    trailing={<StatusChip locale={locale} due={dueFor(row, tab)} />}
                  />
                ))}
              </RoomList>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

// The chip already carries the amount: the line names what it is for, with figures only for a split.
function DueLine({ locale, row, tab }: { locale: Locale; row: HomeRow; tab: HomeTab }) {
  const rent = tab !== "light" && row.pendingRent > 0;
  const light = tab !== "rent" && row.pendingLight > 0;
  const parts: string[] = [];
  if (rent && light) {
    parts.push(`${t(locale, "money.rent")} ${formatINR(row.pendingRent)}`, `${t(locale, "tab.light")} ${formatINR(row.pendingLight)}`);
  } else if (rent) parts.push(t(locale, "home.rentDue"));
  else if (light) parts.push(t(locale, "home.lightDue"));
  else parts.push(t(locale, "home.nothingDue"));
  return (
    <>
      {parts.map((p, i) => (
        <span key={p} className="whitespace-nowrap">
          {i > 0 ? " · " : ""}
          {p}
        </span>
      ))}
      {row.credit > 0 ? (
        <span className="whitespace-nowrap text-green-deep">
          {" · "}
          {t(locale, "room.advance", { amount: formatINR(row.credit) })}
        </span>
      ) : null}
    </>
  );
}

function Legend({ locale }: { locale: Locale }) {
  const items: { state: WindowState; label: Key }[] = [
    { state: "due", label: "home.legend.due" },
    { state: "paid", label: "home.legend.paid" },
    { state: "vacant", label: "home.legend.vacant" },
  ];
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 rounded-2xl bg-well/60 px-3.5 py-2 text-[0.875rem] text-ink/70" aria-hidden="true">
      {items.map(({ state, label }) => (
        <li key={state} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: WINDOW_FILL[state] }} />
          {t(locale, label)}
        </li>
      ))}
    </ul>
  );
}

function ActionLink({ href, primary = false, icon, children }: { href: string; primary?: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`press flex min-h-[4.5rem] flex-col justify-between gap-2 rounded-[1.1rem] px-4 py-3 text-[1.0625rem] leading-tight font-semibold outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
        primary ? "bg-green text-white active:bg-green-deep" : "bg-card text-ink shadow-soft active:bg-well"
      }`}
    >
      <span className={primary ? "text-white/85" : "text-green"}>{icon}</span>
      <span>{children}</span>
    </Link>
  );
}

function FirstTenant({ locale }: { locale: Locale }) {
  return (
    <section className="rise rounded-card bg-card p-5 shadow-soft" style={{ "--i": 3 } as CSSProperties}>
      <h2 className="font-display text-[1.5rem] leading-tight font-semibold tracking-[-0.01em] text-ink">
        {t(locale, "home.firstTitle")}
      </h2>
      <p className="mt-2 text-base leading-relaxed text-ink/75">{t(locale, "home.firstBody")}</p>
      <Link
        href="/rooms"
        className="press mt-5 inline-flex min-h-12 items-center rounded-full bg-ink px-5 text-base font-semibold text-bg outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2"
      >
        {t(locale, "home.firstAction")}
      </Link>
    </section>
  );
}

const stroke = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function RupeeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 5h10M7 9h10M7 5h3.5a4 4 0 0 1 0 8H7l7 6" {...stroke} />
    </svg>
  );
}

function MeterIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" {...stroke} />
      <path d="M12 12 15.4 8.4" {...stroke} />
      <path d="M8.2 15.6h7.6" {...stroke} />
    </svg>
  );
}
