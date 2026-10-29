"use client";

import { useActionState, useState } from "react";
import { Field, inputClass } from "@/components/Field";
import { t, type Key, type Locale } from "@/lib/i18n";
import { NAME_MAX } from "@/lib/validate";
import { saveTenant } from "../../actions";

const PRESETS = [
  { value: "1", label: "tenant.cycle.1" },
  { value: "12", label: "tenant.cycle.12" },
  { value: "26", label: "tenant.cycle.26" },
] as const satisfies readonly { value: string; label: Key }[];

type Props = {
  locale: Locale;
  roomNumber: number;
  tenant: { id: string; name: string; rentAmount: number; cycleStartDay: number; startedOn: string } | null;
  defaults: { startedOn: string };
  /** Rent already charged: cycle and move-in date are shown, not edited. */
  locked: { cycle: string; startedOn: string } | null;
};

export function TenantForm({ locale, roomNumber, tenant, defaults, locked }: Props) {
  const [state, action, pending] = useActionState(saveTenant, {});
  const v = state.values;
  const startDay = String(tenant?.cycleStartDay ?? 1);
  const initialPreset = v?.cyclePreset ?? (PRESETS.some((p) => p.value === startDay) ? startDay : "custom");
  const [preset, setPreset] = useState(initialPreset);
  const err = (k?: Key) => (k ? t(locale, k) : undefined);

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="room" value={roomNumber} />
      {tenant ? <input type="hidden" name="tenantId" value={tenant.id} /> : null}

      <section className="flex flex-col gap-5 rounded-card bg-card p-5 shadow-soft">
        <Field id="name" label={t(locale, "tenant.name")} error={err(state.errors?.name)}>
          <input
            id="name"
            name="name"
            autoComplete="off"
            autoCapitalize="words"
            maxLength={NAME_MAX}
            defaultValue={v?.name ?? tenant?.name ?? ""}
            aria-invalid={Boolean(state.errors?.name)}
            className={inputClass}
          />
        </Field>

        <Field
          id="rentAmount"
          label={t(locale, "tenant.rent")}
          hint={tenant ? t(locale, "tenant.rentChangeHint") : undefined}
          error={err(state.errors?.rentAmount)}
        >
          <div className="relative">
            <span className="figure pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-xl text-ink/55" aria-hidden="true">
              ₹
            </span>
            <input
              id="rentAmount"
              name="rentAmount"
              inputMode="numeric"
              pattern="[0-9]*"
              defaultValue={v?.rentAmount ?? String(tenant?.rentAmount ?? 3000)}
              aria-invalid={Boolean(state.errors?.rentAmount)}
              className={`${inputClass} figure pl-9 text-xl`}
            />
          </div>
        </Field>
      </section>

      {locked ? (
        <section className="flex flex-col gap-3 rounded-card bg-well/70 p-5">
          <dl className="grid grid-cols-1 gap-3">
            <div>
              <dt className="text-[0.9375rem] text-ink/65">{t(locale, "tenant.cycle")}</dt>
              <dd className="text-[1.0625rem] font-semibold text-ink">{locked.cycle}</dd>
            </div>
            <div>
              <dt className="text-[0.9375rem] text-ink/65">{t(locale, "tenant.startedOn")}</dt>
              <dd className="text-[1.0625rem] font-semibold text-ink">{locked.startedOn}</dd>
            </div>
          </dl>
          <p className="text-[0.9375rem] leading-snug text-ink/65">{t(locale, "tenant.lockedHint")}</p>
        </section>
      ) : (
        <section className="flex flex-col gap-5 rounded-card bg-card p-5 shadow-soft">
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-2 text-base font-semibold text-ink">{t(locale, "tenant.cycle")}</legend>
            <div className="grid grid-cols-4 gap-2">
              {[...PRESETS, { value: "custom", label: "tenant.cycleCustom" as Key }].map((p) => (
                <label
                  key={p.value}
                  className="press relative flex min-h-12 cursor-pointer items-center justify-center rounded-2xl bg-bg px-1 text-center text-[0.9375rem] leading-tight font-semibold text-ink/75 ring-1 ring-ink/10 has-[:checked]:bg-green has-[:checked]:text-white has-[:checked]:ring-green has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-green has-[:focus-visible]:ring-offset-2"
                >
                  <input
                    type="radio"
                    name="cyclePreset"
                    value={p.value}
                    defaultChecked={initialPreset === p.value}
                    onChange={() => setPreset(p.value)}
                    className="sr-only"
                  />
                  {t(locale, p.label)}
                </label>
              ))}
            </div>
            {preset === "custom" ? (
              <div className="mt-2">
                <Field id="cycleCustom" label={t(locale, "tenant.cycleCustomLabel")} error={err(state.errors?.cycleStartDay)}>
                  <input
                    id="cycleCustom"
                    name="cycleCustom"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    defaultValue={v?.cycleCustom ?? (initialPreset === "custom" ? startDay : "")}
                    aria-invalid={Boolean(state.errors?.cycleStartDay)}
                    className={`${inputClass} figure w-28 text-xl`}
                  />
                </Field>
              </div>
            ) : state.errors?.cycleStartDay ? (
              <p className="text-[0.9375rem] font-medium text-amber" role="alert">
                {t(locale, state.errors.cycleStartDay)}
              </p>
            ) : null}
            <p className="text-[0.9375rem] leading-snug text-ink/65">{t(locale, "tenant.cycleHint")}</p>
          </fieldset>

          <Field id="startedOn" label={t(locale, "tenant.startedOn")} hint={t(locale, "tenant.startedOnHint")} error={err(state.errors?.startedOn)}>
            <input
              id="startedOn"
              name="startedOn"
              type="date"
              defaultValue={v?.startedOn ?? tenant?.startedOn ?? defaults.startedOn}
              aria-invalid={Boolean(state.errors?.startedOn)}
              className={`${inputClass} appearance-none`}
            />
          </Field>
        </section>
      )}

      {state.formError ? (
        <p className="rounded-2xl bg-amber-soft px-4 py-3 text-base font-medium text-amber-deep" role="alert">
          {t(locale, state.formError)}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="press min-h-14 rounded-full bg-green px-6 text-lg font-semibold text-white outline-none active:bg-green-deep focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-60"
      >
        {pending ? t(locale, "tenant.saving") : t(locale, tenant ? "tenant.saveEdit" : "tenant.saveNew")}
      </button>
    </form>
  );
}
