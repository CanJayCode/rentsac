"use client";

import { useActionState, useRef, useState, type FormEvent } from "react";
import { MainMeters, mainNote } from "@/components/MainMeters";
import { MeterRow } from "@/components/MeterRow";
import { RoomBadge } from "@/components/RoomBadge";
import { t, type Locale } from "@/lib/i18n";
import { formatINR } from "@/lib/money";
import { parseReading, rowState, type MainRow, type Note, type RoundRow, type RoundState } from "@/lib/rounds";

type Props = {
  locale: Locale;
  roundId: string;
  rate: number;
  editable: boolean;
  rows: RoundRow[];
  main: MainRow[];
  action: (prev: RoundState, data: FormData) => Promise<RoundState>;
};

const mainId = (key: string) => `main:${key}`;

/**
 * What one room's row says: the live bill, a first reading, or a warning still to confirm. A billed row
 * shows its bill, unless it is being corrected: then the new value is worked out at the rate it was billed at.
 */
export function roomNote(locale: Locale, row: RoundRow, raw: string, confirmed: boolean, currentRate: number, correcting = false): Note {
  const none: Note = { line: null, tone: "plain", warn: null, error: null };
  if (row.bill && !correcting) return billedNote(locale, row);
  const parsed = parseReading(raw);
  if (!parsed.ok) return { ...none, error: parsed.error };
  if (row.bill && (parsed.value === null || parsed.value === row.saved)) return billedNote(locale, row);
  const rate = row.bill && row.bill.rate > 0 ? row.bill.rate : currentRate;
  const state = rowState(row.prev, parsed.value, row.recent);
  const bill = (units: number): Note =>
    row.occupied
      ? { ...none, tone: "money", line: t(locale, "readings.live", { units, rate: formatINR(rate), amount: formatINR(units * rate) }) }
      : { ...none, tone: "quiet", line: t(locale, "readings.liveVacant", { units }) };
  switch (state.kind) {
    case "empty":
      return none;
    case "first":
      return { ...none, line: t(locale, "readings.first") };
    case "ok":
      return bill(state.units);
    case "lower":
      return confirmed
        ? { ...none, line: row.occupied ? t(locale, "readings.confirmed.lower", { value: parsed.value! }) : t(locale, "readings.vacantNoBill") }
        : { ...none, warn: t(locale, "readings.warn.lower", { prev: row.prev! }) };
    case "high":
      if (!confirmed) return { ...none, warn: t(locale, "readings.warn.high", { units: state.units }) };
      return row.occupied
        ? { ...none, tone: "money", line: t(locale, "readings.confirmed.high", { units: state.units, rate: formatINR(rate), amount: formatINR(state.units * rate) }) }
        : bill(state.units);
  }
}

/** A room already billed in this round, or any room of a closed round. */
function billedNote(locale: Locale, row: RoundRow): Note {
  const none: Note = { line: null, tone: "plain", warn: null, error: null };
  const b = row.bill;
  if (!b) {
    if (row.saved === null) return row.occupied ? { ...none, tone: "quiet", line: t(locale, "readings.notRead") } : none;
    return { ...none, tone: "quiet", line: t(locale, "readings.vacantNoBill") };
  }
  if (b.prevReading === undefined) return { ...none, line: t(locale, "readings.billedFirst") };
  if (row.saved !== null && row.saved < b.prevReading) return { ...none, line: t(locale, "readings.billedReset") };
  return {
    ...none,
    tone: "money",
    line: `${t(locale, "readings.billed", { amount: formatINR(b.amount) })} · ${t(locale, "readings.billedLine", { units: b.units, rate: formatINR(b.rate) })}`,
  };
}

/**
 * The round as one list, like the sheet: every room with its last reading and a box for the new one,
 * the main meters on a second tab, and a Save bar that stays above the thumb.
 */
