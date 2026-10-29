import Link from "next/link";
import { requireSession } from "@/lib/auth/require-session";
import { formatDay } from "@/lib/format";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { getRepo } from "@/lib/repo";
import { todayIST } from "@/lib/today";
import { startRound } from "../actions";
import { NewRoundForm } from "./NewRoundForm";

/** Choose the round's date (today by default) and start it. */
export default async function NewRoundPage() {
  await requireSession();
  const repo = await getRepo();
  const [locale, rounds, rooms] = await Promise.all([getLocale(), repo.listRounds(), repo.listRooms()]);
  const newest = rounds[0] ?? null;
  const open = newest?.status === "open" ? newest : null;
  const openRead = open ? (await repo.listReadings(open.id)).length : 0;
  const today = todayIST();

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/readings"
        className="rise -ml-1 inline-flex min-h-11 items-center gap-1 self-start rounded-full pr-3 pl-1 text-base font-semibold text-green outline-none active:bg-green/10 focus-visible:ring-2 focus-visible:ring-green"
      >
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t(locale, "readings.title")}
      </Link>
      <h1 className="rise px-1 font-display text-3xl font-semibold tracking-[-0.02em] text-ink">{t(locale, "readings.newTitle")}</h1>

      {open ? (
        <p className="rise rounded-2xl bg-amber-soft px-4 py-3 text-base leading-snug font-medium text-amber-deep">
          {t(locale, "readings.openWarn", { date: formatDay(locale, open.date), n: openRead, total: rooms.length })}
        </p>
      ) : null}

      <NewRoundForm locale={locale} action={startRound} today={today} min={newest?.date ?? null} />
    </div>
  );
}
