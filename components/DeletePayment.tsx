"use client";

import { useActionState, useState, type ReactNode } from "react";
import { t, type Key, type Locale } from "@/lib/i18n";

type State = { formError?: Key };
export type DeletePaymentAction = (prev: State, data: FormData) => Promise<State>;

type Props = {
  locale: Locale;
  action: DeletePaymentAction;
  roomNumber: number;
  tenantId: string;
  paymentId: string;
  /** Already formatted, for the question. */
  amount: string;
  edit: ReactNode;
};

/** Edit and Delete under a payment; Delete asks first, in place. */
export function DeletePayment({ locale, action, roomNumber, tenantId, paymentId, amount, edit }: Props) {
  const [asking, setAsking] = useState(false);
  const [state, formAction, deleting] = useActionState(action, {});

  if (!asking) {
    return (
      <div className="mt-1 -mb-1.5 flex items-center gap-1">
        {edit}
        <button
          type="button"
          onClick={() => setAsking(true)}
          aria-label={t(locale, "ledger.deletePayment", { amount })}
          className="press inline-flex min-h-11 items-center rounded-full px-3 text-base font-semibold text-ink/60 outline-none active:bg-ink/5 focus-visible:ring-2 focus-visible:ring-green"
        >
          {t(locale, "common.delete")}
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="rise mt-3 flex flex-col gap-2.5 rounded-2xl bg-amber-soft p-4 text-amber-deep" role="group">
      <input type="hidden" name="room" value={roomNumber} />
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="paymentId" value={paymentId} />
      <p className="text-base leading-snug font-medium">{t(locale, "ledger.deleteAsk", { amount })}</p>
      {state.formError ? (
        <p className="text-[0.9375rem] font-semibold" role="alert">
          {t(locale, state.formError)}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setAsking(false)}
          className="press min-h-12 rounded-full bg-card px-4 text-base font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-green"
        >
          {t(locale, "common.cancel")}
        </button>
        <button
          type="submit"
          disabled={deleting}
          className="press min-h-12 rounded-full bg-ink px-4 text-base font-semibold text-bg outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {deleting ? t(locale, "ledger.deleting") : t(locale, "ledger.deleteYes")}
        </button>
      </div>
    </form>
  );
}
