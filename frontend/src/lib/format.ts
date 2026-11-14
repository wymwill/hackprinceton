import { useEffect, useState } from "react";
import type { Mode, SeriesStatus } from "./types.ts";

export const fmt = (n: number) => n.toLocaleString("en-US");
export const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : "0");

export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function countdown(ms: number) {
  if (ms <= 0) return "0:00";
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const MODE_LABEL: Record<Mode, string> = {
  money: "Real money",
  pledge: "Self-pledged favors",
  pool: "Shared favor pool",
};

export const MODE_LETTER: Record<Mode, string> = { money: "A", pledge: "B", pool: "C" };

export const STATUS_LABEL: Record<SeriesStatus, string> = {
  lobby: "Lobby",
  active: "Live",
  assigning: "Picking favors",
  finished: "Finished",
};

export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}
