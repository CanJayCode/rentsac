import { requireSession } from "@/lib/auth/require-session";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export default async function ReadingsPage() {
  await requireSession();
  const locale = await getLocale();

  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink">{t(locale, "readings.title")}</h1>
      <p className="text-ink/70">{t(locale, "common.comingSoon")}</p>
    </div>
  );
}
