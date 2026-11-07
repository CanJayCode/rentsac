"use client";

import { useActionState, useState } from "react";
import { t, type Key, type Locale } from "@/lib/i18n";

type State = { error?: Key };
export type DeleteRoundAction = (prev: State, data: FormData) => Promise<State>;

type Props = {
  locale: Locale;
  roundId: string;
  /** Already formatted date string shown in the confirmation question. */
  date: string;
  action: DeleteRoundAction;
};

/** A "Delete round" button that expands into an in-place confirm form before firing. */
export function DeleteRound({ locale, roundId, date, action }: Props) {
  const [asking, setAsking] = useState(false);
  const [state, formAction, deleting] = useActionState(action, {});

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="press deva-nudge inline-flex min-h-11 items-center rounded-full px-4 text-base font-semibold text-ink/55 outline-none active:bg-ink/5 focus-visible:ring-2 focus-visible:ring-green"
      >
        {t(locale, "readings.delete.button")}
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="rise flex flex-col gap-2.5 rounded-2xl bg-amber-soft p-4 text-amber-deep"
      role="group"
    >
      <input type="hidden" name="roundId" value={roundId} />
      <p className="text-base leading-snug font-medium">
        {t(locale, "readings.delete.ask", { date })}
      </p>
      {state.error ? (
        <p className="text-[0.9375rem] font-semibold" role="alert">
          {t(locale, state.error)}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setAsking(false)}
          className="press min-h-12 rounded-full bg-card px-4 text-base font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-green"
        >
          {t(locale, "common.cancel")}
        </button>
        <button
          type="submit"
          disabled={deleting}
          className="press min-h-12 rounded-full bg-ink px-4 text-base font-semibold text-bg outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {deleting ? t(locale, "readings.delete.deleting") : t(locale, "readings.delete.confirm")}
        </button>
      </div>
    </form>
  );
}

