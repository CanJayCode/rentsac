"use client";

import { useActionState, useState } from "react";
import { DateInput } from "@/components/DateInput";
import { Field, inputClass } from "@/components/Field";
import { t, type Key, type Locale } from "@/lib/i18n";

type State = { error?: Key; date?: string };

type Props = {
  locale: Locale;
  action: (prev: State, data: FormData) => Promise<State>;
  today: string;
  /** The newest round's date: a new round cannot be dated before it. */
  min: string | null;
};

export function NewRoundForm({ locale, action, today, min }: Props) {
  const [state, formAction, starting] = useActionState(action, {});
  const [date, setDate] = useState(state.date ?? today);

  return (
    <form action={formAction} noValidate className="rise flex flex-col gap-5 rounded-card bg-card p-5 shadow-soft">
      <Field id="date" label={t(locale, "readings.date")} hint={t(locale, "readings.dateHint")} error={state.error ? t(locale, state.error) : undefined}>
        <DateInput
          id="date"
          name="date"
          value={date}
          onChange={setDate}
          min={min ?? undefined}
          max={today}
          ariaInvalid={Boolean(state.error)}
          className={`${inputClass} appearance-none`}
        />
      </Field>
      <button
        type="submit"
        disabled={starting}
        className="press deva-nudge min-h-14 rounded-full bg-green px-6 text-lg font-semibold text-white outline-none active:bg-green-deep focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {starting ? t(locale, "readings.starting") : t(locale, "readings.startButton")}
      </button>
    </form>
  );
}
