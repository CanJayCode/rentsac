import Link from "next/link";
import type { CSSProperties } from "react";
import { DatePlate } from "@/components/Ledger";
import { requireSession } from "@/lib/auth/require-session";
import { formatDay } from "@/lib/format";
import { t, type Key } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { formatINR } from "@/lib/money";
import { getRepo } from "@/lib/repo";

type Status = "open" | "done" | "closed";

const STATUS: Record<Status, { label: Key; className: string }> = {
  open: { label: "readings.status.open", className: "bg-amber-soft text-amber-deep" },
  done: { label: "readings.status.done", className: "bg-green-soft text-green-deep" },
  closed: { label: "readings.status.closed", className: "bg-well text-ink/70" },
};

async function loadRounds() {
  const repo = await getRepo();
  const [rounds, rooms, tenants] = await Promise.all([repo.listRounds(), repo.listRooms(), repo.listTenants()]);
  const [counts, charges] = await Promise.all([
    Promise.all(rounds.map(async (r) => (await repo.listReadings(r.id)).length)),
    Promise.all(tenants.map((tn) => repo.listCharges(tn.id))),
  ]);
  const bills = new Map<string, { n: number; amount: number }>();
  for (const c of charges.flat()) {
    if (c.kind !== "light" || !c.roundId) continue;
    const b = bills.get(c.roundId) ?? { n: 0, amount: 0 };
    bills.set(c.roundId, { n: b.n + 1, amount: b.amount + c.amount });
  }
  return {
    total: rooms.length,
    rounds: rounds.map((r, i) => ({
      ...r,
      read: counts[i],
      bills: bills.get(r.id) ?? { n: 0, amount: 0 },
      // Only the newest round takes readings; an older one left open is closed for entry.
      shown: (r.status === "done" ? "done" : i === 0 ? "open" : "closed") as Status,
    })),
  };
}

/** Past reading rounds, newest first, with a way into the open one and a new one. */
export default async function ReadingsPage() {
  await requireSession();
  const [locale, { total, rounds }] = await Promise.all([getLocale(), loadRounds()]);
  const open = rounds[0]?.shown === "open" ? rounds[0] : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="rise px-1">
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink">{t(locale, "readings.title")}</h1>
        <p className="mt-1 text-base leading-snug text-ink/70">{t(locale, "readings.subtitle")}</p>
      </div>

      {open ? (
        <section className="rise flex flex-col gap-4 rounded-card bg-card p-5 shadow-soft" style={{ "--i": 1 } as CSSProperties}>
          <div>
            <p className="font-display text-[1.375rem] leading-tight font-semibold tracking-[-0.01em] text-ink">
              {t(locale, "readings.roundOf", { date: formatDay(locale, open.date) })}
            </p>
            <p className="mt-1 text-base text-ink/70">{t(locale, "readings.roomsRead", { n: open.read, total })}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
              <div className="h-full rounded-full bg-green" style={{ width: `${total ? (open.read / total) * 100 : 0}%` }} />
            </div>
          </div>
          <Link
            href={`/readings/${open.id}`}
            className="press deva-nudge flex min-h-14 items-center justify-center rounded-full bg-green px-6 text-lg font-semibold text-white outline-none active:bg-green-deep focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2"
          >
            {t(locale, "readings.continue")}
          </Link>
          <Link
            href="/readings/new"
            className="press deva-nudge -mt-1 flex min-h-12 items-center justify-center rounded-full px-6 text-base font-semibold text-green outline-none active:bg-green/10 focus-visible:ring-2 focus-visible:ring-green"
          >
            {t(locale, "readings.start")}
          </Link>
        </section>
      ) : (
        <Link
          href="/readings/new"
          style={{ "--i": 1 } as CSSProperties}
          className="rise press deva-nudge flex min-h-14 items-center justify-center gap-2 rounded-full bg-green px-6 text-lg font-semibold text-white outline-none active:bg-green-deep focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {t(locale, "readings.start")}
        </Link>
      )}

      {rounds.length === 0 ? (
        <p className="rise rounded-card bg-well/70 px-5 py-4 text-base leading-relaxed text-ink/75" style={{ "--i": 2 } as CSSProperties}>
          {t(locale, "readings.empty")}
        </p>
      ) : (
        <section className="flex flex-col gap-2.5">
          <h2 className="px-1 text-lg font-semibold text-ink">{t(locale, "readings.pastTitle")}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-card bg-card shadow-soft">
            {rounds.map((r, i) => (
              <li key={r.id} className="rise" style={{ "--i": 2 + Math.min(i, 8) } as CSSProperties}>
                <Link
                  href={`/readings/${r.id}`}
                  className="row-press flex min-h-[4.75rem] items-center gap-3.5 px-4 py-3 outline-none focus-visible:bg-well focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green"
                >
                  <DatePlate locale={locale} date={r.date} tone="charge" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="sr-only">{formatDay(locale, r.date)}: </span>
                    <span className="text-[1.0625rem] leading-snug font-semibold text-ink">{t(locale, "readings.roomsRead", { n: r.read, total })}</span>
                    <span className="mt-0.5 text-[0.9375rem] leading-snug text-ink/65">
                      {r.bills.n === 0
                        ? t(locale, "readings.listNoBills")
                        : t(locale, r.bills.n === 1 ? "readings.listBills.one" : "readings.listBills.many", { n: r.bills.n, amount: formatINR(r.bills.amount) })}
                    </span>
                  </span>
                  <span className={`deva-nudge inline-flex h-8 flex-none items-center rounded-full px-3 text-[0.9375rem] font-semibold whitespace-nowrap ${STATUS[r.shown].className}`}>
                    {t(locale, STATUS[r.shown].label)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
