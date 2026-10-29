import Link from "next/link";
import { Fragment, type CSSProperties } from "react";
import { RoomList, RoomRow } from "@/components/RoomRow";
import { StatusChip } from "@/components/StatusChip";
import { requireSession } from "@/lib/auth/require-session";
import { t, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { formatINR } from "@/lib/money";
import { homeSummary, type HomeRow } from "@/lib/rent";
import { getRepo } from "@/lib/repo";
import { todayIST } from "@/lib/today";

/** "Who paid?": every room with a tenant, then former tenants who still owe, each with what they owe. */
export default async function PayPicker() {
  await requireSession();
  const [locale, repo] = await Promise.all([getLocale(), getRepo()]);
  const { rows, left } = await homeSummary(repo, todayIST());

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/"
        className="rise -ml-1 inline-flex min-h-11 items-center gap-1 self-start rounded-full pr-3 pl-1 text-base font-semibold text-green outline-none active:bg-green/10 focus-visible:ring-2 focus-visible:ring-green"
      >
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t(locale, "nav.home")}
      </Link>

      <div className="rise px-1" style={{ "--i": 1 } as CSSProperties}>
        <h1 className="font-display text-[1.875rem] leading-tight font-semibold tracking-[-0.02em] text-ink">{t(locale, "picker.title")}</h1>
        {rows.length + left.length > 0 ? <p className="mt-1 text-base text-ink/65">{t(locale, "picker.hint")}</p> : null}
      </div>

      {rows.length + left.length === 0 ? (
        <section className="rise rounded-card bg-card p-5 shadow-soft" style={{ "--i": 2 } as CSSProperties}>
          <p className="text-base leading-relaxed text-ink/75">{t(locale, "picker.empty")}</p>
          <Link
            href="/rooms"
            className="press mt-5 inline-flex min-h-12 items-center rounded-full bg-ink px-5 text-base font-semibold text-bg outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2"
          >
            {t(locale, "home.firstAction")}
          </Link>
        </section>
      ) : null}

      {rows.length > 0 ? (
        <RoomList label={t(locale, "home.occupied")}>
          {rows.map((row, i) => (
            <RoomRow
              key={row.tenantId}
              index={2 + Math.min(i, 8)}
              href={`/rooms/${row.roomNumber}/pay`}
              number={row.roomNumber}
              title={row.tenantName}
              detail={<Owed locale={locale} row={row} />}
              trailing={<StatusChip locale={locale} due={row.pendingTotal} />}
            />
          ))}
        </RoomList>
      ) : null}

      {left.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="px-1 text-lg font-semibold text-ink">{t(locale, "home.leftTitle")}</h2>
          <RoomList>
            {left.map((row, i) => (
              <RoomRow
                key={row.tenantId}
                index={4 + Math.min(i, 8)}
                href={`/rooms/${row.roomNumber}/pay?tenant=${row.tenantId}`}
                number={row.roomNumber}
                muted
                title={row.tenantName}
                detail={<Owed locale={locale} row={row} />}
                trailing={<StatusChip locale={locale} due={row.pendingTotal} />}
              />
            ))}
          </RoomList>
        </section>
      ) : null}
    </div>
  );
}

function Owed({ locale, row }: { locale: Locale; row: HomeRow }) {
  const parts: string[] = [];
  if (row.pendingRent > 0) parts.push(`${t(locale, "money.rent")} ${formatINR(row.pendingRent)}`);
  if (row.pendingLight > 0) parts.push(`${t(locale, "tab.light")} ${formatINR(row.pendingLight)}`);
  if (parts.length === 0) parts.push(t(locale, "picker.nothingDue"));
  if (row.credit > 0) parts.push(t(locale, "room.advance", { amount: formatINR(row.credit) }));
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={part}>
          {i > 0 ? " · " : ""}
          <span className="whitespace-nowrap">{part}</span>
        </Fragment>
      ))}
    </>
  );
}
