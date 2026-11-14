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
  /** Set when the result came from confirming an AI recommendation. */
  reviewId?: string;
  /** The settler's note, e.g. why they overrode or rejected the AI. */
  note?: string;
};

export type BetStatus = "open" | "closed" | "settled";

/** A fact drawn from stored data. `betIds` are the settled bets it was computed from. */
export type Fact = { id: string; text: string; betIds: string[] };

export type OddsEstimate = {
  id: string;
  at: string;
  /** "stats": computed from stored history only. "claude": the model's estimate on top of those stats. */
  source: "stats" | "claude";
  model?: string;
  trigger: "created" | "evidence" | "history" | "manual";
  probabilities: { outcomeId: string; p: number }[];
  /** 90% range for the first outcome (binary bets), in percent. */
  range?: [number, number];
  uncertainty: "low" | "medium" | "high";
  explanation: string;
  facts: Fact[];
  /** Fact ids and evidence ids the explanation relies on. Only ids that exist are kept. */
  citedFactIds: string[];
  citedEvidenceIds: string[];
};

export type Evidence = {
  id: string;
  betId: string;
  userId: string;
  kind: "text" | "link" | "image";
  text?: string;
  url?: string;
  /** Served from /api/evidence/:id for images. */
  imageUrl?: string;
  /** The outcome the submitter says this evidence supports, if any. */
  claimsOutcomeId?: string;
  createdAt: string;
};

export type ReviewIssue = {
  type: "missing" | "contradictory" | "inconclusive" | "unverifiable" | "self_interested";
  detail: string;
  evidenceIds: string[];
};

export type Review = {
  id: string;
  betId: string;
  requestedBy: string;
  at: string;
  source: "claude" | "rules" | "test-stub";
  model?: string;
  /** "recommended": the AI names an outcome. "needs_review": a human must decide without a recommendation. */
  status: "recommended" | "needs_review";
  outcomeId?: string;
  confidence?: number;
  explanation: string;
  evidenceUsed: { evidenceId: string; how: string }[];
  issues: ReviewIssue[];
  /** Evidence ids that existed when the review ran. */
  evidenceSeen: string[];
  decision?: { action: "confirmed" | "rejected"; by: string; at: string; note?: string };
};

export type AuditEntry = {
  id: string;
  betId: string;
  at: string;
  /** A user id, "ai", or "system". */
  actor: string;
  type:
    | "bet_created"
    | "entry_joined"
    | "entries_closed"
    | "odds_estimated"
    | "evidence_submitted"
    | "review_completed"
    | "recommendation_confirmed"
    | "recommendation_rejected"
    | "settled";
  detail: string;
  refs?: string[];
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
  /** Who the bet is about, if anyone. Drives the history-based odds. */
  subjectId?: string;
  /** Latest AI Bookie estimate, kept separate from the pool-implied `outcomes[].chance`. */
  odds?: OddsEstimate;
  oddsHistory: OddsEstimate[];
  evidence: Evidence[];
  reviews: Review[];
  audit: AuditEntry[];
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
  /** Which AI Bookie is running: Claude, the test stub, or none (stats only). */
  ai: { mode: "claude" | "off" | "stub"; model?: string };
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
  /** Friend the bet is about (optional). */
  subjectId?: string;
};

export type ApiError = { error: { code: string; message: string } };
