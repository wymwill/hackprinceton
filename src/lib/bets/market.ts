import { estimatePayout } from "./payout";
import type { AppState, BetView, OddsEstimate } from "./types";

/**
 * Display helpers for markets. Two different numbers appear on every market and
 * must never be confused:
 *
 * - AI Bookie estimate: the model's (or the history baseline's) probability.
 * - Pool share: the fraction of points staked on each outcome. It is not a
 *   price and not a calibrated probability; it only says where the points are.
 */

export const aiP = (bet: BetView, outcomeId: string, est: OddsEstimate | undefined = bet.odds) =>
  est ? Math.round((est.probabilities.find((p) => p.outcomeId === outcomeId)?.p ?? 0) * 100) : undefined;

export const isBinary = (bet: BetView) => bet.outcomes.length === 2;

/**
 * Where the AI number came from and whether it's the opening line or a later
 * re-estimate, in words a judge can read at a glance.
 */
export function aiSource(est: OddsEstimate | undefined, mode: AppState["ai"]["mode"]) {
  if (!est) return { label: "No estimate", tone: "muted" as const, fallback: false, opening: false };
  const opening = est.trigger === "created";
  const stage = opening ? "Opening" : "Re-estimated";
  if (est.source === "claude") {
    return { label: `${stage} · ${est.via === "deep-agent" ? "Deep Agent" : "Claude"}`, tone: "ai" as const, fallback: false, opening };
  }
  if (est.fallbackReason) return { label: `${stage} · AI unavailable`, tone: "warn" as const, fallback: true, opening, reason: est.fallbackReason };
  if (mode === "off") return { label: `${stage} · AI offline, history only`, tone: "muted" as const, fallback: true, opening };
  return { label: `${stage} · history only`, tone: "muted" as const, fallback: false, opening };
}

/** Why the current estimate exists. */
export const TRIGGER_TEXT: Record<OddsEstimate["trigger"], string> = {
  created: "Opening line, set when the bet was posted",
  evidence: "Re-estimated after new evidence",
  history: "Re-estimated after a related bet settled",
  manual: "Re-estimated on request",
};

/** The opening-line estimate: the latest one stamped "created" (the agent's, if it answered). */
export const openingEstimate = (bet: BetView) => [...bet.oddsHistory].reverse().find((o) => o.trigger === "created" && !(o.source === "stats" && bet.oddsHistory.some((x) => x.trigger === "created" && x.source === "claude")));

/** Payout multiple for staking `amount` on outcome `i` right now, if nobody else joins. */
export function payoutMultiple(bet: BetView, i: number, amount = 100) {
  const pools = bet.outcomes.map((o) => o.pool);
  return estimatePayout(pools, i, amount) / amount;
}

export type Point = { t: number; v: number };

/**
 * Recorded history for one outcome, oldest first, with real timestamps.
 * Pool share: the even split at creation, then the split after each entry.
 * AI: every stored estimate (if two land on the same instant, the later wins).
 */
export function timeline(bet: BetView, outcomeIndex: number) {
  const pool: Point[] = bet.history.map((h, k) => ({
    t: Date.parse(k === 0 ? bet.createdAt : (bet.entries[k - 1]?.createdAt ?? bet.createdAt)),
    v: h[outcomeIndex] ?? 0,
  }));
  const id = bet.outcomes[outcomeIndex].id;
  const ai: Point[] = [];
  for (const est of bet.oddsHistory) {
    const pt = { t: Date.parse(est.at), v: aiP(bet, id, est) ?? 0 };
    if (ai.length && ai[ai.length - 1].t === pt.t) ai[ai.length - 1] = pt;
    else ai.push(pt);
  }
  return { pool, ai };
}

/** "Most activity in the last 48 hours": entries plus evidence, then pool size. */
export function activityScore(bet: BetView, now: number) {
  const since = now - 48 * 3_600_000;
  const recent =
    bet.entries.filter((e) => Date.parse(e.createdAt) >= since).length + bet.evidence.filter((e) => Date.parse(e.createdAt) >= since).length;
  return recent * 1000 + bet.pool;
}
