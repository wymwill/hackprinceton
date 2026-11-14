/**
 * Shapes shared by the server (persistence + API) and the client (screens).
 * Anything in here must stay free of Node-only imports.
 */

export type Outcome = { id: string; label: string };

export type Entry = {
  id: string;
  betId: string;
  userId: string;
  outcomeId: string;
  amount: number;
  createdAt: string;
};

export type Payout = {
  userId: string;
  outcomeId: string;
  staked: number;
  /** Points credited back at settlement (0 for losers). */
  payout: number;
  /** payout - staked */
  net: number;
};

export type Receipt = {
  id: string;
  betId: string;
  outcomeId: string;
  settledBy: string;
  settledAt: string;
  pool: number;
  winningPool: number;
  /** True when nobody backed the winning outcome, so every stake went back. */
  refunded: boolean;
  payouts: Payout[];
};

export type BetStatus = "open" | "closed" | "settled";

/**
 * The AI Bookie's opening line on a bet. Advisory only: payouts still come from
 * the pool, so this never moves points. `chances` lines up with `outcomes`.
 */
export type BookieLine = {
  status: "thinking" | "ready";
  /** "ai" when the agent answered, "formula" when it fell back to track records alone. */
  source?: "ai" | "formula";
  chances?: number[];
  take?: string;
  roast?: string;
  model?: string;
  at: string;
};

export type BetView = {
  id: string;
  groupId: string;
  proposition: string;
  emoji: string;
  category: string;
  dare?: string;
  creatorId: string;
  createdAt: string;
  deadline: string;
  status: BetStatus;
  pool: number;
  outcomes: (Outcome & { pool: number; chance: number; backers: number })[];
  entries: Entry[];
  /** Implied chance of each outcome after every entry, oldest first. */
  history: number[][];
  receipt?: Receipt;
  bookie?: BookieLine;
};

export type UserStats = {
  settled: number;
  wins: number;
  losses: number;
  /** Net points won or lost across settled bets. */
  net: number;
  /** Net points from bets settled in the last 7 days. */
  netWeek: number;
  /** Positive = current win streak, negative = current loss streak. */
  streak: number;
};

export type UserView = {
  id: string;
  name: string;
  title: string;
  avatar?: string;
  balance: number;
  /** Points currently locked in open or unsettled bets. */
  atRisk: number;
  stats: UserStats;
};

export type AppState = {
  me: string;
  users: UserView[];
  bets: BetView[];
  serverTime: string;
};

export type CreateBetInput = {
  proposition: string;
  outcomes: string[];
  deadline: string;
  stake: number;
  /** Index into `outcomes` the creator is backing with their stake. */
  pick: number;
  category?: string;
  emoji?: string;
  dare?: string;
};

export type ApiError = { error: { code: string; message: string } };
