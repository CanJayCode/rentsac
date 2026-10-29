"use client";

import { useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { t, type Locale } from "@/lib/i18n";
import { waLink } from "@/lib/share";

const OPTIONS: { locale: Locale; label: string }[] = [
  { locale: "en", label: "EN" },
  { locale: "mr", label: "मराठी" },
];

type Props = {
  /** Language of the screen itself. */
  locale: Locale;
  /** The bill already written in each language, from the one pending figure the room page shows. */
  messages: Record<Locale, string>;
};

/** WhatsApp link, copy button and preview for one tenant's bill, in either language regardless of the UI language. */
export function ShareBill({ locale, messages }: Props) {
  const [lang, setLang] = useState<Locale>(locale);
  const message = messages[lang];

  return (
    <section className="rise rounded-card bg-card p-5 shadow-soft" aria-labelledby="share-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="share-title" className="text-[1.1875rem] leading-snug font-semibold text-ink">
          {t(locale, "share.title")}
        </h2>
        <div role="group" aria-label={t(locale, "share.language")} className="inline-flex rounded-full bg-ink/[0.06] p-[3px]">
          {OPTIONS.map((o) => (
            <button
              key={o.locale}
              type="button"
              lang={o.locale}
              aria-pressed={lang === o.locale}
              onClick={() => setLang(o.locale)}
              className={`min-h-9 min-w-11 rounded-full px-3 text-sm leading-none font-semibold transition-colors duration-150 motion-reduce:transition-none ${
                o.locale === "mr" ? "pt-[0.2rem]" : ""
              } ${lang === o.locale ? "bg-green text-white" : "text-ink/65 active:bg-ink/10"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 mb-1.5 text-[0.9375rem] text-ink/65">{t(locale, "share.preview")}</p>
      <pre lang={lang} className="max-h-60 overflow-auto rounded-2xl bg-well px-4 py-3 font-sans text-base leading-snug whitespace-pre-wrap text-ink">
        {message}
      </pre>

      <div className="mt-4 flex flex-col gap-3">
        <a
          href={waLink(message)}
          target="_blank"
          rel="noopener"
          className="press flex min-h-12 items-center justify-center gap-2 rounded-full bg-well px-5 text-base font-semibold text-ink outline-none active:bg-ink/10 focus-visible:ring-2 focus-visible:ring-green"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="flex-none text-green">
            <path d="M4.5 19.5 5.7 15.6A8 8 0 1 1 9 18.7l-4.5.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 12h.01M12.5 12h.01M16 12h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          {t(locale, "share.whatsapp")}
        </a>
        <CopyButton
          text={message}
          label={t(locale, "share.copy")}
          copiedLabel={t(locale, "share.copied")}
          failedLabel={t(locale, "share.copyFailed")}
          tone="well"
        />
      </div>
    </section>
  );
}
