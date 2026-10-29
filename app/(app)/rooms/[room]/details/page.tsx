import Link from "next/link";
import { requireSession } from "@/lib/auth/require-session";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { loadRoom } from "../data";
import { RoomForm } from "./RoomForm";

/** Renumber or relabel a room. */
export default async function RoomDetailsPage({ params }: PageProps<"/rooms/[room]/details">) {
  await requireSession();
  const [{ room: param }, locale] = await Promise.all([params, getLocale()]);
  const { room } = await loadRoom(param);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/rooms/${room.number}`}
        className="-ml-1 inline-flex min-h-11 items-center gap-1 self-start rounded-full pr-3 pl-1 text-base font-semibold text-green outline-none active:bg-green/10 focus-visible:ring-2 focus-visible:ring-green"
      >
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t(locale, "room.label", { n: room.number })}
      </Link>
      <h1 className="px-1 font-display text-[1.875rem] leading-tight font-semibold tracking-[-0.02em] text-ink">
        {t(locale, "roomEdit.title", { n: room.number })}
      </h1>
      <RoomForm key={room.id} locale={locale} room={{ id: room.id, number: room.number, label: room.label }} />
    </div>
  );
}
