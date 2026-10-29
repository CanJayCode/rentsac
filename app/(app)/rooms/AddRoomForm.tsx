"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/Field";
import { t, type Locale } from "@/lib/i18n";
import { LABEL_MAX } from "@/lib/validate";
import { saveRoom } from "./actions";

export function AddRoomForm({ locale, suggested }: { locale: Locale; suggested: number }) {
  const [state, action, pending] = useActionState(saveRoom, {});
  const values = state.values ?? {};

  return (
    <details className="group rounded-card bg-card shadow-soft" open={Boolean(state.errors || state.saved)}>
      <summary className="press flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-card px-4 text-[1.0625rem] font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-green [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-full bg-well text-green" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          {t(locale, "rooms.addRoom")}
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="text-ink/50 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
        >
          <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>

      <form action={action} className="flex flex-col gap-4 px-4 pb-5 pt-1">
        <p className="text-[0.9375rem] leading-snug text-ink/65">{t(locale, "rooms.addRoomHint")}</p>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Field id="room-number" label={t(locale, "rooms.number")} error={state.errors?.number && t(locale, state.errors.number)}>
            <input
              id="room-number"
              name="number"
              inputMode="numeric"
              pattern="[0-9]*"
              required
              defaultValue={values.number ?? String(suggested)}
              aria-invalid={Boolean(state.errors?.number)}
              className={`${inputClass} figure text-xl`}
            />
          </Field>
          <Field id="room-label" label={t(locale, "rooms.labelField")} error={state.errors?.label && t(locale, state.errors.label)}>
            <input
              id="room-label"
              name="label"
              maxLength={LABEL_MAX}
              placeholder={t(locale, "rooms.labelPlaceholder")}
              defaultValue={values.label ?? ""}
              aria-invalid={Boolean(state.errors?.label)}
              className={inputClass}
            />
          </Field>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="press min-h-12 rounded-full bg-ink px-5 text-base font-semibold text-bg outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {pending ? t(locale, "tenant.saving") : t(locale, "rooms.saveRoom")}
        </button>
        <p className="min-h-[1.5em] text-base font-medium text-green-deep" aria-live="polite">
          {state.saved ? t(locale, "rooms.saved", { n: state.saved }) : null}
        </p>
      </form>
    </details>
  );
}
