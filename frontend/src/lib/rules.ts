/**
 * Read-only helpers for the screens. The server runs every rule (the SQL in
 * supabase/migrations) and sends standings and start blockers already worked
 * out; these only read that data or estimate payouts for the wager ticket.
 */
import type { Bet, Favor, Id, Series, Settings, Side, Standing } from "./types.ts";

export const DEFAULT_SETTINGS: Settings = {
  betCount: 5,
  losers: 1,
  startingCoins: 1000,
  mode: "pool",
  minContribution: 5,
  favorsPerPlayer: 2,
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

export function pools(bet: Bet) {
  let yes = 0;
  let no = 0;
  for (const w of bet.wagers) w.side === "yes" ? (yes += w.amount) : (no += w.amount);
  const total = yes + no;
  return { yes, no, total, yesPct: total ? Math.round((yes / total) * 100) : 50 };
}

/** When a wager on this bet can no longer be withdrawn, or null if never. */
export function withdrawUntil(bet: Bet, settings: Settings): number | null {
  if (!bet.openedAt || settings.withdrawMinutes <= 0) return null;
  return Date.parse(bet.openedAt) + settings.withdrawMinutes * 60_000;
}

/** What a player would get back if `side` wins after they add `extra` coins to it. */
export function payoutIfWins(bet: Bet, userId: Id, side: Side, extra: number) {
  const p = pools(bet);
  const mine = bet.wagers.find((w) => w.userId === userId && w.side === side)?.amount ?? 0;
  const stake = mine + extra;
  const sidePool = (side === "yes" ? p.yes : p.no) + extra;
  const otherPool = side === "yes" ? p.no : p.yes;
  if (stake === 0) return 0;
  if (otherPool === 0) return stake;
  return Math.floor((stake * (sidePool + otherPool)) / sidePool);
}

/** Shared pool: has this player agreed to the favor? Writing it counts. */
export const agreesTo = (f: Favor, userId: Id) => f.authorId === userId || f.agreedBy.includes(userId);
