import { useEffect, useState, type ReactNode } from "react";
import { pools } from "../lib/rules.ts";
import { useStore } from "../lib/store.tsx";
import type { Bet, Id } from "../lib/types.ts";

export function Panel({
  label, right, children, className = "", bodyClass = "pbody",
}: {
  label?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={`panel ${label ? "tagged" : ""} ${className}`}>
      {label && <span className="plabel">{label}</span>}
      {right && <span className="pright">{right}</span>}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Modal({
  kicker, title, onClose, children,
}: {
  kicker: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="m-head">
          <div>
            <div className="kicker">{kicker}</div>
            <h3>{title}</h3>
          </div>
          <button type="button" className="btn ghost sm" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        <div className="m-body">{children}</div>
      </div>
    </>
  );
}

export const Pill = ({ kind, children }: { kind: string; children: ReactNode }) => (
  <span className={`pill ${kind}`}>
    <span className="dot" />
    {children}
  </span>
);

export function PoolBar({ bet }: { bet: Bet }) {
  const p = pools(bet);
  return (
    <div className={`pbar ${p.total ? "" : "empty"}`} aria-label={`${p.yesPct}% of coins on YES`}>
      {p.total > 0 && <i className="y" style={{ width: `${p.yesPct}%` }} />}
      <i className="n" />
    </div>
  );
}

export function initialsOf(n: string) {
  return n.match(/\d+$/)?.[0] ?? n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

/** A player's picture, or their initials when they haven't picked one. */
export function Avatar({ id, size }: { id: Id; size?: "lg" }) {
  const { name, avatar, me } = useStore();
  const url = avatar(id);
  const cls = `avatar ${id === me ? "me" : ""} ${size ?? ""}`;
  return url ? <img className={cls} src={url} alt="" referrerPolicy="no-referrer" /> : <span className={cls}>{initialsOf(name(id))}</span>;
}

export function Who({ id, suffix }: { id: Id; suffix?: ReactNode }) {
  const { name, me } = useStore();
  return (
    <span className="who">
      <Avatar id={id} />
      <span>
        {name(id)}
        {id === me && <span className="dim"> (you)</span>}
        {suffix}
      </span>
    </span>
  );
}

/** A button that asks once more before doing something that can't be undone. */
export function ConfirmButton({
  label, confirm, onConfirm, className = "btn", disabled,
}: {
  label: ReactNode;
  confirm: ReactNode;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`${className} ${armed ? "primary" : ""}`}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirm : label}
    </button>
  );
}

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone === "err" ? "err" : ""}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <b>{title}</b>
      {children}
    </div>
  );
}
