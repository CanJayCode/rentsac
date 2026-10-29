"use client";

import { MeterRow } from "@/components/MeterRow";
import { t, type Key, type Locale } from "@/lib/i18n";
import type { MainMeterKey } from "@/lib/repo/types";
import { parseReading, rowState, type MainRow, type Note } from "@/lib/rounds";

const LABEL: Record<MainMeterKey, Key> = {
  block_1_4: "readings.meter.block_1_4",
  block_5_8: "readings.meter.block_5_8",
  block_9_12: "readings.meter.block_9_12",
  block_13_16: "readings.meter.block_13_16",
  inverter: "readings.meter.inverter",
  motor: "readings.meter.motor",
};

/** A main meter's line: units since last time, or a warning. Never a bill. */
export function mainNote(locale: Locale, m: MainRow, raw: string, confirmed: boolean): Note {
  const none: Note = { line: null, tone: "quiet", warn: null, error: null };
  const parsed = parseReading(raw);
  if (!parsed.ok) return { ...none, error: parsed.error };
  const state = rowState(m.last, parsed.value, m.recent);
  switch (state.kind) {
    case "empty":
      return none;
    case "first":
      return { ...none, line: t(locale, "readings.mainFirst") };
    case "ok":
      return { ...none, line: t(locale, "readings.mainUnits", { units: state.units }) };
    case "lower":
      return confirmed ? { ...none, line: t(locale, "readings.billedReset") } : { ...none, warn: t(locale, "readings.warn.lower", { prev: m.last! }) };
    case "high":
      return confirmed
        ? { ...none, line: t(locale, "readings.mainUnits", { units: state.units }) }
        : { ...none, warn: t(locale, "readings.warn.high", { units: state.units }) };
  }
}

type Props = {
  locale: Locale;
  editable: boolean;
  main: MainRow[];
  notes: Note[];
  values: Record<string, string>;
  isConfirmed: (id: string) => boolean;
  serverError: (id: string) => Key | null;
  onChange: (id: string, v: string) => void;
  onConfirm: (id: string) => void;
  onEnter: (el: HTMLInputElement) => void;
};

/** The four block meters, the inverter and the motor: noted for reference, in the same rows as the rooms. */
export function MainMeters({ locale, editable, main, notes, values, isConfirmed, serverError, onChange, onConfirm, onEnter }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-[0.9375rem] leading-snug text-ink/70">{t(locale, "readings.mainHint")}</p>
      <ul className="divide-y divide-line overflow-hidden rounded-card bg-card shadow-soft">
        {main.map((m, i) => {
          const id = `main:${m.key}`;
          const note = notes[i];
          const err = note.error ?? serverError(id);
          return (
            <MeterRow
              key={m.key}
              id={`reading-main-${m.key}`}
              index={i}
              badge={<MeterBadge kind={m.key} />}
              title={t(locale, LABEL[m.key])}
              sub={m.last === null ? t(locale, "readings.noLast") : t(locale, "readings.last", { value: m.last })}
              inputLabel={t(locale, "readings.inputLabelMain", { name: t(locale, LABEL[m.key]) })}
              line={note.line}
              lineTone={note.tone}
              warn={editable ? note.warn : null}
              error={err ? t(locale, err) : null}
              fixLabel={t(locale, "readings.fix")}
              confirmLabel={t(locale, "readings.confirm")}
              shown={m.saved === null ? "" : String(m.saved)}
              input={
                editable
                  ? {
                      name: `m:${m.key}`,
                      confirmName: `mc:${m.key}`,
                      value: values[id],
                      confirmedValue: isConfirmed(id) ? values[id] : "",
                      onChange: (v) => onChange(id, v),
                      onConfirm: () => onConfirm(id),
                      enterHint: i === main.length - 1 ? "done" : "next",
                      onEnter,
                    }
                  : undefined
              }
            />
          );
        })}
      </ul>
    </div>
  );
}

const stroke = { stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** The plate a main meter sits on: the rooms a block meter covers, the inverter's battery or the pump. */
function MeterBadge({ kind }: { kind: MainMeterKey }) {
  const block = /^block_(\d+)_(\d+)$/.exec(kind);
  if (block) {
    return (
      <span className="figure grid size-12 flex-none place-items-center rounded-[0.9rem] bg-green-soft text-[1rem] leading-none font-medium text-green-deep" aria-hidden="true">
        {block[1]}–{block[2]}
      </span>
    );
  }
  return (
    <span className="grid size-12 flex-none place-items-center rounded-[0.9rem] bg-green-soft text-green-deep" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        {kind === "inverter" ? (
          <>
            <rect x="4" y="7" width="15" height="11" rx="1.8" {...stroke} />
            <path d="M19 10.5h1.5v4H19M10.5 9.5 8.6 12.8h3.2l-1.9 3.2" {...stroke} />
          </>
        ) : kind === "motor" ? (
          <>
            <path d="M12 4.5c2.8 3.3 4.6 5.9 4.6 8.4a4.6 4.6 0 0 1-9.2 0c0-2.5 1.8-5.1 4.6-8.4Z" {...stroke} />
            <path d="M10 13.6a2 2 0 0 0 2 2" {...stroke} />
          </>
        ) : null}
      </svg>
    </span>
  );
}
