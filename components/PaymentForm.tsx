"use client";

import { Fragment, useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { Field, inputClass } from "@/components/Field";
import { t, type Key, type Locale } from "@/lib/i18n";
import { allocate, pending, type Charge, type Payment } from "@/lib/ledger";
import { allocationPreview } from "@/lib/ledger-view";
import { formatINR } from "@/lib/money";
import { NOTE_MAX, type PaymentField, type PaymentTarget } from "@/lib/payments";

type Mode = "cash" | "upi" | "both";
type State = { errors?: Partial<Record<PaymentField, Key>>; formError?: Key; values?: Record<string, string> };

const MODES: { value: Mode; label: Key }[] = [
  { value: "cash", label: "pay.mode.cash" },
  { value: "upi", label: "pay.mode.upi" },
  { value: "both", label: "pay.mode.both" },
];

const TARGETS: { value: PaymentTarget; label: Key; hint: Key }[] = [
  { value: "auto", label: "pay.for.auto", hint: "pay.forHint.auto" },
  { value: "rent", label: "pay.for.rent", hint: "pay.forHint.rent" },
  { value: "light", label: "pay.for.light", hint: "pay.forHint.light" },
];

type Props = {
  locale: Locale;
  action: (prev: State, data: FormData) => Promise<State>;
  roomNumber: number;
  tenantId: string;
  today: string;
  /** Every charge of the tenant, and the live payments other than the one being edited. */
  charges: Charge[];
  payments: Payment[];
  /** Set when editing. */
  payment: { id: string; amount: number; paidOn: string; cash: number; upi: number; note?: string; target: PaymentTarget } | null;
};

const digits = (s: string) => s.replace(/[^\d]/g, "").slice(0, 9);
const rupees = (s: string) => (s === "" ? 0 : Number(s));
/** "12,500" while typing, the Indian way; the server strips the commas. */
const grouped = (s: string) => (s === "" ? "" : formatINR(Number(s)).slice(1));

function modeOf(p: Props["payment"]): Mode {
  if (!p) return "cash";
  return p.cash > 0 && p.upi > 0 ? "both" : p.upi > 0 ? "upi" : "cash";
}

/** The payment form: amount, date, cash or PhonePe or both, what it is for, and where it will land. */
export function PaymentForm({ locale, action, roomNumber, tenantId, today, charges, payments, payment }: Props) {
  const [state, formAction, saving] = useActionState(action, {});
  const v = state.values;
  const [amount, setAmount] = useState(v?.amount ?? (payment ? String(payment.amount) : ""));
  const [paidOn, setPaidOn] = useState(v?.paidOn ?? payment?.paidOn ?? today);
  const [mode, setMode] = useState<Mode>((v?.mode as Mode) ?? modeOf(payment));
  const [cash, setCash] = useState(v?.cash ?? (payment && modeOf(payment) === "both" ? String(payment.cash) : ""));
  const [upi, setUpi] = useState(v?.upi ?? (payment && modeOf(payment) === "both" ? String(payment.upi) : ""));
  const [note, setNote] = useState(v?.note ?? payment?.note ?? "");
  const [target, setTarget] = useState<PaymentTarget>((v?.target as PaymentTarget) ?? payment?.target ?? "auto");

  // One key per form instance, made in the browser, so a double tap or a resubmit saves once.
  // React resets uncontrolled fields after an action returns (only ever an error here, nothing
  // was saved), so the key is put back on every new state.
  const idemRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (idemRef.current && !idemRef.current.value) idemRef.current.value = crypto.randomUUID();
  }, [state]);

  const err = (k?: Key) => (k ? t(locale, k) : undefined);
  const total = rupees(amount);
  const owed = pending(charges, allocate(charges, payments).paidByCharge);
  const preview = allocationPreview(charges, payments, { amount: total, paidOn, target });
  const after = owed.total - preview.rent - preview.light;
  const splitLeft = total - rupees(cash) - rupees(upi);
  const targetHint = TARGETS.find((x) => x.value === target)!.hint;

  const fills: { label: string; value: number }[] = [];
  if (owed.total > 0) fills.push({ label: t(locale, "pay.fill.all", { amount: formatINR(owed.total) }), value: owed.total });
  if (owed.rent > 0 && owed.light > 0) fills.push({ label: t(locale, "pay.fill.rent", { amount: formatINR(owed.rent) }), value: owed.rent });

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="room" value={roomNumber} />
      <input type="hidden" name="tenantId" value={tenantId} />
      {payment ? <input type="hidden" name="paymentId" value={payment.id} /> : <input ref={idemRef} type="hidden" name="idemKey" defaultValue="" />}

      <section className="flex flex-col gap-5 rounded-card bg-card p-5 shadow-soft">
        <Field id="amount" label={t(locale, "pay.amount")} error={err(state.errors?.amount)}>
          <div className="relative">
            <span className="figure pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[1.75rem] text-ink/50" aria-hidden="true">
              ₹
            </span>
            <input
              id="amount"
              name="amount"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              enterKeyHint="done"
              value={grouped(amount)}
              onChange={(e) => setAmount(digits(e.target.value))}
              aria-invalid={Boolean(state.errors?.amount)}
              className={`${inputClass} figure h-[4.25rem] pl-11 text-[2.25rem] font-semibold`}
            />
          </div>
        </Field>
        {fills.length > 0 && !payment ? (
          <div className="-mt-2 flex flex-wrap gap-2">
            {fills.map((f) => (
              <button
                key={f.label}
                type="button"
                onClick={() => setAmount(String(f.value))}
                className="press deva-nudge min-h-11 rounded-full bg-well px-4 text-[0.9375rem] font-semibold text-ink/80 outline-none active:bg-ink/10 focus-visible:ring-2 focus-visible:ring-green"
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : null}

        <Field id="paidOn" label={t(locale, "pay.date")} error={err(state.errors?.paidOn)}>
          <input
            id="paidOn"
            name="paidOn"
            type="date"
            max={today}
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
            aria-invalid={Boolean(state.errors?.paidOn)}
            className={`${inputClass} appearance-none`}
          />
        </Field>
      </section>

      <section className="flex flex-col gap-5 rounded-card bg-card p-5 shadow-soft">
        <Choice legend={t(locale, "pay.mode")} name="mode" value={mode} onChange={(m) => setMode(m as Mode)} options={MODES.map((m) => ({ value: m.value, label: t(locale, m.label) }))} />

        {mode === "both" ? (
          <div className="-mt-1 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <SplitInput id="cash" label={t(locale, "pay.cashPart")} value={cash} onChange={setCash} invalid={Boolean(state.errors?.split)} />
              <SplitInput id="upi" label={t(locale, "pay.upiPart")} value={upi} onChange={setUpi} invalid={Boolean(state.errors?.split)} />
            </div>
            <p
              aria-live="polite"
              className={`text-[0.9375rem] leading-snug font-semibold ${splitLeft === 0 && total > 0 ? "text-green-deep" : "text-amber-deep"}`}
            >
              {total > 0 && splitLeft === 0
                ? t(locale, "pay.split.ok")
                : splitLeft < 0
                  ? t(locale, "pay.split.over", { amount: formatINR(-splitLeft) })
                  : t(locale, "pay.split.left", { amount: formatINR(splitLeft) })}
            </p>
            {state.errors?.split ? (
              <p className="text-[0.9375rem] leading-snug font-medium text-amber" role="alert">
                {t(locale, state.errors.split)}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Choice
            legend={t(locale, "pay.for")}
            name="target"
            value={target}
            onChange={(x) => setTarget(x as PaymentTarget)}
            options={TARGETS.map((x) => ({ value: x.value, label: t(locale, x.label) }))}
          />
          <p className="text-[0.9375rem] leading-snug text-ink/65">{t(locale, targetHint)}</p>
        </div>

        <Field id="note" label={t(locale, "pay.note")} error={err(state.errors?.note)}>
          <input
            id="note"
            name="note"
            autoComplete="off"
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t(locale, "pay.notePlaceholder")}
            aria-invalid={Boolean(state.errors?.note)}
            className={inputClass}
          />
        </Field>
      </section>

      <Landing locale={locale} total={total} preview={preview} after={after} />

      {state.formError ? (
        <p className="rounded-2xl bg-amber-soft px-4 py-3 text-base font-medium text-amber-deep" role="alert">
          {t(locale, state.formError)}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={saving}
        className="press min-h-14 rounded-full bg-green px-6 text-lg font-semibold text-white outline-none active:bg-green-deep focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-60"
      >
        {saving ? t(locale, "tenant.saving") : t(locale, payment ? "tenant.saveEdit" : "pay.save")}
      </button>
    </form>
  );
}

/** Where the typed amount goes, worked out live from the tenant's real charges. */
function Landing({ locale, total, preview, after }: { locale: Locale; total: number; preview: { rent: number; light: number; advance: number }; after: number }) {
  const parts: string[] = [];
  if (preview.rent > 0) parts.push(t(locale, "pay.preview.rent", { amount: formatINR(preview.rent) }));
  if (preview.light > 0) parts.push(t(locale, "pay.preview.light", { amount: formatINR(preview.light) }));
  if (preview.advance > 0) parts.push(t(locale, "pay.preview.advance", { amount: formatINR(preview.advance) }));

  return (
    <section aria-live="polite" className="rounded-card bg-green-soft px-5 py-4 text-green-deep">
      {total > 0 ? (
        <>
          <p className="text-[1.0625rem] leading-snug font-semibold">
            <span className="figure text-[1.25rem]">{formatINR(total)}</span>
            <span aria-hidden="true"> → </span>
            {parts.map((part, i) => (
              <Fragment key={part}>
                {i > 0 ? " + " : ""}
                <span className="whitespace-nowrap">{part}</span>
              </Fragment>
            ))}
          </p>
          <p className="mt-1 text-base leading-snug">
            {after > 0 ? t(locale, "pay.after.left", { amount: formatINR(after) }) : t(locale, "pay.after.clear")}
          </p>
        </>
      ) : (
        <p className="text-base leading-snug">{t(locale, "pay.preview.empty")}</p>
      )}
    </section>
  );
}

function Choice({
  legend,
  name,
  value,
  onChange,
  options,
}: {
  legend: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: ReactNode }[];
}) {
  return (
    <fieldset className="flex min-w-0 flex-col">
      <legend className="mb-2 text-base font-semibold text-ink">{legend}</legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="press deva-nudge relative flex min-h-12 cursor-pointer items-center justify-center rounded-2xl bg-bg px-1 text-center text-base leading-tight font-semibold text-ink/75 ring-1 ring-ink/10 has-[:checked]:bg-green has-[:checked]:text-white has-[:checked]:ring-green has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-green has-[:focus-visible]:ring-offset-2"
          >
            {/* Uncontrolled: React's form reset after an action would undo a controlled radio. */}
            <input type="radio" name={name} value={o.value} defaultChecked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SplitInput({ id, label, value, onChange, invalid }: { id: string; label: string; value: string; onChange: (v: string) => void; invalid: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.9375rem] font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <span className="figure pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-lg text-ink/50" aria-hidden="true">
          ₹
        </span>
        <input
          id={id}
          name={id}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={grouped(value)}
          onChange={(e) => onChange(digits(e.target.value))}
          aria-invalid={invalid}
          className={`${inputClass} figure pl-8 text-xl`}
        />
      </div>
    </div>
  );
}
