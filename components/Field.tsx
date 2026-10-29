import type { ReactNode } from "react";

export const inputClass =
  "h-13 w-full min-w-0 rounded-2xl bg-bg px-4 text-lg text-ink ring-1 ring-ink/12 outline-none transition-shadow duration-100 placeholder:text-ink/45 focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-green aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-amber motion-reduce:transition-none";

/** A label above its control, an optional hint, and the error in amber under it. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | false;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-base font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-[0.9375rem] leading-snug text-ink/65">{hint}</p> : null}
      {error ? (
        <p className="text-[0.9375rem] leading-snug font-medium text-amber" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
