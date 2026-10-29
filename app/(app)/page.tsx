import { requireSession } from "@/lib/auth/require-session";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { formatINR } from "@/lib/money";

export default async function Home() {
  await requireSession();
  const locale = await getLocale();

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-card bg-card p-6 shadow-soft">
        <p className="text-base font-medium text-ink/65">{t(locale, "home.pendingTotal")}</p>
        <p className="mt-1 font-display text-[3.25rem] leading-none font-semibold tracking-[-0.02em] text-ink tabular-nums">
          {formatINR(0)}
        </p>
        <p className="mt-4 text-base leading-snug text-ink/70">{t(locale, "home.empty")}</p>
      </section>
      <p className="px-1 font-display text-lg text-green/90">{t(locale, "app.tagline")}</p>
    </div>
  );
}
