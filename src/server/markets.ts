import "server-only";
import { applyTrade, initialQ, priceYes, quoteBuy, quoteSell, PAYOUT } from "@/lib/markets/lmsr";
import type { SettledRecord } from "@/lib/markets/baseline";
import { CATEGORIES, type BookieEstimate, type DareSpec, type MarketStatus, type Outcome, type Receipt, type Side } from "@/lib/markets/types";
import { aiMode } from "./ai/config";
import { createDaresFor, sweepDares } from "./dares";
import { AppError } from "./errors";
import { balanceIn, requireMember } from "./groups";
import { newId, type Db, type Market, type Trade } from "./store";

/**
 * Markets: create, trade (tokens), pick (points), close, evidence, the host's
 * proposal, the group's vote, and settlement. Every function takes the
 * database and runs inside one `transact`, so checks and writes are atomic.
 */

export const DISPUTE_WINDOW_MS = Number(process.env.BWF_DISPUTE_WINDOW_MS ?? 24 * 3600_000);
const DAY = 24 * 3600_000;

// ---------- AI work queued for after the response ----------

export type AiTask = { kind: "odds"; marketId: string; trigger: "created" | "history" } | { kind: "roast"; receiptId: string };
const q = globalThis as unknown as { __bwfAiQueue?: AiTask[] };
export const aiQueue = () => (q.__bwfAiQueue ??= []);

// ---------- reads ----------

export function statusOf(m: Market, now = Date.now()): MarketStatus {
  if (m.receiptId) return "settled";
  if (m.proposal) return "review";
  if (m.closedAt || now >= Date.parse(m.deadline)) return "closed";
  return "open";
}

export function requireMarket(db: Db, userId: string, marketId: string) {
  const market = db.markets.find((m) => m.id === marketId);
  if (!market) throw new AppError(404, "market_not_found", "That market doesn't exist.");
  const { group } = requireMember(db, userId, market.groupId);
  return { market, group };
}

const clampPct = (n: number) => Math.min(99, Math.max(1, Math.round(n)));

export function chanceOf(db: Db, m: Market) {
  const group = db.groups.find((g) => g.id === m.groupId)!;
  if (group.mode === "points") {
    const picks = db.picks.filter((p) => p.marketId === m.id);
    if (picks.length) return clampPct((picks.filter((p) => p.side === "yes").length / picks.length) * 100);
  }
  return clampPct(priceYes(m.q) * 100);
}

/** Each user's holdings and net spend in a tokens market. */
export function positionsOf(db: Db, marketId: string) {
  const map = new Map<string, { userId: string; yes: number; no: number; spent: number }>();
  for (const t of db.trades) {
    if (t.marketId !== marketId) continue;
    const p = map.get(t.userId) ?? { userId: t.userId, yes: 0, no: 0, spent: 0 };
    p[t.side] += t.contracts;
    p.spent += t.amount;
    map.set(t.userId, p);
  }
  return [...map.values()];
}

/** Everyone with a position or pick, minus the host. */
export function votersOf(db: Db, m: Market) {
  const ids = new Set([...db.trades.filter((t) => t.marketId === m.id).map((t) => t.userId), ...db.picks.filter((p) => p.marketId === m.id).map((p) => p.userId)]);
  ids.delete(m.hostId);
  return [...ids];
}

/** Settled, non void markets in a group, shaped for the baseline. */
export function settledRecords(db: Db, groupId: string): SettledRecord[] {
  return db.receipts.flatMap((r) => {
    const m = db.markets.find((x) => x.id === r.marketId);
    if (!m || m.groupId !== groupId || r.voided) return [];
    return [{ marketId: m.id, category: m.category, subjectId: m.subjectId, yes: r.outcome === "yes", settledAt: r.settledAt }];
  });
}

// ---------- create ----------

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function parseDare(v: unknown): DareSpec | undefined {
  if (!v || typeof v !== "object") return undefined;
  const d = v as { kind?: unknown; text?: unknown };
  if (d.kind === "none") return { kind: "none" };
  if (d.kind === "wheel") return { kind: "wheel" };
  if (d.kind === "preset" || d.kind === "custom" || d.kind === "bookie") {
    const text = str(d.text);
    if (!text || text.length > 80) throw new AppError(400, "bad_dare", "Dares are 1 to 80 characters.");
    return { kind: d.kind, text };
  }
  throw new AppError(400, "bad_dare", "Unknown dare type.");
}

export type CreateMarketInput = { question?: unknown; rule?: unknown; deadline?: unknown; chance?: unknown; dare?: unknown; subjectId?: unknown; category?: unknown };

