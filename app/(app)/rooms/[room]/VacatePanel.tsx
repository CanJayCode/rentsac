"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { vacateTenant } from "../actions";

type Props = {
  tenantId: string;
  labels: {
    open: string;
    title: string;
    balance: string | null;
    clear: string;
    finalReading: string;
    finalReadingLink: string;
    confirm: string;
    cancel: string;
    saving: string;
  };
};

/** "Tenant is leaving" with a confirm step: the balance warning and the final-reading reminder come first. */
export function VacatePanel({ tenantId, labels }: Props) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press min-h-12 w-full rounded-full bg-transparent px-5 text-base font-semibold text-ink/70 ring-1 ring-ink/15 outline-none active:bg-ink/5 focus-visible:ring-2 focus-visible:ring-green"
      >
        {labels.open}
      </button>
    );
  }

  return (
    <section className="rise rounded-card bg-card p-5 shadow-soft" aria-labelledby="vacate-title">
      <h2 id="vacate-title" className="text-[1.1875rem] leading-snug font-semibold text-ink">
        {labels.title}
      </h2>
      <p className={`mt-3 rounded-2xl px-4 py-3 text-base leading-snug ${labels.balance ? "bg-amber-soft text-amber-deep" : "bg-well text-ink/75"}`}>
        {labels.balance ?? labels.clear}
      </p>
      <p className="mt-3 flex gap-3 px-1 text-base leading-snug text-ink/80">
        <MeterGlyph />
        <span>
          {labels.finalReading}{" "}
          <Link href="/readings" className="font-semibold text-green underline decoration-green/40 underline-offset-4">
            {labels.finalReadingLink}
          </Link>
        </span>
      </p>
      <form action={vacateTenant} className="mt-5 flex flex-col gap-2.5">
        <input type="hidden" name="tenantId" value={tenantId} />
        <ConfirmButton label={labels.confirm} saving={labels.saving} />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="press min-h-12 rounded-full px-5 text-base font-semibold text-ink/70 outline-none active:bg-ink/5 focus-visible:ring-2 focus-visible:ring-green"
        >
          {labels.cancel}
        </button>
      </form>
    </section>
  );
}

function ConfirmButton({ label, saving }: { label: string; saving: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="press min-h-12 rounded-full bg-ink px-5 text-base font-semibold text-bg outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {pending ? saving : label}
    </button>
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
