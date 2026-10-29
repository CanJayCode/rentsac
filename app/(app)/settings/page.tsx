import type { CSSProperties, ReactNode } from "react";
import { LangSwitch } from "@/components/LangSwitch";
import { requireSession } from "@/lib/auth/require-session";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { formatINR } from "@/lib/money";
import { getRepo } from "@/lib/repo";
import { getRate } from "@/lib/settings";
import { lock } from "../../lock/actions";
import pkg from "../../../package.json";
import { PinForm, RateForm } from "./SettingsForms";

function Section({ index, title, children }: { index: number; title: string; children: ReactNode }) {
  return (
    <section className="rise rounded-card bg-card p-5 shadow-soft" style={{ "--i": index } as CSSProperties}>
      <h2 className="mb-3.5 text-[1.1875rem] leading-snug font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  await requireSession();
  const locale = await getLocale();
  const rate = await getRate(await getRepo());

  return (
    <div className="flex flex-col gap-5">
      <h1 className="rise font-display text-3xl font-semibold tracking-[-0.02em] text-ink">{t(locale, "settings.title")}</h1>

      <Section index={1} title={t(locale, "settings.rate.title")}>
        <p className="figure mb-4 text-[2.25rem] leading-none font-semibold text-ink">
          {t(locale, "settings.rate.current", { amount: formatINR(rate) })}
        </p>
        <RateForm locale={locale} current={rate} />
      </Section>

      <Section index={2} title={t(locale, "settings.pin.title")}>
        <PinForm locale={locale} />
      </Section>

      <Section index={3} title={t(locale, "settings.language.title")}>
        <LangSwitch locale={locale} />
      </Section>

      <Section index={4} title={t(locale, "settings.lock.title")}>
        <p className="mb-4 text-base leading-snug text-ink/70">{t(locale, "settings.lock.hint")}</p>
        <form action={lock}>
          <button
            type="submit"
            className="press flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-base font-semibold text-bg outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2"
          >
            {t(locale, "settings.lock.button")}
          </button>
        </form>
      </Section>

      <p className="px-1 pb-2 text-[0.9375rem] text-ink/60">{t(locale, "settings.about.version", { version: pkg.version })}</p>
    </div>
  );
}
