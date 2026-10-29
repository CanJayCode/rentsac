import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { Ledger } from "@/components/Ledger";
import { RoomBadge } from "@/components/RoomBadge";
import { RoomList, RoomRow } from "@/components/RoomRow";
import { StatusChip } from "@/components/StatusChip";
import { requireSession } from "@/lib/auth/require-session";
import { cycleText, formatDay } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { ledgerRows } from "@/lib/ledger-view";
import { formatINR } from "@/lib/money";
import { tenantAccount, tenantBalance, type Balance } from "@/lib/rent";
import type { Repo, RepoPayment, Tenant } from "@/lib/repo/types";
import { deletePayment } from "./actions";
import { loadRoom } from "./data";
import { VacatePanel } from "./VacatePanel";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Whether the room has a reading in the latest round (for the final reading before a tenant leaves). */
async function hasLatestReading(repo: Repo, roomId: string): Promise<boolean> {
  const [latest] = await repo.listRounds();
  return Boolean(latest && (await repo.listReadings(latest.id)).some((r) => r.roomId === roomId));
}

export default async function RoomPage({ params, searchParams }: PageProps<"/rooms/[room]">) {
  await requireSession();
  const [{ room: param }, query, locale] = await Promise.all([params, searchParams, getLocale()]);
  const { repo, room, tenants, active, today } = await loadRoom(param);

  const askedFor = one(query.tenant);
  const shown = askedFor ? tenants.find((tn) => tn.id === askedFor) : active;
  if (askedFor && !shown) notFound();

  const balances = new Map<string, Balance>(
    await Promise.all(tenants.map(async (tn) => [tn.id, await tenantBalance(repo, tn, today)] as const)),
  );
  const account = shown ? await tenantAccount(repo, shown, today) : null;
  const notice = paymentNotice(query, account?.payments ?? []);
  const tenantQuery = shown?.leftOn ? `tenant=${shown.id}&` : "";
  // A former tenant can still pay what they owe, and a mistaken entry can still be put right.
  const canPay = Boolean(shown && (!shown.leftOn || balances.get(shown.id)!.total > 0));
  const former = tenants.filter((tn) => tn.leftOn && tn.id !== shown?.id && balances.get(tn.id)!.total > 0);
  const justLeft = tenants.find((tn) => tn.id === one(query.left) && tn.leftOn);

  return (
    <div className="flex flex-col gap-5">
      <div className="rise flex items-center justify-between gap-3">
      <Link
        href={askedFor && active ? `/rooms/${room.number}` : "/rooms"}
        className="-ml-1 inline-flex min-h-11 items-center gap-1 rounded-full pr-3 pl-1 text-base font-semibold text-green outline-none active:bg-green/10 focus-visible:ring-2 focus-visible:ring-green"
      >
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {askedFor && active ? t(locale, "roomPage.backToRoom", { n: room.number }) : t(locale, "rooms.title")}
      </Link>
        <Link
          href={`/rooms/${room.number}/details`}
          className="inline-flex min-h-11 items-center rounded-full px-3 text-base font-semibold text-ink/65 outline-none active:bg-ink/5 focus-visible:ring-2 focus-visible:ring-green"
        >
          {t(locale, "roomEdit.link")}
        </Link>
      </div>

      {justLeft ? <LeftNotice locale={locale} name={justLeft.name} /> : null}
      {notice ? <PaymentNotice locale={locale} notice={notice} /> : null}

      {shown ? (
        <>
          <TenantSummary
            locale={locale}
            roomNumber={room.number}
            roomLabel={room.label}
            tenant={shown}
            balance={balances.get(shown.id)!}
            payHref={canPay ? `/rooms/${room.number}/pay${tenantQuery ? `?${tenantQuery.slice(0, -1)}` : ""}` : null}
          />
          <div className="rise mt-1" style={{ "--i": 4 } as CSSProperties}>
            <Ledger
              locale={locale}
              rows={ledgerRows(account!.charges, account!.payments)}
              roomNumber={room.number}
              tenantId={shown.id}
              cycleStartDay={shown.cycleStartDay}
              editable
              tenantQuery={tenantQuery}
              highlight={notice?.payment.id}
              deleteAction={deletePayment}
            />
          </div>
        </>
      ) : (
        <VacantRoom locale={locale} roomNumber={room.number} roomLabel={room.label} />
      )}

      {former.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="px-1 text-lg font-semibold text-ink">{t(locale, "roomPage.formerTitle")}</h2>
          <RoomList>
            {former.map((tn, i) => (
              <RoomRow
                key={tn.id}
                index={3 + i}
                href={`/rooms/${room.number}?tenant=${tn.id}`}
                number={room.number}
                muted
                title={tn.name}
                detail={t(locale, "roomPage.leftOn", { date: formatDay(locale, tn.leftOn!) })}
                trailing={<StatusChip locale={locale} due={balances.get(tn.id)!.total} />}
              />
            ))}
          </RoomList>
        </section>
      ) : null}

      {shown && !shown.leftOn ? (
        <div className="rise mt-2" style={{ "--i": 5 } as CSSProperties}>
          <VacatePanel
            locale={locale}
            tenant={shown}
            balance={balances.get(shown.id)!.total}
            today={today}
            readingTaken={await hasLatestReading(repo, room.id)}
          />
        </div>
      ) : null}
    </div>
  );
}

