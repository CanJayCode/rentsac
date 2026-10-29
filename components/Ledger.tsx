import Link from "next/link";
import type { ReactNode } from "react";
import { DeletePayment, type DeletePaymentAction } from "@/components/DeletePayment";
import { periodContaining } from "@/lib/cycles";
import { dateParts, formatDay, formatDayMonth } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";
import type { ChargeRow, LedgerRow, PaymentRow } from "@/lib/ledger-view";
import { formatINR } from "@/lib/money";
import type { RepoCharge, RepoPayment } from "@/lib/repo/types";

type Row = LedgerRow<RepoCharge, RepoPayment>;
type DeleteAction = DeletePaymentAction;

type Props = {
  locale: Locale;
  rows: Row[];
  roomNumber: number;
  tenantId: string;
  cycleStartDay: number;
  /** Payments can be edited and deleted from here. */
  editable: boolean;
  /** Query string that keeps a former tenant selected on the pay form, "" for the room's tenant. */
  tenantQuery: string;
  highlight?: string;
  deleteAction: DeleteAction;
};

/** Every rent month, light bill, opening balance and payment of one tenant, newest first. */
export function Ledger({ locale, rows, roomNumber, tenantId, cycleStartDay, editable, tenantQuery, highlight, deleteAction }: Props) {
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="ledger-title">
      <h2 id="ledger-title" className="px-1 text-lg font-semibold text-ink">
        {t(locale, "ledger.title")}
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-card bg-well/70 px-5 py-4 text-base leading-relaxed text-ink/75">{t(locale, "ledger.empty")}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card bg-card shadow-soft">
          {rows.map((row) =>
            row.type === "charge" ? (
              <ChargeItem key={row.id} locale={locale} row={row} cycleStartDay={cycleStartDay} />
            ) : (
              <PaymentItem
                key={row.id}
                locale={locale}
                row={row}
                highlight={row.id === highlight}
                actions={
                  editable && !row.deleted ? (
                    <PaymentActions
                      locale={locale}
                      row={row}
                      roomNumber={roomNumber}
                      tenantId={tenantId}
                      tenantQuery={tenantQuery}
                      deleteAction={deleteAction}
                    />
                  ) : null
                }
              />
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function DatePlate({ locale, date, tone }: { locale: Locale; date: string; tone: "charge" | "payment" | "gone" }) {
  const { day, month } = dateParts(locale, date);
  const colour = tone === "payment" ? "bg-green-soft text-green-deep" : tone === "gone" ? "bg-well/60 text-ink/40" : "bg-well text-ink";
  return (
    <span className={`flex size-12 flex-none flex-col items-center justify-center rounded-[0.9rem] leading-none ${colour}`} aria-hidden="true">
      <span className="figure text-[1.25rem] font-medium">{day}</span>
      <span className="mt-0.5 text-[0.75rem] font-semibold">{month}</span>
    </span>
  );
}

function Line({ title, amount, amountClass, detail, aside }: { title: ReactNode; amount: ReactNode; amountClass: string; detail?: ReactNode; aside?: ReactNode }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-[1.0625rem] leading-snug font-semibold">{title}</p>
        <p className={`figure flex-none text-[1.1875rem] leading-snug font-semibold ${amountClass}`}>{amount}</p>
      </div>
      {detail || aside ? (
        <div className="mt-0.5 flex items-baseline justify-between gap-3">
          <p className="min-w-0 text-[0.9375rem] leading-snug text-ink/65">{detail}</p>
          {aside}
        </div>
      ) : null}
    </>
  );
}

function ChargeItem({ locale, row, cycleStartDay }: { locale: Locale; row: ChargeRow<RepoCharge>; cycleStartDay: number }) {
  const c = row.charge;
  let title: string;
  let detail: string;
  if (row.kind === "opening") {
    title = t(locale, row.bucket === "light" ? "ledger.opening.light" : "ledger.opening.rent");
    detail = t(locale, "ledger.openingHint");
  } else if (row.kind === "rent") {
    title = t(locale, "money.rent");
    const start = c.periodStart ?? c.dueDate;
    const end = periodContaining(cycleStartDay, start).end;
    detail = t(locale, "ledger.period", { from: formatDayMonth(locale, start), to: formatDay(locale, end) });
  } else {
    title = t(locale, "money.light");
    const parts: string[] = [];
    if (c.prevReading != null && c.currReading != null) {
      parts.push(t(locale, "ledger.reading", { prev: c.prevReading, curr: c.currReading }));
    }
    if (c.units != null && c.rate != null) parts.push(t(locale, "ledger.units", { units: c.units, rate: formatINR(c.rate) }));
    detail = parts.length > 0 ? parts.join(" · ") : formatDay(locale, c.dueDate);
  }

  const aside =
    row.state === "paid" ? (
      <span className="inline-flex flex-none items-center gap-1 text-[0.9375rem] font-semibold text-green-deep">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m3.5 8.4 2.9 2.9 6.1-6.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t(locale, "status.paid")}
      </span>
    ) : (
      <span className="flex-none text-[0.9375rem] font-semibold whitespace-nowrap text-amber-deep">
        {row.state === "part" ? t(locale, "chip.due", { amount: formatINR(row.amount - row.paid) }) : t(locale, "status.pending")}
      </span>
    );

  return (
    <li className="flex gap-3.5 px-4 py-3.5">
      <DatePlate locale={locale} date={row.date} tone="charge" />
      <div className="min-w-0 flex-1 text-ink">
        <Line title={title} amount={formatINR(row.amount)} amountClass="text-ink" detail={detail} aside={aside} />
      </div>
    </li>
  );
}

function modeText(locale: Locale, p: RepoPayment): string {
  if (p.cash > 0 && p.upi > 0) {
    return `${t(locale, "ledger.cashPart", { amount: formatINR(p.cash) })} · ${t(locale, "ledger.upiPart", { amount: formatINR(p.upi) })}`;
  }
  return t(locale, p.upi > 0 ? "pay.mode.upi" : "pay.mode.cash");
}

function PaymentItem({ locale, row, highlight, actions }: { locale: Locale; row: PaymentRow<RepoPayment>; highlight: boolean; actions: ReactNode }) {
  const p = row.payment;
  const forText = p.target === "rent" ? t(locale, "ledger.for.rent") : p.target === "light" ? t(locale, "ledger.for.light") : null;
  const detail = [modeText(locale, p), forText].filter(Boolean).join(" · ");

  return (
    <li id={`payment-${row.id}`} className={`flex scroll-mt-24 gap-3.5 px-4 py-3.5 ${highlight ? "bg-green-soft/45" : ""}`}>
      <DatePlate locale={locale} date={row.date} tone={row.deleted ? "gone" : "payment"} />
      <div className={`min-w-0 flex-1 ${row.deleted ? "text-ink/45" : "text-ink"}`}>
        {row.deleted ? (
          <>
            <Line
              title={<s className="decoration-ink/40">{t(locale, "ledger.payment")}</s>}
              amount={<s className="decoration-ink/40">{formatINR(row.amount)}</s>}
              amountClass="text-ink/45"
              detail={<s className="decoration-ink/30">{detail}</s>}
            />
            <p className="mt-1 text-[0.9375rem] leading-snug font-medium text-ink/60">
              {t(locale, "ledger.deletedOn", { date: formatDay(locale, row.deletedAt!) })}
            </p>
          </>
        ) : (
          <Line title={t(locale, "ledger.payment")} amount={formatINR(row.amount)} amountClass="text-green-deep" detail={detail} />
        )}
        {p.note ? (
          <p className={`mt-1.5 text-[0.9375rem] leading-snug break-words ${row.deleted ? "text-ink/40 line-through" : "text-ink/80"}`}>
            “{p.note}”
          </p>
        ) : null}
        {actions}
      </div>
    </li>
  );
}

function PaymentActions({
  locale,
  row,
  roomNumber,
  tenantId,
  tenantQuery,
  deleteAction,
}: {
  locale: Locale;
  row: PaymentRow<RepoPayment>;
  roomNumber: number;
  tenantId: string;
  tenantQuery: string;
  deleteAction: DeleteAction;
}) {
  const amount = formatINR(row.amount);
  return (
    <DeletePayment
      locale={locale}
      action={deleteAction}
      roomNumber={roomNumber}
      tenantId={tenantId}
      paymentId={row.id}
      amount={amount}
      edit={
        <Link
          href={`/rooms/${roomNumber}/pay?${tenantQuery}edit=${row.id}`}
          aria-label={t(locale, "ledger.editPayment", { amount })}
          className="press -ml-3 inline-flex min-h-11 items-center rounded-full px-3 text-base font-semibold text-green outline-none active:bg-green/10 focus-visible:ring-2 focus-visible:ring-green"
        >
          {t(locale, "common.edit")}
        </Link>
      }
    />
  );
}
