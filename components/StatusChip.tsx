import { t, type Locale } from "@/lib/i18n";
import { formatINR } from "@/lib/money";

/** Green "Paid" or amber with the amount still due. */
export function StatusChip({ locale, due }: { locale: Locale; due: number }) {
  if (due <= 0) {
    return (
      <span className="deva-nudge inline-flex h-8 flex-none items-center gap-1.5 whitespace-nowrap rounded-full bg-green-soft px-3 text-[0.9375rem] font-semibold text-green-deep">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m3.5 8.4 2.9 2.9 6.1-6.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t(locale, "status.paid")}
      </span>
    );
  }
  return (
    <span className="deva-nudge inline-flex h-8 flex-none items-center whitespace-nowrap rounded-full bg-amber-soft px-3 text-[0.9375rem] font-semibold text-amber-deep tabular-nums">
      {t(locale, "chip.due", { amount: formatINR(due) })}
    </span>
  );
}