function RoomHeading({ locale, roomNumber, roomLabel, children }: { locale: Locale; roomNumber: number; roomLabel?: string; children: ReactNode }) {
  return (
    <header className="rise flex items-center gap-4" style={{ "--i": 1 } as CSSProperties}>
      <RoomBadge number={roomNumber} size="lg" />
      <div className="min-w-0">
        <p className="text-base font-medium text-ink/60">
          {t(locale, "room.label", { n: roomNumber })}
          {roomLabel ? ` · ${roomLabel}` : ""}
        </p>
        {children}
      </div>
    </header>
  );
}

function TenantSummary({
  locale,
  roomNumber,
  roomLabel,
  tenant,
  balance,
  payHref,
}: {
  locale: Locale;
  roomNumber: number;
  roomLabel?: string;
  tenant: Tenant;
  balance: Balance;
  payHref: string | null;
}) {
  const gone = Boolean(tenant.leftOn);
  return (
    <>
      <RoomHeading locale={locale} roomNumber={roomNumber} roomLabel={roomLabel}>
        <h1 className="font-display text-[1.875rem] leading-tight font-semibold tracking-[-0.02em] break-words text-ink">
          {tenant.name}
        </h1>
      </RoomHeading>

      <section className="rise overflow-hidden rounded-card bg-card shadow-soft" style={{ "--i": 2 } as CSSProperties}>
        <div className="px-5 pt-5 pb-4">
          <p className="text-[1.0625rem] leading-snug font-medium text-ink">
            {t(locale, "cycle.summary", { amount: formatINR(tenant.rentAmount), cycle: cycleText(locale, tenant.cycleStartDay) })}
          </p>
          <p className="mt-0.5 text-base text-ink/60">
            {gone
              ? t(locale, "roomPage.leftOn", { date: formatDay(locale, tenant.leftOn!) })
              : t(locale, "roomPage.since", { date: formatDay(locale, tenant.startedOn) })}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-px bg-line">
          <Figure label={t(locale, "roomPage.pendingRent")} amount={balance.rent} />
          <Figure label={t(locale, "roomPage.pendingLight")} amount={balance.light} />
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-4">
          <p className={`text-base font-semibold ${balance.total > 0 ? "text-amber-deep" : "text-green-deep"}`}>
            {balance.total > 0 ? t(locale, "roomPage.owes", { amount: formatINR(balance.total) }) : t(locale, "roomPage.allPaid")}
          </p>
          {balance.credit > 0 ? (
            <p className="rounded-full bg-green-soft px-3 py-1 text-[0.9375rem] font-semibold text-green-deep">
              {t(locale, "room.advance", { amount: formatINR(balance.credit) })}
            </p>
          ) : null}
        </div>
      </section>

      {payHref || !gone ? (
        <div className="rise flex gap-3" style={{ "--i": 3 } as CSSProperties}>
          {payHref ? (
            <Link
              href={payHref}
              className="press flex min-h-14 flex-1 items-center justify-center gap-2 rounded-full bg-green px-5 text-[1.0625rem] font-semibold text-white outline-none active:bg-green-deep focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-white/85">
                <path d="M7 5h10M7 9h10M7 5h3.5a4 4 0 0 1 0 8H7l7 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t(locale, "home.recordPayment")}
            </Link>
          ) : null}
          {!gone ? (
            <Link
              href={`/rooms/${roomNumber}/edit`}
              className={`press flex min-h-14 items-center justify-center gap-2 rounded-full bg-card px-5 text-base font-semibold text-ink shadow-soft outline-none active:bg-well focus-visible:ring-2 focus-visible:ring-green ${payHref ? "" : "flex-1"}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-green">
                <path d="M4 20h4L19 9l-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
              {t(locale, "common.edit")}
            </Link>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function Figure({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="bg-card px-5 py-4">
      <dt className="text-[0.9375rem] leading-snug text-ink/65">{label}</dt>
      <dd className={`figure mt-1 text-[1.75rem] leading-none font-semibold ${amount > 0 ? "text-ink" : "text-ink/40"}`}>
        {formatINR(amount)}
      </dd>
    </div>
  );
}

function VacantRoom({ locale, roomNumber, roomLabel }: { locale: Locale; roomNumber: number; roomLabel?: string }) {
  return (
    <>
      <RoomHeading locale={locale} roomNumber={roomNumber} roomLabel={roomLabel}>
        <h1 className="font-display text-[1.875rem] leading-tight font-semibold tracking-[-0.02em] text-ink/55">
          {t(locale, "room.vacant")}
        </h1>
      </RoomHeading>
      <section className="rise rounded-card bg-card p-5 shadow-soft" style={{ "--i": 2 } as CSSProperties}>
        <p className="text-base leading-relaxed text-ink/70">{t(locale, "roomPage.vacantBody")}</p>
        <Link
          href={`/rooms/${roomNumber}/edit`}
          className="press mt-5 flex min-h-12 items-center justify-center rounded-full bg-green px-5 text-base font-semibold text-white outline-none active:bg-green-deep focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2"
        >
          {t(locale, "rooms.addTenant")}
        </Link>
      </section>
    </>
  );
}

function LeftNotice({ locale, name }: { locale: Locale; name: string }) {
  return (
    <section className="rise rounded-card bg-green-soft px-5 py-4 text-green-deep" role="status">
      <p className="text-base font-semibold">{t(locale, "roomPage.vacated", { name })}</p>
      <p className="mt-1 text-base leading-snug">
        {t(locale, "roomPage.finalReading")}{" "}
        <Link href="/readings" className="font-semibold underline decoration-green-deep/40 underline-offset-4">
          {t(locale, "roomPage.finalReadingLink")}
        </Link>
      </p>
    </section>
  );
}

type Notice = { kind: "paid" | "edited" | "removed"; payment: RepoPayment };

/** After a save, edit or delete the action comes back here naming the payment it touched. */
function paymentNotice(query: Record<string, string | string[] | undefined>, payments: RepoPayment[]): Notice | null {
  for (const kind of ["paid", "edited", "removed"] as const) {
    const id = one(query[kind]);
    const payment = id ? payments.find((p) => p.id === id) : undefined;
    if (payment) return { kind, payment };
  }
  return null;
}

function PaymentNotice({ locale, notice }: { locale: Locale; notice: Notice }) {
  const text =
    notice.kind === "paid"
      ? t(locale, "pay.saved", { amount: formatINR(notice.payment.amount) })
      : t(locale, notice.kind === "edited" ? "pay.updated" : "pay.removed");
  return (
    <p className="rise flex items-center gap-2.5 rounded-card bg-green-soft px-5 py-3.5 text-base font-semibold text-green-deep" role="status">
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="flex-none">
        <path d="m3.5 8.4 2.9 2.9 6.1-6.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {text}
    </p>
  );
}
