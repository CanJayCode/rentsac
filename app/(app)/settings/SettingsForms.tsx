"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/Field";
import { t, type Locale } from "@/lib/i18n";
import { formatINR } from "@/lib/money";
import { changePin, saveRate, type PinState, type RateState } from "./actions";

const submitClass =
  "press mt-1 flex min-h-12 items-center justify-center rounded-full bg-green px-5 text-base font-semibold text-white outline-none active:bg-green-deep focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 disabled:opacity-60";

function Notice({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-2.5 rounded-2xl bg-green-soft px-4 py-3 text-base leading-snug font-semibold text-green-deep" role="status">
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="flex-none">
        <path d="m3.5 8.4 2.9 2.9 6.1-6.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </p>
  );
}

export function RateForm({ locale, current }: { locale: Locale; current: number }) {
  const [state, action, pending] = useActionState<RateState, FormData>(saveRate, {});
  return (
    <form action={action} noValidate className="flex flex-col gap-3.5">
      <Field
        id="rate"
        label={t(locale, "settings.rate.label")}
        hint={t(locale, "settings.rate.hint")}
        error={state.error ? t(locale, state.error) : undefined}
      >
        <input
          id="rate"
          name="rate"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={state.value ?? String(current)}
          key={state.saved ?? "form"}
          aria-invalid={Boolean(state.error)}
          className={`${inputClass} figure`}
        />
      </Field>
      {state.saved ? <Notice>{t(locale, "settings.rate.saved", { amount: formatINR(state.saved) })}</Notice> : null}
      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? t(locale, "settings.saving") : t(locale, "settings.rate.save")}
      </button>
    </form>
  );
}

export function PinForm({ locale }: { locale: Locale }) {
  const [state, action, pending] = useActionState<PinState, FormData>(changePin, {});
  const error = state.error ? t(locale, state.error, { minutes: state.minutes ?? 1 }) : undefined;
  const pinInput = (id: string, label: string, name: string) => (
    <Field id={id} label={label}>
      <input
        id={id}
        name={name}
        type="password"
        inputMode="numeric"
        maxLength={6}
        autoComplete="off"
        className={`${inputClass} tracking-[0.35em]`}
      />
    </Field>
  );
  return (
    <form action={action} noValidate className="flex flex-col gap-3.5">
      <p className="text-[0.9375rem] leading-snug text-ink/65">{t(locale, "settings.pin.hint")}</p>
      {pinInput("oldPin", t(locale, "settings.pin.old"), "oldPin")}
      {pinInput("newPin", t(locale, "settings.pin.new"), "newPin")}
      {pinInput("confirmPin", t(locale, "settings.pin.confirm"), "confirmPin")}
      {error ? (
        <p className="rounded-2xl bg-amber-soft px-4 py-3 text-base leading-snug font-medium text-amber-deep" role="alert">
          {error}
        </p>
      ) : null}
      {state.done ? <Notice>{t(locale, "settings.pin.saved")}</Notice> : null}
      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? t(locale, "settings.saving") : t(locale, "settings.pin.save")}
      </button>
    </form>
  );
}
