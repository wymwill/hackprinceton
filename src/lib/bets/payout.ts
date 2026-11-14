import type { Entry, Payout } from "./types";

/**
 * Bookie's payout rule: a parimutuel pool.
 *
 * Every stake goes into one pot. When the bet settles, the people who backed the
 * winning outcome split the whole pot in proportion to what they staked. Losers
 * get nothing back. Points are never created or destroyed:
 *
 *   payout_i = floor(stake_i * pool / winningPool)
 *
 * The few points lost to rounding go one each to the biggest winning stakes
 * (earliest entry breaks ties), so the payouts always add up to the pool exactly.
 *
 * If nobody backed the winning outcome, every stake is refunded.
 */
export function computePayouts(entries: Entry[], winningOutcomeId: string) {
  const pool = sum(entries.map((e) => e.amount));
  const winners = entries.filter((e) => e.outcomeId === winningOutcomeId);
  const winningPool = sum(winners.map((e) => e.amount));
  const refunded = winningPool === 0;

  const credit = new Map<string, number>();
  if (refunded) {
    for (const e of entries) credit.set(e.id, e.amount);
  } else {
    for (const e of winners) credit.set(e.id, Math.floor((e.amount * pool) / winningPool));
    let remainder = pool - sum([...credit.values()]);
    const order = [...winners].sort((a, b) => b.amount - a.amount || a.createdAt.localeCompare(b.createdAt));
    for (let i = 0; remainder > 0; i = (i + 1) % order.length, remainder--) {
      credit.set(order[i].id, credit.get(order[i].id)! + 1);
    }
  }

  const payouts: Payout[] = entries.map((e) => {
    const payout = credit.get(e.id) ?? 0;
    return { userId: e.userId, outcomeId: e.outcomeId, staked: e.amount, payout, net: payout - e.amount };
  });
  return { pool, winningPool, refunded, payouts };
}

/** Points per outcome, in outcome order. */
export function poolsByOutcome(outcomeIds: string[], entries: Entry[]) {
  return outcomeIds.map((id) => sum(entries.filter((e) => e.outcomeId === id).map((e) => e.amount)));
}

/** Implied chance (0..100) of each outcome: its share of the pool. Even split when the pool is empty. */
export function impliedChances(pools: number[]) {
  const total = sum(pools);
  if (total === 0) return pools.map(() => Math.round(100 / pools.length));
  return pools.map((p) => Math.round((p / total) * 100));
}

/** What a new stake would pay if its outcome won and nobody else joined. */
export function estimatePayout(pools: number[], outcomeIndex: number, amount: number) {
  if (amount <= 0) return 0;
  const total = sum(pools) + amount;
  return Math.floor((amount * total) / (pools[outcomeIndex] + amount));
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
