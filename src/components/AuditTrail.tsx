"use client";

import type { BetView } from "@/lib/bets/types";
import { useBookie } from "./BookieProvider";

const ICON: Record<string, string> = {
  bet_created: "🎲",
  entry_joined: "🪙",
  entries_closed: "🔒",
  odds_estimated: "📊",
  evidence_submitted: "📎",
  review_completed: "🤖",
  recommendation_confirmed: "✅",
  recommendation_rejected: "✋",
  settled: "⚖️",
};

/** Every recorded step for a bet: entries, odds, evidence, AI reviews, and human decisions. */
export default function AuditTrail({ bet }: { bet: BetView }) {
  const { user } = useBookie();
  const actor = (a: string) => (a === "ai" ? "AI Bookie" : a === "system" ? "Bookie (stats)" : (user(a)?.name ?? a));
  return (
    <details className="rounded-2xl bg-surface-container border border-[#2f384a] p-space-md">
      <summary className="cursor-pointer font-headline-sm text-headline-sm text-on-surface">🧾 Audit trail ({bet.audit.length})</summary>
      <ol className="flex flex-col gap-1.5 pt-3">
        {bet.audit.map((a) => (
          <li key={a.id} className="grid grid-cols-[auto_1fr] gap-x-2 font-body-sm text-body-sm">
            <span>{ICON[a.type] ?? "•"}</span>
            <span className="text-on-surface">
              <b>{actor(a.actor)}</b> {a.detail}
              <span className="block text-on-surface-variant">
                {new Date(a.at).toLocaleString()}
                {a.refs?.length ? ` · ${a.refs.join(", ")}` : ""}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
