"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useState } from "react";
import { setupPin, unlock, type AuthResult } from "./actions";
import { lockCopy as t } from "./copy";

type Phase = "code" | "choose" | "confirm" | "unlock";

type Props = {
  mode: "unlock" | "setup";
  /** Whether the first-run form must ask for SETUP_CODE. The code itself never reaches the browser. */
  setupCodeRequired: boolean;
  /** Remaining lockout for this client when the page was rendered, 0 if not locked. */
  initialRetryInMs: number;
};

const PIN_LENGTH = 6;
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const SHAKE_MS = 460;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function LockScreen({ mode, setupCodeRequired, initialRetryInMs }: Props) {
  const router = useRouter();
  const setupStart: Phase = setupCodeRequired ? "code" : "choose";
  const [phase, setPhase] = useState<Phase>(mode === "unlock" ? "unlock" : setupStart);
  const [digits, setDigits] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  const [remainingMs, setRemainingMs] = useState(initialRetryInMs);
  const locked = remainingMs > 0;
  const inputBlocked = busy || wrong || opened || locked || phase === "code";

  useEffect(() => {
    if (!locked) return;
    const id = window.setInterval(() => setRemainingMs((ms) => Math.max(0, ms - 1000)), 1000);
    return () => window.clearInterval(id);
  }, [locked]);

  function fail(text: string, nextPhase?: Phase) {
    setWrong(true);
    setMessage(text);
    window.setTimeout(() => {
      setDigits("");
      setWrong(false);
      if (nextPhase) setPhase(nextPhase);
    }, SHAKE_MS);
  }

  function handleResult(result: AuthResult) {
    if (result.ok) {
      setOpened(true);
      setMessage(t.opening);
      window.setTimeout(() => router.replace("/"), prefersReducedMotion() ? 0 : 750);
      return;
    }
    switch (result.error) {
      case "locked":
        setDigits("");
        setFirstPin("");
        setMessage(null);
        setRemainingMs(result.retryInSeconds * 1000);
        if (phase !== "unlock") setPhase(setupStart);
        break;
      case "invalid":
        fail(t.wrongPin);
        break;
      case "mismatch":
        setFirstPin("");
        fail(t.mismatch, "choose");
        break;
      case "setup-code":
        setFirstPin("");
        fail(t.wrongCode, "code");
        break;
      case "already-set":
        setDigits("");
        setFirstPin("");
        setPhase("unlock");
        setMessage(t.alreadySet);
        break;
      case "not-set":
        setDigits("");
        setPhase(setupStart);
        setMessage(t.notSet);
        break;
      default:
        fail(t.failed);
    }
  }

  async function submit(pin: string) {
    if (phase === "choose") {
      // Let the sixth dot show before moving on.
      setBusy(true);
      window.setTimeout(() => {
        setFirstPin(pin);
        setDigits("");
        setPhase("confirm");
        setBusy(false);
      }, 220);
      return;
    }
    if (phase === "confirm" && pin !== firstPin) {
      setFirstPin("");
      fail(t.mismatch, "choose");
      return;
    }
    setBusy(true);
    try {
      const result =
        phase === "unlock"
          ? await unlock(pin)
          : await setupPin(firstPin, pin, setupCodeRequired ? setupCode : undefined);
      handleResult(result);
    } catch {
      fail(t.failed);
    } finally {
      setBusy(false);
    }
  }

  function press(d: string) {
    if (inputBlocked || digits.length >= PIN_LENGTH) return;
    const next = digits + d;
    setDigits(next);
    setMessage(null);
    if (next.length === PIN_LENGTH) void submit(next);
  }

  function removeLast() {
    if (inputBlocked) return;
    setDigits((s) => s.slice(0, -1));
  }

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      press(e.key);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      removeLast();
    }
  });

  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  let title: string;
  let hint: string;
  if (locked) {
    title = t.lockedTitle;
    hint = t.lockedRetry(Math.ceil(remainingMs / 60000));
  } else if (phase === "code") {
    title = t.codeTitle;
    hint = t.codeHint;
  } else if (phase === "choose") {
    title = t.chooseTitle;
    hint = t.chooseHint;
  } else if (phase === "confirm") {
    title = t.confirmTitle;
    hint = t.confirmHint;
  } else {
    title = t.unlockTitle;
    hint = t.unlockHint;
  }

  return (
    <main className="flex flex-1 justify-center px-4">
      <div className="flex min-h-dvh w-full max-w-sm flex-col items-center justify-between pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(1.75rem,env(safe-area-inset-bottom))] sm:min-h-0 sm:my-auto sm:h-[46rem] sm:py-8">
        <header className="flex flex-col items-center text-center">
          <Building lit={opened} />
          <p className="mt-3 font-display text-lg font-medium tracking-[-0.01em] text-green">{t.appName}</p>
          <h1 className="mt-6 font-display text-[1.95rem] leading-tight font-medium tracking-[-0.02em] text-ink">
            {title}
          </h1>
          <p className={`mt-2 max-w-[19rem] text-[1.0625rem] leading-snug ${locked ? "font-medium text-amber" : "text-ink/70"}`}>
            {hint}
          </p>
        </header>

        {phase === "code" && !locked ? (
          <SetupCodeForm
            value={setupCode}
            onChange={setSetupCode}
            message={message}
            onSubmit={() => {
              if (!setupCode.trim()) return;
              setMessage(null);
              setPhase("choose");
            }}
          />
        ) : (
          <>
            <div className="flex flex-col items-center">
              <div
                className={`flex gap-[1.125rem] py-2 ${wrong ? "lock-shake" : ""}`}
                aria-hidden="true"
              >
                {Array.from({ length: PIN_LENGTH }, (_, i) => (
                  <span
                    key={i}
                    className="lock-dot"
                    data-filled={i < digits.length}
                    data-state={wrong ? "wrong" : opened ? "open" : undefined}
                  />
                ))}
              </div>
              <span className="sr-only" role="status">
                {t.digitsEntered(digits.length)}
              </span>
              <p
                className={`mt-3 min-h-[1.6em] text-center text-base font-medium ${opened ? "text-green" : "text-amber"}`}
                aria-live="assertive"
              >
                {message}
              </p>
            </div>

            <div className={`grid grid-cols-3 gap-x-6 gap-y-3.5 transition-opacity duration-200 motion-reduce:transition-none ${locked ? "opacity-35" : ""}`}>
              {DIGITS.map((d) => (
                <DigitKey key={d} digit={d} disabled={inputBlocked} onPress={press} />
              ))}
              <span aria-hidden="true" />
              <DigitKey digit="0" disabled={inputBlocked} onPress={press} />
              <button
                type="button"
                className="lock-key lock-key-quiet"
                aria-label={t.deleteKey}
                disabled={inputBlocked || digits.length === 0}
                onClick={removeLast}
              >
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M9.2 5.5h9.3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9.2a1.5 1.5 0 0 1-1.1-.5L3.5 12l4.6-5.99a1.5 1.5 0 0 1 1.1-.51Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <path d="m11.5 9.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function DigitKey({ digit, disabled, onPress }: { digit: string; disabled: boolean; onPress: (d: string) => void }) {
  return (
    <button type="button" className="lock-key" disabled={disabled} onClick={() => onPress(digit)}>
      {digit}
    </button>
  );
}

function SetupCodeForm({
  value,
  onChange,
  message,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  message: string | null;
  onSubmit: () => void;
}) {
  return (
    <form
      className="flex w-full flex-col gap-3 pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor="setup-code" className="text-base font-medium text-ink">
        {t.codeLabel}
      </label>
      <input
        id="setup-code"
        name="setup-code"
        type="text"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-14 w-full rounded-2xl bg-card px-4 text-lg text-ink ring-1 ring-ink/12 outline-none focus-visible:ring-2 focus-visible:ring-green"
      />
      <p className="min-h-[1.6em] text-base font-medium text-amber" aria-live="assertive">
        {message}
      </p>
      <button
        type="submit"
        disabled={!value.trim()}
        className="h-14 w-full rounded-full bg-green text-lg font-semibold text-white transition-[transform,opacity] duration-100 active:scale-[0.98] disabled:opacity-40 motion-reduce:transform-none"
      >
        {t.codeContinue}
      </button>
    </form>
  );
}

// Sixteen rooms on four floors: the building the app keeps accounts for. Its windows light up on unlock.
const LIGHT_ORDER = [5, 12, 1, 9, 14, 3, 7, 0, 10, 15, 2, 8, 13, 6, 11, 4];

function Building({ lit }: { lit: boolean }) {
  return (
    <svg width="60" height="72" viewBox="0 0 70 84" aria-hidden="true" className="block">
      <rect x="0" y="0" width="70" height="7" rx="2" fill="var(--ink)" />
      <rect x="4" y="5" width="62" height="79" rx="2.5" fill="var(--ink)" />
      {Array.from({ length: 16 }, (_, i) => {
        const row = Math.floor(i / 4);
        const col = i % 4;
        return (
          <rect
            key={i}
            className="lock-window"
            x={10.75 + col * 13.5}
            y={13 + row * 13}
            width="8"
            height="8.5"
            rx="1"
            data-lit={lit || i === 6}
            style={{ transitionDelay: lit ? `${LIGHT_ORDER.indexOf(i) * 38}ms` : "0ms" }}
          />
        );
      })}
      <rect x="29" y="67" width="12" height="17" rx="1.5" fill="var(--bg)" />
    </svg>
  );
}
