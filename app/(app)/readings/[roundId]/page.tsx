import Link from "next/link";
import { notFound } from "next/navigation";
import { RoundEntry } from "@/components/ReadingList";
import { requireSession } from "@/lib/auth/require-session";
import { formatDay } from "@/lib/format";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { formatINR } from "@/lib/money";
import { getRepo } from "@/lib/repo";
import { loadRound } from "@/lib/rounds";
import { getRate } from "@/lib/settings";
import { saveRoundAction } from "../actions";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The round itself: every room and main meter in one list. Only the newest open round takes readings. */
export default async function RoundPage({ params, searchParams }: PageProps<"/readings/[roundId]">) {
  await requireSession();
  const [{ roundId }, query, locale] = await Promise.all([params, searchParams, getLocale()]);
  const repo = await getRepo();
  const [view, rate] = await Promise.all([loadRound(repo, roundId), getRate(repo)]);
  if (!view) notFound();

  const saved = one(query.saved);
  const bills = view.rows.filter((r) => r.bill);
  const billedTotal = bills.reduce((sum, r) => sum + r.bill!.amount, 0);
  const done = view.round.status === "done";

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/readings"
        className="rise -ml-1 inline-flex min-h-11 items-center gap-1 self-start rounded-full pr-3 pl-1 text-base font-semibold text-green outline-none active:bg-green/10 focus-visible:ring-2 focus-visible:ring-green"
      >
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t(locale, "readings.title")}
      </Link>

      <div className="rise px-1">
        <h1 className="font-display text-[1.875rem] leading-tight font-semibold tracking-[-0.02em] text-ink">
          {t(locale, "readings.roundOf", { date: formatDay(locale, view.round.date) })}
        </h1>
        <p className="mt-1 text-base leading-snug text-ink/70">
          {t(locale, "readings.rate", { rate: formatINR(rate) })}
          {bills.length > 0 ? ` · ${t(locale, "readings.billed", { amount: formatINR(billedTotal) })}` : ""}
        </p>
      </div>

      {saved ? (
        <p role="status" className={`rise rounded-2xl px-4 py-3 text-base leading-snug font-semibold ${done ? "bg-green-soft text-green-deep" : "bg-well text-ink/80"}`}>
          {done ? t(locale, "readings.saved.done", { n: bills.length, amount: formatINR(billedTotal) }) : t(locale, "readings.saved.partial")}
        </p>
      ) : null}

      {!view.editable ? (
        <p className="rise rounded-2xl bg-well px-4 py-3 text-base leading-snug text-ink/80">{t(locale, "readings.readOnly")}</p>
      ) : bills.length > 0 ? (
        <p className="rise px-1 text-[0.9375rem] leading-snug text-ink/65">{t(locale, "readings.lockedHint")}</p>
      ) : null}

      {/* Keyed on each save, so the list starts again from what was stored. */}
      <RoundEntry
        key={saved ?? "first"}
        locale={locale}
        roundId={view.round.id}
        rate={rate}
        editable={view.editable}
        rows={view.rows}
        main={view.main}
        action={saveRoundAction}
      />
    </div>
  );
}
