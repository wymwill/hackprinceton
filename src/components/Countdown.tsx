"use client";

import { useEffect, useState } from "react";

const fmt = (s: number) =>
  [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");

/** Ticking HH:MM:SS countdown. Renders the starting value on the server so hydration matches. */
export default function Countdown({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  return <span suppressHydrationWarning>{fmt(left)}</span>;
}
