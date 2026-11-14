"use client";

import { useEffect } from "react";

/** Small shared building blocks so screens stay consistent. */

export const card = "rounded-2xl bg-surface-container ring-1 ring-[#333238]";
export const label = "font-label-sm text-label-sm uppercase text-on-surface-variant";
export const input =
  "w-full rounded-xl bg-surface-container-lowest ring-1 ring-outline-variant/60 focus:ring-primary-container px-3 py-2.5 text-on-surface placeholder:text-outline outline-none font-body-md text-body-md";

const BTN = {
  primary: "bg-primary-container text-on-primary hover:brightness-110 shadow-[0_0_20px_rgba(255,95,31,0.35)]",
  quiet: "bg-surface-container-high text-on-surface hover:bg-surface-container-highest ring-1 ring-outline-variant/40",
  bookie: "bg-tertiary-container/15 text-tertiary ring-1 ring-tertiary-container/50 hover:bg-tertiary-container/25",
  yes: "bg-primary-container/25 text-primary ring-1 ring-primary-container/60 hover:bg-primary-container/35",
  no: "bg-secondary/15 text-secondary ring-1 ring-secondary/50 hover:bg-secondary/25",
};

export function Button({
  tone = "quiet",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof BTN }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-label-lg text-label-lg transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none ${BTN[tone]} ${className}`}
    />
  );
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] flex items-start sm:items-center justify-center bg-black/60 p-4 overflow-y-auto" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal aria-label={title} className={`${card} w-full ${wide ? "max-w-xl" : "max-w-md"} p-5 sm:p-6 flex flex-col gap-4 my-8`}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-headline-lg-mobile text-on-surface">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined block" aria-hidden>
              close
            </span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label: text, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={label}>{text}</span>
      {children}
      {hint && <span className="font-body-sm text-body-sm text-on-surface-variant">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid gap-1 p-1 rounded-xl bg-surface-container-lowest ring-1 ring-outline-variant/40" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`py-2 rounded-lg font-label-md text-label-md transition-colors ${value === o.value ? "bg-surface-container-highest text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className={`${card} p-8 flex flex-col items-center text-center gap-2`}>
      <span className="material-symbols-outlined text-[32px] text-outline" aria-hidden>
        {icon}
      </span>
      <p className="font-headline-sm text-headline-sm text-on-surface">{title}</p>
      {children && <div className="font-body-md text-body-md text-on-surface-variant">{children}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex flex-col gap-4 animate-pulse" aria-busy aria-label="Loading">
      <div className="h-10 w-1/3 rounded-xl bg-surface-container" />
      <div className="h-40 rounded-2xl bg-surface-container" />
      <div className="h-40 rounded-2xl bg-surface-container" />
    </div>
  );
}

/** "1,240" for tokens, "1,240 pts" for points. */
export const amount = (n: number, mode: "tokens" | "points") => `${n.toLocaleString()}${mode === "points" ? " pts" : ""}`;

export function NotInGroup() {
  return (
    <Empty icon="lock" title="You're not in this group">
      <p>Switch players or join with an invite code.</p>
    </Empty>
  );
}