export function createMarket(db: Db, userId: string, groupId: string, input: CreateMarketInput, now = new Date()) {
  const { group } = requireMember(db, userId, groupId);
  const question = str(input.question);
  if (question.length < 3 || question.length > 140) throw new AppError(400, "bad_question", "Questions are 3 to 140 characters.");
  const rule = str(input.rule) || undefined;
  if (rule && rule.length > 160) throw new AppError(400, "bad_rule", "Keep how we'll know under 160 characters.");
  const deadline = Date.parse(str(input.deadline));
  if (!Number.isFinite(deadline) || deadline <= now.getTime()) throw new AppError(400, "bad_deadline", "Pick a deadline in the future.");
  if (deadline > now.getTime() + 90 * DAY) throw new AppError(400, "bad_deadline", "Deadlines can be at most 90 days away.");
  const chance = input.chance === undefined || input.chance === null || input.chance === "" ? 50 : Number(input.chance);
  if (!Number.isFinite(chance) || chance < 5 || chance > 95) throw new AppError(400, "bad_chance", "Starting chance is 5% to 95%.");
  const subjectId = str(input.subjectId) || undefined;
  if (subjectId && !db.memberships.some((m) => m.groupId === groupId && m.userId === subjectId)) throw new AppError(400, "bad_subject", "That person isn't in this group.");
  const category = (CATEGORIES as readonly string[]).includes(str(input.category)) ? str(input.category) : "other";

  const market: Market = {
    id: newId("m", 8),
    groupId: group.id,
    question,
    rule,
    dare: parseDare(input.dare),
    subjectId,
    category,
    hostId: userId,
    createdAt: now.toISOString(),
    deadline: new Date(deadline).toISOString(),
    q: initialQ(Math.round(chance)),
    history: [{ at: now.toISOString(), yes: Math.round(chance), source: "market" }],
    tradeCount: 0,
  };
  db.markets.push(market);
  aiQueue().push({ kind: "odds", marketId: market.id, trigger: "created" });
  return market;
}

// ---------- trade, pick, close ----------

export function trade(db: Db, userId: string, marketId: string, input: { action?: unknown; side?: unknown; amount?: unknown }, now = new Date()) {
  const { market, group } = requireMarket(db, userId, marketId);
  if (group.mode !== "tokens") throw new AppError(409, "wrong_mode", "This group plays for points. Make a pick instead.");
  if (statusOf(market, now.getTime()) !== "open") throw new AppError(409, "market_closed", "Trading is closed on this market.");
  const side = input.side;
  if (side !== "yes" && side !== "no") throw new AppError(400, "bad_side", "Pick Yes or No.");
  const amount = Number(input.amount);
  if (!Number.isInteger(amount) || amount <= 0) throw new AppError(400, "bad_amount", "Enter a whole number above 0.");

  let contracts: number;
  let cost: number;
  if (input.action === "buy") {
    const quote = quoteBuy(market.q, side, amount);
    if (quote.contracts === 0) throw new AppError(400, "too_small", "That's not enough for one contract at this price.");
    if (quote.cost > balanceIn(db, group.id, userId)) throw new AppError(409, "insufficient", "You don't have enough tokens for that.");
    contracts = quote.contracts;
    cost = quote.cost;
  } else if (input.action === "sell") {
    const held = positionsOf(db, marketId).find((p) => p.userId === userId)?.[side] ?? 0;
    if (amount > held) throw new AppError(409, "not_enough_contracts", `You only hold ${held} ${side === "yes" ? "Yes" : "No"} contracts.`);
    contracts = -amount;
    cost = -quoteSell(market.q, side, amount);
  } else {
    throw new AppError(400, "bad_action", "Buy or sell.");
  }

  const at = now.toISOString();
  market.q = applyTrade(market.q, side, contracts);
  market.tradeCount++;
  market.history.push({ at, yes: clampPct(priceYes(market.q) * 100), source: "market" });
  const t: Trade = { id: newId("t"), marketId, userId, side, contracts, amount: cost, createdAt: at };
  db.trades.push(t);
  db.ledger.push({ id: newId("l"), groupId: group.id, userId, marketId, kind: contracts > 0 ? "buy" : "sell", amount: -cost, createdAt: at });
  return t;
}

