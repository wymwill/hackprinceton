import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { outcomeColor, shares } from "../lib/rules.ts";
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

/** Each outcome's share of the pool, as one bar split by color. */
export function PoolBar({ bet }: { bet: Bet }) {
  const { total, list } = shares(bet);
  const label = total ? list.map((o) => `${o.label} ${o.pct}%`).join(", ") : "No coins yet";
  return (
    <div className={`pbar ${total ? "" : "empty"}`} role="img" aria-label={`Pool share: ${label}`}>
      {total > 0 &&
        list.filter((o) => o.pool > 0).map((o) => <i key={o.id} title={`${o.label} · ${o.pct}%`} style={{ width: `${(o.pool / total) * 100}%`, background: o.color }} />)}
    </div>
  );
}

/** A colored dot and label for one outcome. */
export function OutcomeTag({ bet, id, strong = true }: { bet: Bet; id?: string | null; strong?: boolean }) {
  const i = bet.outcomes.findIndex((o) => o.id === id);
  if (i < 0) return <span className="dim">–</span>;
  const Tag = strong ? "b" : "span";
  return (
    <Tag className="otag" style={{ "--oc": outcomeColor(i) } as CSSProperties}>
      {bet.outcomes[i].label}
    </Tag>
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
  label, confirm, onConfirm, className = "btn", disabled, style,
}: {
  label: ReactNode;
  confirm: ReactNode;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
  style?: CSSProperties;
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
      style={style}
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
