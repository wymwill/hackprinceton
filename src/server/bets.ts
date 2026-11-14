import "server-only";
import { computePayouts, impliedChances, poolsByOutcome } from "@/lib/bets/payout";
import type { AppState, BetStatus, BetView, CreateBetInput, Entry, UserStats, UserView } from "@/lib/bets/types";
import { newId, type Bet, type Db } from "./store";

export class BetError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

const MAX_OUTCOMES = 6;
const MAX_DEADLINE_DAYS = 90;
const DEFAULT_GROUP = "gym-arc";

// ---------- derived values ----------

export function balanceOf(db: Db, userId: string) {
  const user = db.users.find((u) => u.id === userId);
  if (!user) return 0;
  return user.startingBalance + db.ledger.filter((r) => r.userId === userId).reduce((a, r) => a + r.amount, 0);
}

export function statusOf(bet: Bet, now = Date.now()): BetStatus {
  if (bet.receiptId) return "settled";
  return now >= Date.parse(bet.deadline) ? "closed" : "open";
}

function entriesOf(db: Db, betId: string) {
  return db.entries.filter((e) => e.betId === betId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ---------- helpers ----------

function requireUser(db: Db, userId: string) {
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new BetError(401, "unknown_user", "Pick who you are first.");
  return user;
}

function requireBet(db: Db, betId: string) {
  const bet = db.bets.find((b) => b.id === betId);
  if (!bet) throw new BetError(404, "bet_not_found", "That bet doesn't exist.");
  return bet;
}

function requireStake(db: Db, userId: string, amount: unknown) {
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1) {
    throw new BetError(400, "invalid_stake", "Stake must be a whole number of points, at least 1.");
  }
  const balance = balanceOf(db, userId);
  if (amount > balance) {
    throw new BetError(409, "insufficient_points", `You only have ${balance.toLocaleString()} pts.`);
  }
  return amount;
}

function addEntry(db: Db, bet: Bet, userId: string, outcomeId: string, amount: number, now: Date) {
  const entry: Entry = { id: newId("e"), betId: bet.id, userId, outcomeId, amount, createdAt: now.toISOString() };
  db.entries.push(entry);
  db.ledger.push({ id: newId("l"), userId, betId: bet.id, kind: "stake", amount: -amount, createdAt: entry.createdAt });
  bet.history.push(impliedChances(poolsByOutcome(bet.outcomes.map((o) => o.id), entriesOf(db, bet.id))));
  return entry;
}

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").slice(0, max) : "");

// ---------- lifecycle ----------

/** Create: proposition, outcomes, deadline, and the creator's own stake on one outcome. */
export function createBet(db: Db, userId: string, input: Partial<CreateBetInput>, now = new Date()) {
  requireUser(db, userId);

  const proposition = clean(input.proposition, 140);
  if (proposition.length < 3) throw new BetError(400, "invalid_proposition", "Say what the bet is about.");

  const labels = Array.isArray(input.outcomes) ? input.outcomes.map((o) => clean(o, 40)).filter(Boolean) : [];
  if (labels.length < 2 || labels.length > MAX_OUTCOMES) {
    throw new BetError(400, "invalid_outcomes", `A bet needs 2 to ${MAX_OUTCOMES} outcomes.`);
  }
  if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) {
    throw new BetError(400, "invalid_outcomes", "Each outcome needs a different name.");
  }

  const deadline = Date.parse(String(input.deadline));
  if (Number.isNaN(deadline) || deadline <= now.getTime()) {
    throw new BetError(400, "invalid_deadline", "The deadline has to be in the future.");
  }
  if (deadline > now.getTime() + MAX_DEADLINE_DAYS * 86_400_000) {
    throw new BetError(400, "invalid_deadline", `Keep it within ${MAX_DEADLINE_DAYS} days.`);
  }

  const pick = input.pick ?? 0;
  if (!Number.isInteger(pick) || pick < 0 || pick >= labels.length) {
    throw new BetError(400, "invalid_pick", "Pick one of the outcomes for your stake.");
  }
  const stake = requireStake(db, userId, input.stake);

  const bet: Bet = {
    id: newId("b"),
    groupId: DEFAULT_GROUP,
    proposition,
    emoji: clean(input.emoji, 8) || "🎲",
    category: clean(input.category, 24) || "Other",
    dare: clean(input.dare, 80) || undefined,
    outcomes: labels.map((label, i) => ({ id: `o${i + 1}`, label })),
    creatorId: userId,
    createdAt: now.toISOString(),
    deadline: new Date(deadline).toISOString(),
    history: [],
  };
  bet.history.push(impliedChances(bet.outcomes.map(() => 0)));
  db.bets.push(bet);
  addEntry(db, bet, userId, bet.outcomes[pick].id, stake, now);
  return bet;
}

/** Join: pick an outcome and commit points. One entry per person per bet. */
export function joinBet(db: Db, userId: string, betId: string, outcomeId: unknown, amount: unknown, now = new Date()) {
  requireUser(db, userId);
  const bet = requireBet(db, betId);
  const status = statusOf(bet, now.getTime());
  if (status !== "open") {
    throw new BetError(409, "bet_closed", status === "settled" ? "This bet is already settled." : "Entries closed at the deadline.");
  }
  if (!bet.outcomes.some((o) => o.id === outcomeId)) throw new BetError(400, "invalid_outcome", "Pick one of the outcomes.");
  if (db.entries.some((e) => e.betId === betId && e.userId === userId)) {
    throw new BetError(409, "already_joined", "You're already in this bet.");
  }
  const stake = requireStake(db, userId, amount);
  return addEntry(db, bet, userId, outcomeId as string, stake, now);
}