export function pick(db: Db, userId: string, marketId: string, side: unknown, now = new Date()) {
  const { market, group } = requireMarket(db, userId, marketId);
  if (group.mode !== "points") throw new AppError(409, "wrong_mode", "This group plays for tokens. Buy contracts instead.");
  if (statusOf(market, now.getTime()) !== "open") throw new AppError(409, "market_closed", "Picks are closed on this market.");
  if (side !== "yes" && side !== "no") throw new AppError(400, "bad_side", "Pick Yes or No.");
  const existing = db.picks.find((p) => p.marketId === marketId && p.userId === userId);
  if (existing) Object.assign(existing, { side, updatedAt: now.toISOString() });
  else db.picks.push({ marketId, userId, side, updatedAt: now.toISOString() });
  market.history.push({ at: now.toISOString(), yes: chanceOf(db, market), source: "market" });
  return { side };
}

export function closeMarket(db: Db, userId: string, marketId: string, now = new Date()) {
  const { market } = requireMarket(db, userId, marketId);
  if (market.hostId !== userId) throw new AppError(403, "not_host", "Only the host can close this market.");
  if (statusOf(market, now.getTime()) !== "open") throw new AppError(409, "market_closed", "This market is already closed.");
  market.closedAt = now.toISOString();
  return { closedAt: market.closedAt };
}

// ---------- evidence ----------

export type EvidenceInput = { kind: "text" | "image"; text?: unknown; claims?: unknown; file?: string; mime?: string; app?: string };

export function postEvidence(db: Db, userId: string, marketId: string, input: EvidenceInput, now = new Date()) {
  const { market } = requireMarket(db, userId, marketId);
  const s = statusOf(market, now.getTime());
  if (s === "open") throw new AppError(409, "market_open", "Evidence opens once the market closes.");
  if (s === "settled") throw new AppError(409, "market_settled", "This market is already settled.");
  const text = str(input.text) || undefined;
  if (text && text.length > 500) throw new AppError(400, "too_long", "Keep it under 500 characters.");
  if (input.kind === "text" && !text) throw new AppError(400, "empty", "Say what happened.");
  const claims: Side | undefined = input.claims === "yes" || input.claims === "no" ? input.claims : undefined;
  const ev = { id: newId("ev"), marketId, userId, kind: input.kind, text, file: input.file, mime: input.mime, claims, app: input.app, createdAt: now.toISOString() };
  db.evidence.push(ev);
  return ev;
}

// ---------- resolution ----------

export function proposeResult(db: Db, userId: string, marketId: string, outcome: unknown, now = new Date()) {
  const { market } = requireMarket(db, userId, marketId);
  if (market.hostId !== userId) throw new AppError(403, "not_host", "Only the host can propose the result.");
  if (outcome !== "yes" && outcome !== "no" && outcome !== "void") throw new AppError(400, "bad_outcome", "Propose Yes, No, or Void.");
  if (market.receiptId) throw new AppError(409, "market_settled", "This market is already settled.");
  // A live proposal can only end by vote, dispute or the window. Re-proposing would wipe the votes.
  if (market.proposal) throw new AppError(409, "already_proposed", "There's already a result up for a vote.");
  market.closedAt ??= now.toISOString();
  const review = db.reviews.filter((r) => r.marketId === marketId).at(-1);
  market.proposal = { outcome, by: userId, at: now.toISOString(), reviewId: review?.id, votes: {} };
  if (votersOf(db, market).length === 0) settle(db, market, outcome, now);
  return { outcome };
}

export function vote(db: Db, userId: string, marketId: string, v: unknown, now = new Date()) {
  const { market } = requireMarket(db, userId, marketId);
  if (!market.proposal) throw new AppError(409, "no_proposal", "There's no proposed result to vote on.");
  if (market.hostId === userId) throw new AppError(403, "host_cannot_vote", "The host can't vote on their own proposal.");
  if (!votersOf(db, market).includes(userId)) throw new AppError(403, "not_a_voter", "Only people who traded or picked can vote.");
  if (v !== "confirm" && v !== "dispute") throw new AppError(400, "bad_vote", "Confirm or dispute.");
  market.proposal.votes[userId] = v;
  evaluate(db, market, now, false);
  return { vote: v };
}

/** Drop the proposal on a dispute majority, otherwise settle once everyone voted or the window ended. */
function evaluate(db: Db, market: Market, now: Date, windowOver: boolean) {
  const p = market.proposal!;
  const voters = votersOf(db, market);
  const disputes = voters.filter((id) => p.votes[id] === "dispute").length;
  if (disputes > voters.length / 2) {
    market.proposal = undefined;
    return;
  }
  if (windowOver || voters.every((id) => p.votes[id])) settle(db, market, p.outcome, now);
}

