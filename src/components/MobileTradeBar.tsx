"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { MarketView, Side } from "@/lib/markets/types";

/**
 * On phones the trade ticket sits below the chart and holders. This bar keeps
 * Yes and No in reach: tapping one picks that side and scrolls to the ticket.
 * It hides while the ticket is on screen, and from `lg` up, where the ticket
 * sits beside the chart.
 */
export default function MobileTradeBar({ market: m, mode, targetId }: { market: MarketView; mode: "tokens" | "points"; targetId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ticketVisible, setTicketVisible] = useState(false);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setTicketVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);

  if (ticketVisible) return null;

  const go = (side: Side) => {
    router.replace(`${pathname}?side=${side}`, { scroll: false });
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const options = [
    { side: "yes" as const, label: mode === "tokens" ? "Buy Yes" : "Pick Yes", price: m.chance, cls: "bg-primary-container text-on-primary" },
    { side: "no" as const, label: mode === "tokens" ? "Buy No" : "Pick No", price: 100 - m.chance, cls: "bg-secondary text-on-secondary" },
  ];

  return (
    <div className="lg:hidden fixed inset-x-0 z-20 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] px-4 pb-2 pt-3 bg-gradient-to-t from-surface via-surface/95 to-transparent">
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <button key={o.side} onClick={() => go(o.side)} className={`flex items-center justify-between h-12 px-4 rounded-xl font-label-lg text-label-lg shadow-lg active:scale-[0.98] transition-transform ${o.cls}`}>
            {o.label}
            {mode === "tokens" && <span className="font-num">{o.price}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
