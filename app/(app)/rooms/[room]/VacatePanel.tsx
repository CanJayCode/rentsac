"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Field, inputClass } from "@/components/Field";
import { t, type Locale } from "@/lib/i18n";
import { formatINR } from "@/lib/money";
import { vacateTenant } from "../actions";

type Props = {
  locale: Locale;
  tenant: { id: string; name: string; startedOn: string };
  balance: number;
  today: string;
  /** The room has a reading in the latest round, so the last light bill can be right. */
  readingTaken: boolean;
};

/** "Tenant is leaving" with a confirm step: leave date, balance warning and the final-reading reminder. */
export function VacatePanel({ locale, tenant, balance, today, readingTaken }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(vacateTenant, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press min-h-12 w-full rounded-full bg-transparent px-5 text-base font-semibold text-ink/70 ring-1 ring-ink/15 outline-none active:bg-ink/5 focus-visible:ring-2 focus-visible:ring-green"
      >
        {t(locale, "roomPage.vacate")}
      </button>
    );
  }

  return (
    <section className="rise rounded-card bg-card p-5 shadow-soft" aria-labelledby="vacate-title">
      <h2 id="vacate-title" className="text-[1.1875rem] leading-snug font-semibold text-ink">
        {t(locale, "roomPage.vacateTitle", { name: tenant.name })}
      </h2>
      <p className={`mt-3 rounded-2xl px-4 py-3 text-base leading-snug ${balance > 0 ? "bg-amber-soft text-amber-deep" : "bg-well text-ink/75"}`}>
        {balance > 0
          ? t(locale, "roomPage.vacateBalance", { name: tenant.name, amount: formatINR(balance) })
          : t(locale, "roomPage.vacateClear")}
      </p>
      <p
        className={`mt-3 flex gap-3 text-base leading-snug ${readingTaken ? "px-1 text-ink/80" : "rounded-2xl bg-amber-soft px-4 py-3 font-medium text-amber-deep"}`}
      >
        <MeterGlyph />
        <span>
          {t(locale, readingTaken ? "roomPage.finalReading" : "roomPage.finalReadingFirst")}{" "}
          <Link href="/readings" className="font-semibold text-green underline decoration-green/40 underline-offset-4">
            {t(locale, "roomPage.finalReadingLink")}
          </Link>
        </span>
      </p>
      <form action={action} className="mt-5 flex flex-col gap-2.5">
        <input type="hidden" name="tenantId" value={tenant.id} />
        <div className="mb-2">
          <Field
            id="leftOn"
            label={t(locale, "roomPage.leftOnLabel")}
            error={state.errors?.leftOn ? t(locale, state.errors.leftOn) : state.formError ? t(locale, state.formError) : undefined}
          >
            <input
              id="leftOn"
              name="leftOn"
              type="date"
              min={tenant.startedOn}
              max={today}
              defaultValue={state.values?.leftOn ?? today}
              aria-invalid={Boolean(state.errors?.leftOn)}
              className={`${inputClass} appearance-none`}
            />
          </Field>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="press min-h-12 rounded-full bg-ink px-5 text-base font-semibold text-bg outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {pending ? t(locale, "tenant.saving") : t(locale, "roomPage.vacateConfirm")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="press min-h-12 rounded-full px-5 text-base font-semibold text-ink/70 outline-none active:bg-ink/5 focus-visible:ring-2 focus-visible:ring-green"
        >
          {t(locale, "common.cancel")}
        </button>
      </form>
    </section>
  );
}

function MeterGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 flex-none text-green">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 12 15.4 8.4M8.2 15.6h7.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
