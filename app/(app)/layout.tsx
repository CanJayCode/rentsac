import { Shell } from "@/components/Shell";
import { requireSession } from "@/lib/auth/require-session";
import { getLocale } from "@/lib/i18n/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // The proxy is only the first, UX-level redirect: the layout checks again.
  await requireSession();
  const locale = await getLocale();
  return <Shell locale={locale}>{children}</Shell>;
}
