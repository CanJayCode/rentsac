"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertSessionAction } from "@/lib/auth/require-session";
import type { Key } from "@/lib/i18n";
import { ensureRentCharges } from "@/lib/rent";
import { getRepo } from "@/lib/repo";
import type { Repo } from "@/lib/repo/types";
import { todayIST } from "@/lib/today";
import { validateRoom, validateTenant, type RoomField, type TenantField } from "@/lib/validate";

export type FormState<F extends string> = {
  errors?: Partial<Record<F, Key>>;
  formError?: Key;
  /** What was typed, so the form can show it again after an error. */
  values?: Record<string, string>;
  /** A room number just added, for the confirmation line. */
  saved?: number;
};

function field(data: FormData, name: string): string {
  const v = data.get(name);
  return typeof v === "string" ? v : "";
}

async function roomByNumber(repo: Repo, n: number) {
  return (await repo.listRooms()).find((r) => r.number === n) ?? null;
}

async function activeTenantIn(repo: Repo, roomId: string) {
  return (await repo.listTenants({ activeOnly: true })).find((t) => t.roomId === roomId) ?? null;
}

export async function saveRoom(_prev: FormState<RoomField>, data: FormData): Promise<FormState<RoomField>> {
  await assertSessionAction();
  const values = { number: field(data, "number"), label: field(data, "label") };
  const parsed = validateRoom(values);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const repo = await getRepo();
  if (await roomByNumber(repo, parsed.value.number)) {
    return { errors: { number: "form.error.roomTaken" }, values };
  }
  await repo.saveRoom(parsed.value);
  revalidatePath("/", "layout");
  return { saved: parsed.value.number };
}

export async function saveTenant(_prev: FormState<TenantField>, data: FormData): Promise<FormState<TenantField>> {
  await assertSessionAction();
  const preset = field(data, "cyclePreset");
  const values = {
    name: field(data, "name"),
    rentAmount: field(data, "rentAmount"),
    cyclePreset: preset,
    cycleCustom: field(data, "cycleCustom"),
    startedOn: field(data, "startedOn"),
  };

  const repo = await getRepo();
  const room = await roomByNumber(repo, Number(field(data, "room")));
  if (!room) return { formError: "form.error.failed", values };

  const tenantId = field(data, "tenantId");
  const existing = tenantId ? await repo.getTenant(tenantId) : null;
  if (tenantId && (!existing || existing.leftOn || existing.roomId !== room.id)) {
    return { formError: "form.error.failed", values };
  }
  if (!existing && (await activeTenantIn(repo, room.id))) {
    return { formError: "form.error.occupied", values };
  }

  // Once rent has been charged, the cycle and move-in date stay as they were.
  const locked = existing ? (await repo.listCharges(existing.id)).some((c) => c.kind === "rent") : false;
  const parsed = validateTenant({
    name: values.name,
    rentAmount: values.rentAmount,
    cycleStartDay: locked ? String(existing!.cycleStartDay) : preset === "custom" ? values.cycleCustom : preset,
    startedOn: locked ? existing!.startedOn : values.startedOn,
  });
  if (!parsed.ok) return { errors: parsed.errors, values };

  const tenant = await repo.saveTenant({
    ...(existing ?? {}),
    ...parsed.value,
    roomId: room.id,
  });
  await ensureRentCharges(repo, tenant, todayIST());
  revalidatePath("/", "layout");
  redirect(`/rooms/${room.number}`);
}

export async function vacateTenant(data: FormData): Promise<void> {
  await assertSessionAction();
  const repo = await getRepo();
  const tenant = await repo.getTenant(field(data, "tenantId"));
  if (!tenant || tenant.leftOn) throw new Error("Tenant not found or already left");
  const room = (await repo.listRooms()).find((r) => r.id === tenant.roomId);

  const today = todayIST();
  // Charge every period that has started before closing the tenancy.
  await ensureRentCharges(repo, tenant, today);
  await repo.vacateTenant(tenant.id, today);
  revalidatePath("/", "layout");
  redirect(`/rooms/${room?.number ?? ""}?left=${tenant.id}`);
}
