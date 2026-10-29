import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentForm } from "@/components/PaymentForm";
import { RoomBadge } from "@/components/RoomBadge";
import { requireSession } from "@/lib/auth/require-session";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import type { Charge, Payment } from "@/lib/ledger";
import { formatINR } from "@/lib/money";
import { tenantAccount } from "@/lib/rent";
import { savePayment } from "../actions";
import { loadRoom } from "../data";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Record a payment for the room's tenant (or a former tenant via ?tenant=), or edit one via ?edit=. */
export default async function PayPage({ params, searchParams }: PageProps<"/rooms/[room]/pay">) {
  await requireSession();
  const [{ room: param }, query, locale] = await Promise.all([params, searchParams, getLocale()]);
  const { repo, room, tenants, active, today } = await loadRoom(param);

  const askedFor = one(query.tenant);
  const tenant = askedFor ? tenants.find((tn) => tn.id === askedFor) : active;
  if (!tenant) notFound();

  const { charges, payments, balance } = await tenantAccount(repo, tenant, today);
  const editId = one(query.edit);
  const editing = editId ? payments.find((p) => p.id === editId && !p.deletedAt) : null;
  if (editId && !editing) notFound();

  // Only what the live preview needs travels to the browser.
  const chargeData: Charge[] = charges.map((c) => ({
    id: c.id,
    kind: c.kind,
    dueDate: c.dueDate,
    amount: c.amount,
    ...(c.openingFor ? { openingFor: c.openingFor } : {}),
  }));
  const paymentData: Payment[] = payments
    .filter((p) => !p.deletedAt && p.id !== editing?.id)
    .map((p) => ({ id: p.id, paidOn: p.paidOn, amount: p.amount, target: p.target }));

  const back = `/rooms/${room.number}${tenant.leftOn ? `?tenant=${tenant.id}` : ""}`;

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={back}
        className="rise -ml-1 inline-flex min-h-11 items-center gap-1 self-start rounded-full pr-3 pl-1 text-base font-semibold text-green outline-none active:bg-green/10 focus-visible:ring-2 focus-visible:ring-green"
      >
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t(locale, "room.label", { n: room.number })}
      </Link>

      <header className="rise flex items-center gap-4">
        <RoomBadge number={room.number} size="lg" muted={Boolean(tenant.leftOn)} />
        <div className="min-w-0">
          <h1 className="font-display text-[1.875rem] leading-tight font-semibold tracking-[-0.02em] text-ink">
            {t(locale, editing ? "pay.editTitle" : "pay.title")}
          </h1>
          <p className="text-base leading-snug break-words text-ink/70">
            {tenant.name}
            {" · "}
            <span className={balance.total > 0 ? "font-semibold text-amber-deep" : "font-semibold text-green-deep"}>
              {balance.total > 0 ? t(locale, "roomPage.owes", { amount: formatINR(balance.total) }) : t(locale, "roomPage.allPaid")}
            </span>
          </p>
        </div>
      </header>

      <PaymentForm
        key={editing?.id ?? "new"}
        locale={locale}
        action={savePayment}
        roomNumber={room.number}
        tenantId={tenant.id}
        today={today}
        charges={chargeData}
        payments={paymentData}
        payment={
          editing
            ? {
                id: editing.id,
                amount: editing.amount,
                paidOn: editing.paidOn,
                cash: editing.cash,
                upi: editing.upi,
                target: editing.target,
                ...(editing.note ? { note: editing.note } : {}),
              }
            : null
        }
      />
    </div>
  );
}
