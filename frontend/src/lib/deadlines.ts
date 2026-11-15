/**
 * Bet closing times. The server stores an exact instant and enforces it with its own
 * clock (migration 0018); the browser only converts to and from local time for the
 * picker and the labels, and counts down using server time (store.skew).
 */
import type { Bet } from "./types.ts";

/** Under this long to go, a bet is "closing soon". */
export const SOON_MS = 60 * 60_000;

const pad = (n: number) => String(n).padStart(2, "0");

/** An ISO instant as the value a <input type="datetime-local"> shows, in this browser's timezone. */
export function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A datetime-local value (this browser's local time) as an exact ISO instant, or null when empty or invalid. */
export function fromLocalInput(v: string) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Why a picked closing time won't do, or null. The server checks again with its own clock. */
export function deadlineProblem(v: string, now = Date.now()) {
  if (!v) return null;
  const iso = fromLocalInput(v);
  if (!iso) return "That closing time isn't a valid date and time.";
  if (Date.parse(iso) <= now + 60_000) return "Pick a closing time at least a minute from now.";
  if (Date.parse(iso) > now + 365 * 86_400_000) return "Pick a closing time within a year.";
  return null;
}

/** This browser's timezone, for labels: "America/New_York". */
export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** "Fri, Nov 20, 3:00 PM" in local time. */
export const deadlineText = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** "2d 4h", "3h 05m", "4:59" (under an hour). */
export function timeLeft(ms: number) {
  if (ms <= 0) return "0:00";
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${pad(m)}m`;
  return `${m}:${pad(s % 60)}`;
}

export type DeadlineState = "none" | "open" | "soon" | "closed";

/** Where a bet stands against its closing time, at server time `now`. */
export function deadlineState(bet: Pick<Bet, "status" | "closesAt">, now: number): DeadlineState {
  if (!bet.closesAt) return "none";
  if (bet.status !== "open") return "closed";
  const left = Date.parse(bet.closesAt) - now;
  return left <= 0 ? "closed" : left <= SOON_MS ? "soon" : "open";
}
