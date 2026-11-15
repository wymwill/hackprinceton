/**
 * A finished series' recap: final standings, the biggest upset and the best call.
 * Worked out only from what the server stored (standings, wagers, results); nothing
 * is estimated or invented.
 *
 * Bookie doesn't record odds over time. The only "pre-result" signal it has is how the
 * coins were split when betting closed (no wager is accepted after that). So "upset"
 * and "best call" are measured by the winning side's share of the coins at close,
 * and the recap says so. It's a measure of the crowd's money, not a probability.
 */
import type { Bet, Id, Series } from "./types.ts";

export type RecapStanding = {
  userId: Id;
  rank: number;
  coins: number;
  /** Coins gained or lost over the series. */
  net: number;
  losing: boolean;
  /** Other players on exactly the same coins (their order comes from the tiebreak). */
  tiedWith: Id[];
};

export type Upset = {
  betId: Id;
  question: string;
  /** The outcome that won. */
  outcome: string;
  /** Share of the coins on the winning outcome when betting closed, 0 to 1. */
  share: number;
  pool: number;
  /** How many other bets were exactly as surprising (the shown one is the bigger pool, then the earlier result). */
  alsoAsSurprising: number;
};

export type BestCall = {
  userId: Id;
  betId: Id;
  question: string;
  outcome: string;
  /** Share of the coins on that outcome when betting closed, 0 to 1. */
  share: number;
  stake: number;
  payout: number;
  /** Players with exactly as good a call (same share and same profit), after the one shown. */
  sharedWith: Id[];
};

export type Recap = {
  standings: RecapStanding[];
  winnerId: Id | null;
  /** True when first place was decided by the tiebreak (same coins as second). */
  winnerOnTiebreak: boolean;
  /** Bets with a winner and a payout (not refunded, canceled or settled as a tie). */
  settled: number;
  /** Bets refunded or canceled, which don't count for upsets or calls. */
  voided: number;
  upset: Upset | null;
  bestCall: BestCall | null;
};

export const UPSET_RULE =
  "The settled bet whose winning side had the smallest share of the coins when betting closed. Bookie doesn't record odds over time, so this is the crowd's money, not a probability.";
export const BEST_CALL_RULE =
  "The winning pick with the smallest share of the coins on its side when betting closed (under half). Ties go to the bigger profit, then the earlier bet.";

/** When a bet stopped taking wagers: its close, or failing that its settlement. */
const cutoffOf = (b: Bet) => b.closedAt ?? b.settledAt ?? null;

/**
 * A bet that can count: resolved with a single winner and coins on more than one side.
 * Returns the coins per outcome from wagers placed before the cutoff (the server never
 * accepts later ones; this is a second guard so no call can be credited after the fact).
 */
function scoredBet(b: Bet) {
  if (b.status !== "resolved" || b.refunded || !b.outcomeId || (b.tiedOutcomeIds?.length ?? 0) > 0) return null;
  const cutoff = cutoffOf(b);
  const inTime = b.wagers.filter((w) => !cutoff || Date.parse(w.updatedAt) <= Date.parse(cutoff));
  const pools = new Map<Id, number>();
  for (const w of inTime) pools.set(w.outcomeId, (pools.get(w.outcomeId) ?? 0) + w.amount);
  const total = [...pools.values()].reduce((a, n) => a + n, 0);
  const onWinner = pools.get(b.outcomeId) ?? 0;
  // A unanimous pool has nothing to upset (and is refunded anyway).
  if (!total || !onWinner || pools.size < 2) return null;
  return { bet: b, total, onWinner, share: onWinner / total, inTime, label: b.outcomes.find((o) => o.id === b.outcomeId)?.label ?? "?" };
}

const EPS = 1e-9;

