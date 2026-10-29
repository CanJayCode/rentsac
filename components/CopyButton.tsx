"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  text: string;
  label: string;
  copiedLabel: string;
  /** Shown above the selectable text when the browser refuses every way of copying. */
  failedLabel: string;
  icon?: ReactNode;
  /** "card" (white, lifted) on the page; "well" (tinted) inside a white card. */
  tone?: "card" | "well";
  className?: string;
};

const CONFIRM_MS = 2000;

/** Copy with the Clipboard API; falls back to execCommand, then to the text itself, selected, for a manual copy. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

export function CopyButton({ text, label, copiedLabel, failedLabel, icon, tone = "card", className = "" }: Props) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);
  const manual = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (state === "failed") manual.current?.select();
  }, [state]);

  async function copy() {
    window.clearTimeout(timer.current);
    const ok = await copyText(text);
    setState(ok ? "copied" : "failed");
    if (ok) timer.current = window.setTimeout(() => setState("idle"), CONFIRM_MS);
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className={`press flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-green ${
          state === "copied"
            ? "bg-green-soft text-green-deep"
            : tone === "well"
              ? "bg-well text-ink active:bg-ink/10"
              : "bg-card text-ink shadow-soft active:bg-well"
        } ${className}`}
      >
        {state === "copied" ? (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m3.5 8.4 2.9 2.9 6.1-6.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          icon
        )}
        {state === "copied" ? copiedLabel : label}
      </button>
      <span className="sr-only" role="status">
        {state === "copied" ? copiedLabel : ""}
      </span>
      {state === "failed" ? (
        <div className="w-full basis-full">
          <p className="mb-1.5 text-[0.9375rem] leading-snug font-medium text-amber-deep" role="alert">
            {failedLabel}
          </p>
          <textarea
            ref={manual}
            readOnly
            value={text}
            rows={Math.min(10, text.split("\n").length + 1)}
            className="w-full rounded-2xl bg-well p-3 text-base leading-snug text-ink outline-none focus-visible:ring-2 focus-visible:ring-green"
          />
        </div>
      ) : null}
    </>
  );
}
