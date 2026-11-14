import "server-only";
import { baselineEstimate, type SettledRecord } from "@/lib/bets/odds";
import { computePayouts, impliedChances, poolsByOutcome } from "@/lib/bets/payout";
import type {
  AppState,
  AuditEntry,
  BetStatus,
  BetView,
  CreateBetInput,
  Entry,
  Evidence,
  OddsEstimate,
  UserStats,
  UserView,
} from "@/lib/bets/types";
import { aiStatus } from "./ai/config";
import { newId, type Bet, type Db, type StoredEvidence } from "./store";

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

export function audit(db: Db, betId: string, actor: string, type: AuditEntry["type"], detail: string, at: Date, refs?: string[]) {
  db.audit.push({ id: newId("a"), betId, at: at.toISOString(), actor, type, detail, refs });
}

/** Every settled bet, reduced to what the odds model reads. */
export function settledRecords(db: Db): SettledRecord[] {
  return db.bets.flatMap((b) => {
    const r = b.receiptId && db.receipts.find((x) => x.id === b.receiptId);
    if (!r) return [];
    return [
      {
        betId: b.id,
        category: b.category,
        subjectId: b.subjectId,
        outcomes: b.outcomes.map((o) => o.label),
        winningIndex: b.outcomes.findIndex((o) => o.id === r.outcomeId),
        settledAt: r.settledAt,
        refunded: r.refunded,
      },
    ];
  });
}

/** The stats-only estimate for a bet, from the history stored right now. */
export function statsEstimate(db: Db, bet: Bet, trigger: OddsEstimate["trigger"], now: Date): OddsEstimate {
  const base = baselineEstimate({
    outcomes: bet.outcomes,
    category: bet.category,
    subjectId: bet.subjectId,
    subjectName: db.users.find((u) => u.id === bet.subjectId)?.name,
    history: settledRecords(db).filter((r) => r.betId !== bet.id),
  });
  return { id: newId("o"), at: now.toISOString(), source: "stats", trigger, citedEvidenceIds: [], ...base };
}

/** Record an estimate on the bet and in the audit trail. */
export function addEstimate(db: Db, bet: Bet, est: OddsEstimate) {
  bet.odds.push(est);
  const first = bet.outcomes[0];
  const p = est.probabilities.find((x) => x.outcomeId === first.id)?.p ?? 0;
  audit(
    db,
    bet.id,
    est.source === "claude" ? "ai" : "system",
    "odds_estimated",
    `${est.source === "claude" ? `Claude (${est.model})` : "Stats"} estimate, ${est.trigger}: ${Math.round(p * 100)}% ${first.label}, ${est.uncertainty} uncertainty.`,
    new Date(est.at),
    [est.id, ...est.citedEvidenceIds]
  );
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
  const label = bet.outcomes.find((o) => o.id === outcomeId)!.label;
  audit(db, bet.id, userId, "entry_joined", `Staked ${amount} pts on ${label}.`, now, [entry.id]);
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
  const subjectId = input.subjectId || undefined;
  if (subjectId && !db.users.some((u) => u.id === subjectId)) {
    throw new BetError(400, "invalid_subject", "Pick someone in the group, or no one.");
  }

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
    subjectId,
    odds: [],
  };
  bet.history.push(impliedChances(bet.outcomes.map(() => 0)));
  db.bets.push(bet);
  audit(db, bet.id, userId, "bet_created", `Created with ${bet.outcomes.length} outcomes, closing ${bet.deadline}.`, now);
  addEntry(db, bet, userId, bet.outcomes[pick].id, stake, now);
  addEstimate(db, bet, statsEstimate(db, bet, "created", now));
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
  if (statusOf(bet, now.getTime()) === "open") {
    bet.deadline = now.toISOString();
    audit(db, bet.id, userId, "entries_closed", "Closed entries early.", now);
  }
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
export function settleBet(
  db: Db,
  userId: string,
  betId: string,
  outcomeId: unknown,
  now = new Date(),
  opts: { reviewId?: string; note?: string } = {}
) {
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
  const note = clean(opts.note, 280) || undefined;
  const receipt = { id: newId("r"), betId, outcomeId: outcomeId as string, settledBy: userId, settledAt, ...result, reviewId: opts.reviewId, note };
  db.receipts.push(receipt);
  bet.receiptId = receipt.id;

  const label = bet.outcomes.find((o) => o.id === outcomeId)!.label;
  const latest = latestReview(db, betId);
  const how = opts.reviewId
    ? "by confirming the AI recommendation"
    : latest?.status === "recommended" && latest.outcomeId !== outcomeId
      ? "manually, overriding the AI recommendation"
      : "manually";
  audit(db, betId, userId, "settled", `Settled as ${label} ${how}. Paid ${result.pool} pts.${note ? ` Note: ${note}` : ""}`, now, [receipt.id]);

  // New history: refresh the stats estimate on open bets about the same person.
  if (bet.subjectId) {
    for (const other of db.bets) {
      if (other.subjectId === bet.subjectId && other.id !== betId && statusOf(other, now.getTime()) === "open") {
        addEstimate(db, other, statsEstimate(db, other, "history", now));
      }
    }
  }
  return { receipt, alreadySettled: false };
}

// ---------- evidence and AI review ----------

const MAX_EVIDENCE = 20;

export const latestReview = (db: Db, betId: string) => db.reviews.filter((r) => r.betId === betId).at(-1);

/** Creator or anyone with a stake in the bet. */
export function requireInvolved(db: Db, userId: string, betId: string) {
  requireUser(db, userId);
  const bet = requireBet(db, betId);
  if (bet.creatorId !== userId && !db.entries.some((e) => e.betId === betId && e.userId === userId)) {
    throw new BetError(403, "not_participant", "Only people in this bet can do that.");
  }
  return bet;
}

