"use client";

import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

type Props = {
  id: string;
  badge: ReactNode;
  title: ReactNode;
  muted?: boolean;
  /** "Last 1502" under the title. */
  sub: ReactNode;
  inputLabel: string;
  /** The live line under the row: units and bill, or what the value means. */
  line?: ReactNode;
  lineTone?: "plain" | "money" | "quiet";
  /** A reading that needs a second look and is not confirmed yet. */
  warn?: string | null;
  error?: string | null;
  fixLabel: string;
  confirmLabel: string;
  index?: number;
  /** Set when the row takes input; left out, the row shows `shown` as a fixed value. */
  input?: {
    name: string;
    confirmName: string;
    value: string;
    confirmedValue: string;
    onChange: (v: string) => void;
    onConfirm: () => void;
    enterHint: "next" | "done";
    onEnter: (el: HTMLInputElement) => void;
  };
  shown?: string;
  /** A small action beside the line, such as "Correct" on a billed reading. */
  action?: ReactNode;
};

const LINE_TONE = { plain: "text-ink/75", money: "font-semibold text-green-deep", quiet: "text-ink/55" } as const;

/** One meter in a round: who it belongs to, its last reading, a big box for the new one and what it comes to. */
export function MeterRow({ id, badge, title, muted, sub, inputLabel, line, lineTone = "plain", warn, error, fixLabel, confirmLabel, index = 0, input, shown, action }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const filled = Boolean(input?.value);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !input) return;
    e.preventDefault();
    input.onEnter(e.currentTarget);
  }

  function fix() {
    ref.current?.focus();
    ref.current?.select();
  }

  return (
    <li
      data-row={id}
      data-warn={warn ? "true" : undefined}
      className={`rise scroll-mt-28 scroll-mb-48 px-4 py-3 transition-colors duration-150 motion-reduce:transition-none ${warn ? "bg-amber-soft" : ""}`}
      style={{ "--i": Math.min(index, 10) } as CSSProperties}
    >
      <div className="flex min-h-14 items-center gap-3.5">
        {badge}
        <div className="flex min-w-0 flex-1 flex-col">
          <label htmlFor={id} className={`line-clamp-2 text-[1.0625rem] break-words leading-snug font-semibold ${muted ? "text-ink/55" : "text-ink"}`}>
            {title}
            <span className="sr-only">. {inputLabel}</span>
          </label>
          <span className="mt-0.5 text-[0.9375rem] leading-snug text-ink/65">{sub}</span>
        </div>
        {input ? (
          <>
            <input
              ref={ref}
              id={id}
              name={input.name}
              data-reading=""
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              enterKeyHint={input.enterHint}
              maxLength={8}
              value={input.value}
              onChange={(e) => input.onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 8))}
              onKeyDown={onKeyDown}
              aria-invalid={Boolean(warn || error)}
              aria-describedby={line || warn || error ? `${id}-note` : undefined}
              className={`figure h-14 w-[7.5rem] flex-none rounded-2xl px-3 text-right text-[1.625rem] font-semibold text-ink ring-1 outline-none transition-shadow duration-100 focus:bg-card focus:ring-2 focus:ring-green aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-amber motion-reduce:transition-none ${
                filled ? "bg-card ring-green/35" : "bg-bg ring-ink/15"
              }`}
            />
            <input type="hidden" name={input.confirmName} value={input.confirmedValue} />
          </>
        ) : (
          <span
            id={id}
            className={`figure grid h-14 w-[7.5rem] flex-none items-center rounded-2xl px-3 text-right text-[1.5rem] font-medium ${
              shown ? "bg-well/70 text-ink/80" : "bg-well/40 text-ink/35"
            }`}
          >
            {shown || "–"}
          </span>
        )}
      </div>

      {line || warn || error || action ? (
        <div id={`${id}-note`} className="pl-[3.875rem]" aria-live="polite">
          {warn ? (
            <>
              <p className="mt-2 text-[0.9375rem] leading-snug font-semibold text-amber-deep">{warn}</p>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={fix}
                  className="press deva-nudge min-h-12 rounded-full bg-card px-3 text-base font-semibold text-amber-deep ring-1 ring-amber/30 outline-none active:bg-amber-soft focus-visible:ring-2 focus-visible:ring-amber"
                >
                  {fixLabel}
                </button>
                <button
                  type="button"
                  onClick={input?.onConfirm}
                  className="press deva-nudge min-h-12 rounded-full bg-amber px-3 text-base font-semibold text-white outline-none active:bg-amber-deep focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-amber-soft"
                >
                  {confirmLabel}
                </button>
              </div>
              {action ? <div className="mt-1 flex justify-end">{action}</div> : null}
            </>
          ) : line || action ? (
            // A long line pushes the action onto its own line, at the right.
            <div className="mt-1 flex min-h-6 flex-wrap items-center justify-between gap-x-2">
              <p className={`min-w-0 text-[0.9375rem] leading-snug tabular-nums ${LINE_TONE[lineTone]}`}>{line}</p>
              {action ? <div className="ml-auto">{action}</div> : null}
            </div>
          ) : null}
          {error && !warn ? (
            <p className="mt-1.5 text-[0.9375rem] leading-snug font-medium text-amber" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