export function settle(db: Db, market: Market, outcome: Outcome, now: Date): Receipt {
  const group = db.groups.find((g) => g.id === market.groupId)!;
  const at = now.toISOString();
  const voided = outcome === "void";
  const results: Receipt["results"] = [];
  const row = (userId: string, kind: "payout" | "refund" | "score", amount: number) =>
    amount !== 0 && db.ledger.push({ id: newId("l"), groupId: group.id, userId, marketId: market.id, kind, amount, createdAt: at });

  if (group.mode === "tokens") {
    for (const p of positionsOf(db, market.id)) {
      if (voided) {
        row(p.userId, "refund", p.spent);
        results.push({ userId: p.userId, net: 0, payout: p.spent, points: 0, result: "even" });
      } else {
        const payout = PAYOUT * Math.max(0, p[outcome as Side]);
        row(p.userId, "payout", payout);
        const net = payout - p.spent;
        results.push({ userId: p.userId, net, payout, points: 0, result: net > 0 ? "won" : net < 0 ? "lost" : "even" });
      }
    }
  } else {
    const picks = db.picks.filter((p) => p.marketId === market.id);
    for (const p of picks) {
      if (voided) {
        results.push({ userId: p.userId, net: 0, payout: 0, points: 0, result: "even" });
        continue;
      }
      const sidePct = Math.round((picks.filter((x) => x.side === p.side).length / picks.length) * 100);
      const points = p.side === outcome ? Math.max(10, 100 - sidePct) : 0;
      row(p.userId, "score", points);
      results.push({ userId: p.userId, net: points, payout: 0, points, result: p.side === outcome ? "won" : "lost" });
    }
  }

  const mode = aiMode();
  const losers = results.filter((r) => r.result === "lost").map((r) => db.users.find((u) => u.id === r.userId)?.name ?? r.userId);
  const receipt: Receipt = {
    id: newId("r"),
    marketId: market.id,
    outcome,
    voided,
    settledAt: at,
    results,
    reviewId: market.proposal?.reviewId,
    ...(voided ? {} : roastFor(mode, losers)),
  };
  db.receipts.push(receipt);
  market.receiptId = receipt.id;
  market.proposal = undefined;
  if (!voided) {
    receipt.dareText = createDaresFor(db, market, group, receipt, now);
    if (mode === "claude") aiQueue().push({ kind: "roast", receiptId: receipt.id });
    if (market.subjectId) {
      for (const m of db.markets) {
        if (m.groupId === group.id && m.subjectId === market.subjectId && m.id !== market.id && statusOf(m, now.getTime()) === "open") {
          aiQueue().push({ kind: "odds", marketId: m.id, trigger: "history" });
        }
      }
    }
  }
  return receipt;
}

const STOCK = [
  (n: string) => `${n} talked a big game. The receipt disagrees.`,
  (n: string) => `Bold call, ${n}. Wrong, but bold.`,
  (n: string) => `${n}, the group thanks you for your donation.`,
];

/** Stock line now. In claude mode a queued task swaps in a written roast after the response. */
function roastFor(mode: string, losers: string[]): Pick<Receipt, "roast" | "roastSource"> {
  const names = losers.length ? losers.slice(0, 2).join(" and ") : "Nobody";
  if (mode === "stub") return { roast: `Test stub roast: ${names} owes the group one.`, roastSource: "stub" };
  const line = losers.length ? STOCK[names.length % STOCK.length](names) : "Everybody called it. Boring, but fair.";
  return { roast: line, roastSource: "stock" };
}

/** Time based changes: expired review windows settle and dare deadlines pass. Runs at the start of every transaction. */
export function sweep(db: Db, now: Date) {
  for (const m of db.markets) {
    if (m.proposal && !m.receiptId && now.getTime() >= Date.parse(m.proposal.at) + DISPUTE_WINDOW_MS) evaluate(db, m, now, true);
  }
  sweepDares(db, now);
}

// ---------- the Bookie's estimate ----------

/** Store an estimate. Before anyone trades (or picks), it also re-opens the market at the Bookie's chance. */
export function applyBookieEstimate(db: Db, marketId: string, est: BookieEstimate) {
  const m = db.markets.find((x) => x.id === marketId);
  if (!m || m.receiptId) return false;
  m.bookie = est;
  const untouched = m.tradeCount === 0 && !db.picks.some((p) => p.marketId === marketId);
  if (untouched && statusOf(m) === "open") {
    m.q = initialQ(est.chance);
    m.history.push({ at: est.at, yes: est.chance, source: "bookie" });
  }
  return true;
}
