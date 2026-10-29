"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/Field";
import { t, type Locale } from "@/lib/i18n";
import { LABEL_MAX } from "@/lib/validate";
import { updateRoom } from "../../actions";

export function RoomForm({ locale, room }: { locale: Locale; room: { id: string; number: number; label?: string } }) {
  const [state, action, pending] = useActionState(updateRoom, {});
  const values = state.values ?? {};

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="roomId" value={room.id} />
      <section className="flex flex-col gap-5 rounded-card bg-card p-5 shadow-soft">
        <Field
          id="room-number"
          label={t(locale, "rooms.number")}
          hint={t(locale, "roomEdit.numberHint")}
          error={state.errors?.number && t(locale, state.errors.number)}
        >
          <input
            id="room-number"
            name="number"
            inputMode="numeric"
            pattern="[0-9]*"
            defaultValue={values.number ?? String(room.number)}
            aria-invalid={Boolean(state.errors?.number)}
            className={`${inputClass} figure w-32 text-xl`}
          />
        </Field>
        <Field id="room-label" label={t(locale, "rooms.labelField")} error={state.errors?.label && t(locale, state.errors.label)}>
          <input
            id="room-label"
            name="label"
            maxLength={LABEL_MAX}
            placeholder={t(locale, "rooms.labelPlaceholder")}
            defaultValue={values.label ?? room.label ?? ""}
            aria-invalid={Boolean(state.errors?.label)}
            className={inputClass}
          />
        </Field>
      </section>
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
        {pending ? t(locale, "tenant.saving") : t(locale, "roomEdit.save")}
      </button>
    </form>
  );
}
