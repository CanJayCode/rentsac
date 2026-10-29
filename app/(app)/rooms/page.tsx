import type { CSSProperties } from "react";
import { RoomList, RoomRow } from "@/components/RoomRow";
import { requireSession } from "@/lib/auth/require-session";
import { cycleText } from "@/lib/format";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { formatINR } from "@/lib/money";
import { getRepo } from "@/lib/repo";
import { AddRoomForm } from "./AddRoomForm";

async function loadRooms() {
  const repo = await getRepo();
  const [rooms, tenants] = await Promise.all([repo.listRooms(), repo.listTenants({ activeOnly: true })]);
  const tenantIn = new Map(tenants.map((tn) => [tn.roomId, tn]));
  return rooms.sort((a, b) => a.number - b.number).map((room) => ({ room, tenant: tenantIn.get(room.id) ?? null }));
}

export default async function RoomsPage() {
  await requireSession();
  const [locale, list] = await Promise.all([getLocale(), loadRooms()]);
  const occupied = list.filter((x) => x.tenant).length;
  const suggested = (list.at(-1)?.room.number ?? 0) + 1;

  return (
    <div className="flex flex-col gap-5">
      <header className="rise px-1">
        <h1 className="font-display text-[2rem] leading-tight font-semibold tracking-[-0.02em] text-ink">
          {t(locale, "rooms.title")}
        </h1>
        <p className="mt-1 text-base text-ink/65">
          {t(locale, list.length === 1 ? "rooms.subtitle.one" : "rooms.subtitle.many", {
            total: list.length,
            occupied,
          })}
        </p>
      </header>

      <RoomList>
        {list.map(({ room, tenant }, i) => (
          <RoomRow
            key={room.id}
            index={1 + Math.min(i, 10)}
            href={tenant ? `/rooms/${room.number}` : `/rooms/${room.number}/edit`}
            number={room.number}
            muted={!tenant}
            title={tenant ? tenant.name : t(locale, "room.vacant")}
            detail={
              tenant ? (
                <>
                  <span className="whitespace-nowrap">{t(locale, "rooms.rentPerMonth", { amount: formatINR(tenant.rentAmount) })}</span>
                  <span className="whitespace-nowrap">{` · ${cycleText(locale, tenant.cycleStartDay)}`}</span>
                </>
              ) : (
                room.label
              )
            }
            trailing={tenant ? <Chevron /> : <AddTenantPill label={t(locale, "rooms.addTenant")} />}
          />
        ))}
      </RoomList>

      <div className="rise" style={{ "--i": 12 } as CSSProperties}>
        <AddRoomForm locale={locale} suggested={suggested} />
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="flex-none text-ink/35">
      <path d="m6 3.5 4.5 4.5L6 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// A vacant row opens the add-tenant form directly; the pill says so.
function AddTenantPill({ label }: { label: string }) {
  return (
    <span className="inline-flex h-9 flex-none items-center gap-1.5 whitespace-nowrap pr-1 text-[0.9375rem] font-semibold text-green">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {label}
    </span>
  );
}