export function recap(s: Series): Recap {
  const start = s.settings.startingCoins;
  const rows = [...s.standings].sort((a, b) => a.rank - b.rank);
  const standings: RecapStanding[] = rows.map((r) => ({
    userId: r.userId,
    rank: r.rank,
    coins: r.coins,
    net: r.coins - start,
    losing: r.losing,
    tiedWith: rows.filter((o) => o.userId !== r.userId && o.coins === r.coins).map((o) => o.userId),
  }));

  const scored = s.bets.map(scoredBet).filter((x): x is NonNullable<ReturnType<typeof scoredBet>> => !!x);

  // Biggest upset: smallest winning share; ties by bigger pool, then earlier result.
  let upset: Upset | null = null;
  if (scored.length) {
    const sorted = [...scored].sort(
      (a, b) => a.share - b.share || b.total - a.total || Date.parse(a.bet.settledAt ?? "") - Date.parse(b.bet.settledAt ?? "") || a.bet.position - b.bet.position
    );
    const top = sorted[0];
    upset = {
      betId: top.bet.id,
      question: top.bet.question,
      outcome: top.label,
      share: top.share,
      pool: top.total,
      alsoAsSurprising: sorted.filter((x) => x !== top && Math.abs(x.share - top.share) < EPS).length,
    };
  }

  // Best call: winning wagers on a minority side (under half the coins).
  type Call = { userId: Id; bet: Bet; label: string; share: number; stake: number; payout: number; firstAt: number };
  const calls: Call[] = [];
  for (const x of scored) {
    if (x.share >= 0.5) continue;
    for (const w of x.inTime) {
      if (w.outcomeId !== x.bet.outcomeId) continue;
      const result = x.bet.results?.find((r) => r.userId === w.userId);
      calls.push({ userId: w.userId, bet: x.bet, label: x.label, share: x.share, stake: w.amount, payout: result?.payout ?? 0, firstAt: Date.parse(w.firstAt) });
    }
  }
  calls.sort((a, b) => a.share - b.share || b.payout - b.stake - (a.payout - a.stake) || a.firstAt - b.firstAt || a.userId.localeCompare(b.userId));
  let bestCall: BestCall | null = null;
  if (calls.length) {
    const c = calls[0];
    const profit = c.payout - c.stake;
    bestCall = {
      userId: c.userId,
      betId: c.bet.id,
      question: c.bet.question,
      outcome: c.label,
      share: c.share,
      stake: c.stake,
      payout: c.payout,
      sharedWith: calls.slice(1).filter((o) => Math.abs(o.share - c.share) < EPS && o.payout - o.stake === profit).map((o) => o.userId),
    };
  }

  const winner = standings[0];
  return {
    standings,
    winnerId: winner?.userId ?? null,
    winnerOnTiebreak: !!winner && winner.tiedWith.length > 0,
    settled: scored.length,
    voided: s.bets.filter((b) => b.status === "canceled" || (b.status === "resolved" && (b.refunded || !b.outcomeId))).length,
    upset,
    bestCall,
  };
}

/** "18%" (never "0%" for a real stake: under 1% shows as "<1%"). */
export const pct = (share: number) => (share > 0 && share < 0.01 ? "<1%" : `${Math.round(share * 100)}%`);

// ---------- rematches ----------

/** "Gym month" → "Gym month · Rematch"; "Gym month · Rematch" → "Gym month · Rematch 2"; and so on. Max 60 characters. */
export function rematchName(name: string) {
  const m = name.match(/^(.*?) · Rematch(?: (\d+))?$/);
  const base = m ? m[1] : name;
  const n = m ? (m[2] ? Number(m[2]) + 1 : 2) : 1;
  const suffix = n === 1 ? " · Rematch" : ` · Rematch ${n}`;
  return `${base.slice(0, 60 - suffix.length).trimEnd()}${suffix}`;
}

/** Everyone else from last time, for the invitation list (never enrolled automatically). */
export const rematchInvitees = (s: Series, me: Id) => s.members.filter((m) => m.userId !== me).map((m) => ({ userId: m.userId, name: m.name, avatarUrl: m.avatarUrl ?? null }));
