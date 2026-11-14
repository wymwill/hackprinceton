"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Re-render on an interval so countdowns and open/closed status stay current.
 * Starts at 0 during prerender (no clock reads on the server) and picks up the
 * real time right after mount, before any bet data has loaded.
 */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, ms);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [ms]);
  return now;
}

const noopSubscribe = () => () => {};

/**
 * False while React is hydrating server HTML, true after. Use it to hold back
 * data that only exists in the browser (the signed-in friend, live balances) so
 * the first client render matches the prerendered HTML exactly. This matters for
 * parts of the page inside a Suspense boundary, which can finish hydrating after
 * /api/state has already loaded.
 */
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** "3h 48m", "6d 2h", "42s", or "Closed". */
export function timeLeft(deadline: string, now: number) {
  const s = Math.floor((Date.parse(deadline) - now) / 1000);
  if (s <= 0) return "Closed";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

/** "5m ago", "2h ago", "3d ago". */
export function ago(iso: string, now: number) {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
