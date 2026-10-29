"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertSessionAction } from "@/lib/auth/require-session";
import type { Key } from "@/lib/i18n";
import {
  closeTenancy,
  ensureRentCharges,
  MONTHS_CONFIRM_ABOVE,
  regenerateRentCharges,
  rentPreview,
  rentTermsEditable,
} from "@/lib/rent";
import { getRepo } from "@/lib/repo";
import type { Repo } from "@/lib/repo/types";
import { todayIST } from "@/lib/today";
import { isRealDate, validateRoom, validateTenant, type RoomField, type TenantField } from "@/lib/validate";

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

/** Renumbers or relabels a room. Tenants and readings point at the room id, so they move with it. */
export async function updateRoom(_prev: FormState<RoomField>, data: FormData): Promise<FormState<RoomField>> {
  await assertSessionAction();
  const values = { number: field(data, "number"), label: field(data, "label") };
  const parsed = validateRoom(values);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const repo = await getRepo();
  const rooms = await repo.listRooms();
  const room = rooms.find((r) => r.id === field(data, "roomId"));
  if (!room) return { formError: "form.error.failed", values };
  if (rooms.some((r) => r.id !== room.id && r.number === parsed.value.number)) {
    return { errors: { number: "form.error.roomTaken" }, values };
  }
  await repo.saveRoom({ id: room.id, number: parsed.value.number, label: parsed.value.label ?? "" });
  revalidatePath("/", "layout");
  redirect(`/rooms/${parsed.value.number}`);
}

type TenantFormField = TenantField | "confirmMonths";

export async function saveTenant(
  _prev: FormState<TenantFormField>,
  data: FormData,
): Promise<FormState<TenantFormField>> {
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

  // Once a payment is recorded, the cycle and move-in date stay as they were.
  const locked = existing ? !(await rentTermsEditable(repo, existing.id)) : false;
  const parsed = validateTenant({
    name: values.name,
    rentAmount: values.rentAmount,
    cycleStartDay: locked ? String(existing!.cycleStartDay) : preset === "custom" ? values.cycleCustom : preset,
    startedOn: locked ? existing!.startedOn : values.startedOn,
  });
  if (!parsed.ok) return { errors: parsed.errors, values };

  const today = todayIST();
  const termsChanged =
    !!existing &&
    (existing.cycleStartDay !== parsed.value.cycleStartDay || existing.startedOn !== parsed.value.startedOn);
  if (!locked && (!existing || termsChanged)) {
    const { dueCount } = rentPreview(parsed.value, today);
    if (dueCount > MONTHS_CONFIRM_ABOVE && field(data, "confirmMonths") !== "yes") {
      return { errors: { confirmMonths: "form.error.confirmMonths" }, values };
    }
  }

  const tenant = await repo.saveTenant({ ...(existing ?? {}), ...parsed.value, roomId: room.id });
  if (termsChanged && !locked) await regenerateRentCharges(repo, tenant, today);
  else await ensureRentCharges(repo, tenant, today);
  revalidatePath("/", "layout");
  redirect(`/rooms/${room.number}`);
}

export async function vacateTenant(_prev: FormState<"leftOn">, data: FormData): Promise<FormState<"leftOn">> {
  await assertSessionAction();
  const repo = await getRepo();
  const tenant = await repo.getTenant(field(data, "tenantId"));
  if (!tenant) return { formError: "form.error.failed" };
  const room = (await repo.listRooms()).find((r) => r.id === tenant.roomId);
  // A second tap after the first one went through: just show the room.
  if (tenant.leftOn) redirect(`/rooms/${room?.number ?? ""}`);

  const today = todayIST();
  const leftOn = field(data, "leftOn").trim();
  if (!isRealDate(leftOn) || leftOn < tenant.startedOn || leftOn > today) {
    return { errors: { leftOn: "form.error.leftOn" }, values: { leftOn } };
  }
  await closeTenancy(repo, tenant, leftOn, today);
  revalidatePath("/", "layout");
  redirect(`/rooms/${room?.number ?? ""}?left=${tenant.id}`);
}