export function RoundEntry({ locale, roundId, rate, editable, rows, main, action }: Props) {
  const [state, formAction, saving] = useActionState(action, {});
  const [tab, setTab] = useState<"rooms" | "main">("rooms");
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const r of rows) v[r.roomId] = r.saved === null ? "" : String(r.saved);
    for (const m of main) v[mainId(m.key)] = m.saved === null ? "" : String(m.saved);
    return v;
  });
  // A stored value was confirmed when it was saved; a confirmation holds only for the value it was given to.
  const [confirmed, setConfirmed] = useState<Record<string, string>>(() => ({ ...values }));
  // Server errors stay on a row until it is changed.
  const [seen, setSeen] = useState(state);
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [blocked, setBlocked] = useState(false);
  // Billed rows opened again for a correction.
  const [correcting, setCorrecting] = useState<Set<string>>(new Set());
  const formRef = useRef<HTMLFormElement>(null);
  if (seen !== state) {
    setSeen(state);
    setCleared(new Set());
  }

  const set = (id: string, v: string) => {
    setValues((x) => ({ ...x, [id]: v }));
    setCleared((x) => new Set(x).add(id));
    setBlocked(false);
  };
  const confirm = (id: string) => {
    setConfirmed((x) => ({ ...x, [id]: values[id] }));
    setCleared((x) => new Set(x).add(id));
    setBlocked(false);
  };
  const startCorrecting = (id: string) => {
    setCorrecting((x) => new Set(x).add(id));
    requestAnimationFrame(() => {
      const box = document.getElementById(`reading-${id}`);
      if (box instanceof HTMLInputElement) {
        box.focus();
        box.select();
      }
    });
  };
  const keepBilled = (row: RoundRow) => {
    setCorrecting((x) => {
      const next = new Set(x);
      next.delete(row.roomId);
      return next;
    });
    set(row.roomId, row.saved === null ? "" : String(row.saved));
  };
  const isConfirmed = (id: string) => values[id] !== "" && confirmed[id] === values[id];
  const serverError = (id: string) => (cleared.has(id) ? null : (state.errors?.[id] ?? null));

  const roomNotes = rows.map((r) =>
    editable ? roomNote(locale, r, values[r.roomId], isConfirmed(r.roomId), rate, correcting.has(r.roomId)) : billedNote(locale, r),
  );
  const mainNotes = main.map((m) => mainNote(locale, m, values[mainId(m.key)], isConfirmed(mainId(m.key))));
  const roomsDone = rows.filter((r) => r.bill || values[r.roomId] !== "").length;
  const mainDone = main.filter((m) => values[mainId(m.key)] !== "").length;
  const tenantsLeft = rows.filter((r) => r.occupied && !r.bill && values[r.roomId] === "").length;
  const progress = tab === "main" ? { done: mainDone, total: main.length } : { done: roomsDone, total: rows.length };

  function nextFrom(el: HTMLInputElement) {
    const all = Array.from(formRef.current?.querySelectorAll<HTMLInputElement>("input[data-reading]") ?? []).filter(
      (x) => x.offsetParent !== null,
    );
    const next = all[all.indexOf(el) + 1];
    if (!next) {
      el.blur();
      return;
    }
    next.focus({ preventScroll: true });
    next.closest("li")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    // A warning must be answered before the round can be saved: take the thumb straight to it.
    const firstRoom = roomNotes.findIndex((n) => n.warn);
    const firstMain = mainNotes.findIndex((n) => n.warn);
    if (firstRoom === -1 && firstMain === -1) return;
    e.preventDefault();
    setBlocked(true);
    const panel = firstRoom !== -1 ? "rooms" : "main";
    const id = firstRoom !== -1 ? `reading-${rows[firstRoom].roomId}` : `reading-main-${main[firstMain].key}`;
    setTab(panel);
    requestAnimationFrame(() => formRef.current?.querySelector(`[data-row="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }

  const lastRoom = rows.findLastIndex((r) => !r.bill || correcting.has(r.roomId));
  const formError = blocked ? "readings.error.rows" : state.formError;

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate data-round="" className="flex flex-col gap-4">
      <input type="hidden" name="roundId" value={roundId} />

      <div role="tablist" aria-label={t(locale, "readings.tabsLabel")} className="grid grid-cols-2 gap-1 rounded-full bg-well p-1">
        {(
          [
            { id: "rooms", label: t(locale, "readings.tab.rooms"), done: roomsDone, total: rows.length },
            { id: "main", label: t(locale, "readings.tab.main"), done: mainDone, total: main.length },
          ] as const
        ).map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            id={`tab-${x.id}`}
            aria-selected={tab === x.id}
            aria-controls={`panel-${x.id}`}
            onClick={() => setTab(x.id)}
            className={`press deva-nudge flex min-h-12 items-center justify-center gap-2 rounded-full px-3 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-green ${
              tab === x.id ? "bg-card text-ink shadow-[0_1px_4px_rgba(29,43,36,0.12)]" : "text-ink/65"
            }`}
          >
            {x.label}
            <span className={`figure text-[0.9375rem] ${tab === x.id ? "text-green" : "text-ink/50"}`}>
              {x.done}/{x.total}
            </span>
          </button>
        ))}
      </div>

      <div role="tabpanel" id="panel-rooms" aria-labelledby="tab-rooms" hidden={tab !== "rooms"}>
        <ul className="divide-y divide-line overflow-hidden rounded-card bg-card shadow-soft">
          {rows.map((r, i) => {
            const note = roomNotes[i];
            const isCorrecting = correcting.has(r.roomId);
            const locked = !editable || (Boolean(r.bill) && !isCorrecting);
            const err = note.error ?? serverError(r.roomId);
            const canCorrect = editable && Boolean(r.bill) && r.correctable;
            return (
              <MeterRow
                key={r.roomId}
                id={`reading-${r.roomId}`}
                index={i}
                badge={<RoomBadge number={r.number} muted={!r.occupied && !r.bill} />}
                title={r.tenantName ?? t(locale, "room.vacant")}
                muted={!r.tenantName}
                sub={r.prev === null ? t(locale, "readings.noLast") : t(locale, "readings.last", { value: r.prev })}
                inputLabel={t(locale, "readings.inputLabel", { n: r.number })}
                line={note.line}
                lineTone={note.tone}
                warn={locked ? null : note.warn}
                error={err ? t(locale, err) : null}
                fixLabel={t(locale, "readings.fix")}
                confirmLabel={t(locale, "readings.confirm")}
                shown={r.saved === null ? "" : String(r.saved)}
                action={
                  canCorrect ? (
                    <button
                      type="button"
                      onClick={() => (isCorrecting ? keepBilled(r) : startCorrecting(r.roomId))}
                      aria-label={isCorrecting ? undefined : t(locale, "readings.correctLabel", { n: r.number })}
                      className="press deva-nudge -mr-2 inline-flex min-h-11 flex-none items-center rounded-full px-3 text-base font-semibold text-green outline-none active:bg-green/10 focus-visible:ring-2 focus-visible:ring-green"
                    >
                      {t(locale, isCorrecting ? "readings.keep" : "readings.correct")}
                    </button>
                  ) : null
                }
                input={
                  locked
                    ? undefined
                    : {
                        name: `r:${r.roomId}`,
                        confirmName: `c:${r.roomId}`,
                        value: values[r.roomId],
                        confirmedValue: isConfirmed(r.roomId) ? values[r.roomId] : "",
                        onChange: (v) => set(r.roomId, v),
                        onConfirm: () => confirm(r.roomId),
                        enterHint: i === lastRoom ? "done" : "next",
                        onEnter: nextFrom,
                      }
                }
              />
            );
          })}
        </ul>
      </div>

      <div role="tabpanel" id="panel-main" aria-labelledby="tab-main" hidden={tab !== "main"}>
        <MainMeters
          locale={locale}
          editable={editable}
          main={main}
          notes={mainNotes}
          values={values}
          isConfirmed={isConfirmed}
          serverError={serverError}
          onChange={set}
          onConfirm={confirm}
          onEnter={nextFrom}
        />
      </div>

      {editable ? (
        <div className="sticky bottom-[calc(4rem+max(0.5rem,env(safe-area-inset-bottom)))] z-10 -mx-5 mt-1 bg-bg px-5 pt-3 pb-3">
          {formError ? (
            <p className="mb-2.5 rounded-2xl bg-amber-soft px-4 py-2.5 text-[0.9375rem] leading-snug font-semibold text-amber-deep" role="alert">
              {t(locale, formError)}
            </p>
          ) : null}
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1" aria-live="polite">
              <p className="text-[1.0625rem] leading-tight font-semibold text-ink">
                {t(locale, "readings.progress", { n: progress.done, total: progress.total })}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-green transition-[width] duration-200 motion-reduce:transition-none"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="mt-1.5 line-clamp-2 text-[0.875rem] leading-snug text-ink/65">
                {tab === "main"
                  ? t(locale, "readings.mainShort")
                  : tenantsLeft === 0
                    ? t(locale, "readings.allRead")
                    : t(locale, tenantsLeft === 1 ? "readings.toRead.one" : "readings.toRead.many", { n: tenantsLeft })}
              </p>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="press deva-nudge min-h-14 flex-none rounded-full bg-green px-6 text-lg font-semibold text-white outline-none active:bg-green-deep focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-60"
            >
              {saving ? t(locale, "readings.saving") : t(locale, "readings.save")}
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