export type EvidenceInput = { kind: "text" | "link" | "image"; text?: unknown; url?: unknown; claimsOutcomeId?: unknown; file?: string; mime?: string };

/** Submit evidence. Allowed until the bet is settled, for anyone in it. */
export function addEvidence(db: Db, userId: string, betId: string, input: EvidenceInput, now = new Date()) {
  const bet = requireInvolved(db, userId, betId);
  if (statusOf(bet, now.getTime()) === "settled") throw new BetError(409, "bet_settled", "This bet is already settled.");
  if (db.evidence.filter((e) => e.betId === betId).length >= MAX_EVIDENCE) {
    throw new BetError(409, "too_much_evidence", `A bet can hold up to ${MAX_EVIDENCE} pieces of evidence.`);
  }
  const text = clean(input.text, 1000) || undefined;
  let url: string | undefined;
  if (input.kind === "link") {
    try {
      const u = new URL(String(input.url ?? ""));
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
      url = u.toString();
    } catch {
      throw new BetError(400, "invalid_link", "Links need to start with http:// or https://.");
    }
  } else if (input.kind === "text") {
    if (!text) throw new BetError(400, "empty_evidence", "Write what happened.");
  } else if (input.kind === "image") {
    if (!input.file) throw new BetError(400, "missing_image", "Attach an image.");
  } else {
    throw new BetError(400, "invalid_kind", "Evidence must be text, a link, or an image.");
  }
  const claims = input.claimsOutcomeId ? String(input.claimsOutcomeId) : undefined;
  if (claims && !bet.outcomes.some((o) => o.id === claims)) throw new BetError(400, "invalid_outcome", "Pick one of the outcomes.");

  const ev: StoredEvidence = {
    id: newId("ev"),
    betId,
    userId,
    kind: input.kind,
    text,
    url,
    file: input.file,
    mime: input.mime,
    claimsOutcomeId: claims,
    createdAt: now.toISOString(),
  };
  db.evidence.push(ev);
  const said = claims ? ` supporting ${bet.outcomes.find((o) => o.id === claims)!.label}` : "";
  audit(db, betId, userId, "evidence_submitted", `Submitted ${input.kind} evidence${said}.`, now, [ev.id]);
  return ev;
}

/**
 * The authorized human (the bet's creator) confirms or rejects an AI review.
 * Confirming settles through `settleBet`, so payouts keep the same once-only
 * guarantees. A review without a recommended outcome can't be confirmed.
 */
export function decideReview(db: Db, userId: string, betId: string, reviewId: unknown, action: unknown, noteIn: unknown, now = new Date()) {
  const bet = requireBet(db, betId);
  if (bet.creatorId !== userId) throw new BetError(403, "not_creator", "Only the person who made this bet can decide.");
  const review = db.reviews.find((r) => r.id === reviewId && r.betId === betId);
  if (!review) throw new BetError(404, "review_not_found", "That review doesn't exist.");
  if (action !== "confirm" && action !== "reject") throw new BetError(400, "invalid_action", "Confirm or reject.");
  const note = clean(noteIn, 280) || undefined;

  if (review.decision) {
    const same = (review.decision.action === "confirmed") === (action === "confirm");
    if (!same) throw new BetError(409, "already_decided", `This recommendation was already ${review.decision.action}.`);
    if (action === "confirm") return { review, ...settleBet(db, userId, betId, review.outcomeId, now, { reviewId: review.id }) };
    return { review, receipt: undefined, alreadySettled: false };
  }

  if (action === "reject") {
    if (bet.receiptId) throw new BetError(409, "already_settled", "This bet is already settled.");
    if (!note) throw new BetError(400, "note_required", "Say why you're rejecting it, so the group can see.");
    review.decision = { action: "rejected", by: userId, at: now.toISOString(), note };
    audit(db, betId, userId, "recommendation_rejected", `Rejected the AI review. Note: ${note}`, now, [review.id]);
    return { review, receipt: undefined, alreadySettled: false };
  }

  if (review.status !== "recommended" || !review.outcomeId) {
    throw new BetError(409, "needs_human_review", "The AI didn't recommend an outcome here. Settle it yourself instead.");
  }
  if (review !== latestReview(db, betId)) throw new BetError(409, "stale_review", "There's a newer review. Use that one.");
  const unseen = db.evidence.filter((e) => e.betId === betId && !review.evidenceSeen.includes(e.id));
  if (unseen.length) throw new BetError(409, "stale_review", "New evidence arrived after this review. Ask the Bookie to review again.");
  const settled = settleBet(db, userId, betId, review.outcomeId, now, { reviewId: review.id, note });
  if (!settled.alreadySettled) {
    review.decision = { action: "confirmed", by: userId, at: now.toISOString(), note };
    const label = bet.outcomes.find((o) => o.id === review.outcomeId)!.label;
    audit(db, betId, userId, "recommendation_confirmed", `Confirmed the AI recommendation: ${label}.`, now, [review.id]);
  }
  return { review, ...settled };
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
    subjectId: bet.subjectId,
    odds: bet.odds.at(-1),
    oddsHistory: bet.odds,
    evidence: db.evidence.filter((e) => e.betId === bet.id).map(publicEvidence),
    reviews: db.reviews.filter((r) => r.betId === bet.id),
    audit: db.audit.filter((a) => a.betId === bet.id),
  };
}

const publicEvidence = ({ file, mime, ...e }: StoredEvidence): Evidence => ({
  ...e,
  imageUrl: file && mime ? `/api/evidence/${e.id}` : undefined,
});

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
  return { me, users, bets, serverTime: new Date(now).toISOString(), ai: aiStatus() };
}
