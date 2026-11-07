"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { inputClass } from "@/components/Field";
import { parseDate } from "@/lib/validate";

/** Format a YYYY-MM-DD or DD/MM/YYYY value as DD/MM/YYYY for display. */
function toDisplay(val: string): string {
  if (!val) return "";
  const iso = parseDate(val);
  if (!iso) return val;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

type Props = {
  id: string;
  name: string;
  value?: string; // YYYY-MM-DD or DD/MM/YYYY
  onChange?: (iso: string) => void;
  min?: string; // YYYY-MM-DD
  max?: string; // YYYY-MM-DD
  ariaInvalid?: boolean;
  className?: string;
};

/**
 * A date input formatted as DD/MM/YYYY with an integrated calendar picker.
 * Submits the ISO (YYYY-MM-DD) date or the raw input for server-side validation.
 */
export function DateInput({ id, name, value = "", onChange, min, max, ariaInvalid, className }: Props) {
  const [display, setDisplay] = useState(() => toDisplay(value));
  const [iso, setIso] = useState(() => parseDate(value) ?? "");
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const nextIso = parseDate(value) ?? "";
    setIso(nextIso);
    setDisplay(toDisplay(value));
  }, [value]);

  function handleTextChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setDisplay(raw);
    const parsedIso = parseDate(raw);
    if (parsedIso) {
      setIso(parsedIso);
      onChange?.(parsedIso);
    } else {
      setIso("");
      onChange?.("");
    }
  }

  function handleBlur() {
    if (iso) {
      setDisplay(toDisplay(iso));
    }
  }

  function handlePickerChange(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.value;
    if (picked) {
      setIso(picked);
      setDisplay(toDisplay(picked));
      onChange?.(picked);
    }
  }

  return (
    <div className="relative flex items-center">
      <input type="hidden" name={name} value={iso || display} />
      <input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder="DD/MM/YYYY"
        value={display}
        onChange={handleTextChange}
        onBlur={handleBlur}
        aria-invalid={ariaInvalid}
        className={`${className ?? inputClass} pr-12 figure`}
      />
      <div className="absolute right-2 flex size-10 items-center justify-center">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Open calendar"
          onClick={() => {
            try {
              pickerRef.current?.showPicker?.();
            } catch {
              pickerRef.current?.focus();
            }
          }}
          className="press flex size-9 items-center justify-center rounded-xl text-ink/40 outline-none hover:text-ink/70 active:bg-ink/5 focus-visible:ring-2 focus-visible:ring-green"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
            <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          min={min}
          max={max}
          value={iso}
          onChange={handlePickerChange}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}
