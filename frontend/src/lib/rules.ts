/**
 * Read-only helpers for the screens. The server runs every rule (the SQL in
 * supabase/migrations) and sends standings and start blockers already worked
 * out; these only read that data or estimate payouts for the wager ticket.
 */
import { fmtValue } from "./ranges.ts";
import type { Bet, Favor, Id, Series, Settings, Standing } from "./types.ts";

export const DEFAULT_SETTINGS: Settings = {
  betCount: 5,
  losers: 1,
  startingCoins: 1000,
  mode: "pool",
  minContribution: 5,
  favorsPerPlayer: 2,
  requireFavorContribution: true,
  exclusivePool: true,
  tiebreak: "first",
  betCreation: "during",
  withdrawMinutes: 15,
  hostPlays: true,
};

/** In the competition: joined, and not a host who sits out. */
export const isParticipant = (s: Series, userId: Id) => s.members.some((m) => m.userId === userId && m.plays);

/** Players in the competition, in join order. */
export const participantIds = (s: Series) => s.members.filter((m) => m.plays).map((m) => m.userId);

/** The server's ranking. */
export const standings = (s: Series): Standing[] => s.standings;

export type Balance = { settled: number; atStake: number; available: number };

export function balances(s: Series): Map<Id, Balance> {
  return new Map(s.standings.map((r) => [r.userId, { settled: r.coins, atStake: r.atStake, available: r.available }]));
}

/** Each outcome with its share of the pool (0 to 100) and its color. */
export function shares(bet: Bet) {
  const total = bet.outcomes.reduce((a, o) => a + o.pool, 0);
  const list = bet.outcomes.map((o, i) => ({ ...o, index: i, color: outcomeColor(i), pct: total ? Math.round((o.pool / total) * 100) : 0 }));
  return { total, list };
}

/** The outcome with the most coins on it (first listed wins ties), or undefined when nobody has bet. */
export function leader(bet: Bet) {
  const { total, list } = shares(bet);
  if (!total) return undefined;
  return list.reduce((best, o) => (o.pool > best.pool ? o : best), list[0]);
}

// YES/NO keep their colors; multiple-choice outcomes take the theme accents, then a few more.
const PALETTE = ["var(--yes)", "var(--no)", "var(--amber)", "var(--link)", "var(--pink)", "#5fb3d9", "#d98f5f", "#8fcf6a", "#d96fb0", "#a3a3b5"];
export const outcomeColor = (index: number) => PALETTE[index % PALETTE.length];

export const outcomeById = (bet: Bet, id?: Id | null) => bet.outcomes.find((o) => o.id === id);
export const labelOf = (bet: Bet, id?: Id | null) => outcomeById(bet, id)?.label ?? "–";

/** The outcome a link or older code means: an id, or a YES/NO label ("yes", "no"). */
export function findOutcome(bet: Bet, ref?: string | null) {
  if (!ref) return undefined;
  return bet.outcomes.find((o) => o.id === ref) ?? bet.outcomes.find((o) => o.label.toLowerCase() === ref.toLowerCase());
}

/** How a resolved bet ended, in words: the winner, or what the tie rule did. */
export function resultText(bet: Bet) {
  if (bet.status === "canceled") return "Canceled";
  if (bet.kind === "range" && bet.resultValue != null) {
    const v = fmtValue(Number(bet.resultValue), bet.unit ?? "", bet.decimals ?? 0);
    return bet.outcomeId ? `${v} → ${labelOf(bet, bet.outcomeId)}` : `${v} · outside every range`;
  }
  const tied = (bet.tiedOutcomeIds ?? []).map((id) => labelOf(bet, id));
  if (tied.length) return bet.outcomeId ? `${labelOf(bet, bet.outcomeId)} (tie, listed first)` : `Tie: ${tied.join(" & ")}`;
  return bet.outcomeId ? labelOf(bet, bet.outcomeId) : "Refunded";
}

export const TIE_RULE_TEXT: Record<Bet["tieRule"], string> = {
  refund: "If it's a tie, everyone gets their coins back.",
  first_listed: "If it's a tie, the outcome listed first wins.",
};

/** When a wager on this bet can no longer be withdrawn, or null if never. */
export function withdrawUntil(bet: Bet, settings: Settings): number | null {
  if (!bet.openedAt || settings.withdrawMinutes <= 0) return null;
  return Date.parse(bet.openedAt) + settings.withdrawMinutes * 60_000;
}

/**
 * What a player would get back if `outcomeId` wins after they add `extra` coins to it.
 * Same rule as the server: winners split the whole pool by stake; if nobody else is
 * on another outcome, it's a refund.
 */
export function payoutIfWins(bet: Bet, userId: Id, outcomeId: Id, extra: number) {
  const { total } = shares(bet);
  const onIt = outcomeById(bet, outcomeId)?.pool ?? 0;
  const mine = bet.wagers.find((w) => w.userId === userId && w.outcomeId === outcomeId)?.amount ?? 0;
  const stake = mine + extra;
  const sidePool = onIt + extra;
  const otherPool = total - onIt;
  if (stake === 0) return 0;
  if (otherPool === 0) return stake;
  return Math.floor((stake * (sidePool + otherPool)) / sidePool);
}

/** Shared pool: has this player agreed to the favor? Writing it counts. */
export const agreesTo = (f: Favor, userId: Id) => f.authorId === userId || f.agreedBy.includes(userId);
