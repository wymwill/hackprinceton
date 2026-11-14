/**
 * Shapes shared by the server (storage and API) and the client (screens).
 * Nothing here may import Node-only modules.
 */
import type { Q } from "./lmsr";

export type Side = "yes" | "no";
export type GroupMode = "tokens" | "points";
export type Outcome = "yes" | "no" | "void";
export type MarketStatus = "open" | "closed" | "review" | "settled";
export type AiSource = "claude" | "stub" | "baseline" | "rules" | "stock";

export type DareSpec = { kind: "none" } | { kind: "preset" | "custom" | "bookie"; text: string } | { kind: "wheel" };

/** A fact computed from stored, settled markets. `marketIds` are the markets it came from. */
export type Fact = { id: string; text: string; marketIds: string[] };

export type BookieEstimate = {
  chance: number;
  range: [number, number];
  uncertainty: "low" | "medium" | "high";
  explanation: string;
  facts: Fact[];
  source: AiSource;
  model?: string;
  at: string;
  /** Set when Claude was asked but failed, so this is the baseline. */
  fallbackReason?: string;
  /** How Claude produced it: the opening-line Deep Agent, or one structured call. */
  via?: "deep-agent" | "single-call";
  /** Set when the Deep Agent failed and a single call stood in for it. */
  agentFallbackReason?: string;
};

export type ReviewIssue = { type: "missing" | "contradictory" | "inconclusive" | "unverifiable" | "self_interested"; detail: string; evidenceIds: string[] };

export type Review = {
  id: string;
  marketId: string;
  requestedBy: string;
  at: string;
  source: AiSource;
  model?: string;
  /** "recommended" names an outcome. "needs_human" means a person has to decide. */
  status: "recommended" | "needs_human";
  outcome?: Outcome;
  confidence?: number;
  explanation: string;
  evidenceUsed: { evidenceId: string; how: string }[];
  issues: ReviewIssue[];
  evidenceSeen: string[];
};

export type Receipt = {
  id: string;
  marketId: string;
  outcome: Outcome;
  voided: boolean;
  settledAt: string;
  results: { userId: string; net: number; payout: number; points: number; result: "won" | "lost" | "even" }[];
  roast?: string;
  roastSource?: AiSource;
  reviewId?: string;
  /** The dare text that applied, after the wheel or preset was resolved. */
  dareText?: string;
};

export type AiLogEntry = {
  id: string;
  marketId?: string;
  groupId: string;
  at: string;
  kind: "odds" | "review" | "roast" | "dare";
  source: AiSource;
  model?: string;
  summary: string;
  facts?: string[];
};

export type EvidenceView = {
  id: string;
  marketId: string;
  userId: string;
  kind: "text" | "image";
  text?: string;
  imageUrl?: string;
  claims?: Side;
  /** Mock "connected app" evidence, for example "Gym check in". */
  app?: string;
  createdAt: string;
};

export type ProposalView = {
  outcome: Outcome;
  by: string;
  at: string;
  endsAt: string;
  reviewId?: string;
  votes: Record<string, "confirm" | "dispute">;
  voters: string[];
};

export type MarketView = {
  id: string;
  groupId: string;
  question: string;
  rule?: string;
  dare?: DareSpec;
  subjectId?: string;
  category: string;
  hostId: string;
  createdAt: string;
  deadline: string;
  status: MarketStatus;
  /** Market price in tokens mode, pick share (or the Bookie) in points mode. 1 to 99. */
  chance: number;
  q: Q;
  tradeCount: number;
  bookie?: BookieEstimate;
  volume: number;
  history: { at: string; yes: number; source: "market" | "bookie" }[];
  positions: { userId: string; yes: number; no: number; spent: number }[];
  picks: { userId: string; side: Side }[];
  evidence: EvidenceView[];
  review?: Review;
  proposal?: ProposalView;
  receipt?: Receipt;
  aiLog: AiLogEntry[];
};

export type DareStatus = "todo" | "voting" | "done" | "skipped";

export type DareView = {
  id: string;
  groupId: string;
  marketId: string;
  question: string;
  text: string;
  owedBy: string;
  owedTo: string[];
  dueAt: string;
  status: DareStatus;
  proof?: { text?: string; imageUrl?: string; at: string };
  votes: Record<string, "approve" | "redo">;
};

export type MemberView = {
  userId: string;
  name: string;
  role: "owner" | "member";
  balance: number;
  positionValue: number;
  points: number;
  record: { wins: number; losses: number };
  /** Positive is a win streak, negative a losing streak. */
  streak: number;
  dares: { done: number; skipped: number };
};

export type GroupSummary = { id: string; name: string; emoji: string; mode: GroupMode };

export type GroupView = GroupSummary & {
  inviteCode: string;
  startingBalance: number;
  darePresets: string[];
  ownerId: string;
  locked: boolean;
  members: MemberView[];
};

export type UserView = { id: string; name: string; avatarUrl?: string };

export type AppState = {
  me: string;
  /** You, plus everyone who shares a group with you. */
  users: UserView[];
  /** "supabase": signed in with Google. "demo": the Playing as switcher. */
  auth: { mode: "supabase" | "demo" | "unconfigured" };
  groups: GroupSummary[];
  group: GroupView | null;
  markets: MarketView[];
  dares: DareView[];
  ai: { mode: "claude" | "off" | "stub"; model?: string };
  serverTime: string;
};

export type ApiError = { error: { code: string; message: string } };

export const CATEGORIES = ["fitness", "sleep", "food", "work", "social", "other"] as const;