/** Close early: the creator can stop new entries before the deadline. */
export function closeBet(db: Db, userId: string, betId: string, now = new Date()) {
  const bet = requireBet(db, betId);
  if (bet.creatorId !== userId) throw new BetError(403, "not_creator", "Only the person who made this bet can close it.");
  if (statusOf(bet, now.getTime()) === "open") bet.deadline = now.toISOString();
  return bet;
}

/**
 * Settle: the creator records the winning outcome once entries are closed.
 *
 * Safe to retry. Settling again with the same outcome returns the original
 * receipt and moves no points. Settling again with a different outcome is
 * rejected. As a second guard, the ledger is checked for existing payouts on
 * this bet before any are written.
 */
export function settleBet(db: Db, userId: string, betId: string, outcomeId: unknown, now = new Date()) {
  const bet = requireBet(db, betId);
  if (bet.creatorId !== userId) throw new BetError(403, "not_creator", "Only the person who made this bet can settle it.");

  if (bet.receiptId) {
    const receipt = db.receipts.find((r) => r.id === bet.receiptId)!;
    if (receipt.outcomeId !== outcomeId) {
      throw new BetError(409, "already_settled", "This bet was already settled with a different result.");
    }
    return { receipt, alreadySettled: true };
  }
  if (statusOf(bet, now.getTime()) === "open") {
    throw new BetError(409, "bet_open", "Close the bet before settling it.");
  }
  if (!bet.outcomes.some((o) => o.id === outcomeId)) throw new BetError(400, "invalid_outcome", "Pick the outcome that happened.");
  if (db.ledger.some((r) => r.betId === betId && r.kind !== "stake")) {
    throw new BetError(409, "already_paid", "Points for this bet were already paid out.");
  }

  const result = computePayouts(entriesOf(db, betId), outcomeId as string);
  const settledAt = now.toISOString();
  for (const p of result.payouts) {
    if (p.payout > 0) {
      db.ledger.push({
        id: newId("l"),
        userId: p.userId,
        betId,
        kind: result.refunded ? "refund" : "payout",
        amount: p.payout,
        createdAt: settledAt,
      });
    }
  }
  const receipt = { id: newId("r"), betId, outcomeId: outcomeId as string, settledBy: userId, settledAt, ...result };
  db.receipts.push(receipt);
  bet.receiptId = receipt.id;
  return { receipt, alreadySettled: false };
}

// ---------- views ----------

function betView(db: Db, bet: Bet, now: number): BetView {
  const entries = entriesOf(db, bet.id);
  const pools = poolsByOutcome(bet.outcomes.map((o) => o.id), entries);
  const chances = impliedChances(pools);
  return {
    id: bet.id,
    groupId: bet.groupId,
    proposition: bet.proposition,
    emoji: bet.emoji,
    category: bet.category,
    dare: bet.dare,
    creatorId: bet.creatorId,
    createdAt: bet.createdAt,
    deadline: bet.deadline,
    status: statusOf(bet, now),
    pool: pools.reduce((a, b) => a + b, 0),
    outcomes: bet.outcomes.map((o, i) => ({
      ...o,
      pool: pools[i],
      chance: chances[i],
      backers: entries.filter((e) => e.outcomeId === o.id).length,
    })),
    entries,
    history: bet.history,
    receipt: db.receipts.find((r) => r.id === bet.receiptId),
  };
}

function statsOf(db: Db, userId: string, now: number): UserStats {
  const results = db.receipts
    .flatMap((r) => r.payouts.filter((p) => p.userId === userId).map((p) => ({ ...p, at: r.settledAt, refunded: r.refunded })))
    .filter((p) => !p.refunded)
    .sort((a, b) => a.at.localeCompare(b.at));
  let streak = 0;
  for (const p of results) {
    const won = p.net >= 0;
    streak = won ? (streak > 0 ? streak + 1 : 1) : streak < 0 ? streak - 1 : -1;
  }
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
  return {
    settled: results.length,
    wins: results.filter((p) => p.net >= 0).length,
    losses: results.filter((p) => p.net < 0).length,
    net: results.reduce((a, p) => a + p.net, 0),
    netWeek: results.filter((p) => p.at >= weekAgo).reduce((a, p) => a + p.net, 0),
    streak,
  };
}

export function snapshot(db: Db, me: string, now = Date.now()): AppState {
  const unsettled = new Set(db.bets.filter((b) => !b.receiptId).map((b) => b.id));
  const users: UserView[] = db.users.map((u) => ({
    id: u.id,
    name: u.name,
    title: u.title,
    avatar: u.avatar,
    balance: balanceOf(db, u.id),
    atRisk: db.entries.filter((e) => e.userId === u.id && unsettled.has(e.betId)).reduce((a, e) => a + e.amount, 0),
    stats: statsOf(db, u.id, now),
  }));
  const bets = db.bets.map((b) => betView(db, b, now)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { me, users, bets, serverTime: new Date(now).toISOString() };
}
