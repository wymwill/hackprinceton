import "server-only";
import type { OddsEstimate, Outcome, Review, ReviewIssue } from "@/lib/bets/types";
import { BetError, addEstimate, audit, requireInvolved, statsEstimate, statusOf } from "../bets";
import { newId, read, transact, type Db, type StoredEvidence } from "../store";
import { AiUnavailable, estimateOdds, reviewEvidence } from "./claude";
import { aiMode } from "./config";

/**
 * Orchestrates the AI Bookie around the bet lifecycle.
 *
 * Model calls take seconds, so they never run inside the database lock:
 * read a snapshot, call the model, validate the answer, then write it in a
 * short transaction. The AI only ever records estimates and recommendations.
 * Settlement still goes through `settleBet`, triggered by a human.
 */

const MIN_CONFIDENCE = 0.75;

type Who = { id: string; name: string };

function context(db: Db, betId: string) {
  const bet = db.bets.find((b) => b.id === betId);
  if (!bet) throw new BetError(404, "bet_not_found", "That bet doesn't exist.");
  const users: Who[] = db.users.map((u) => ({ id: u.id, name: u.name }));
  const stakes = new Map<string, string>();
  for (const e of db.entries.filter((x) => x.betId === betId)) {
    stakes.set(e.userId, `${e.amount} pts on ${bet.outcomes.find((o) => o.id === e.outcomeId)?.label}`);
  }
  const evidence = db.evidence.filter((e) => e.betId === betId);
  return { bet: structuredClone(bet), users, stakes, evidence: structuredClone(evidence) };
}

// ---------- odds ----------

/** Normalize model percentages onto our outcome ids; fall back to the baseline for anything missing. */
function normalize(outcomes: Outcome[], raw: { outcome_id: string; percent: number }[], baseline: { outcomeId: string; p: number }[]) {
  const vals = outcomes.map((o) => {
    const r = raw.find((x) => x.outcome_id === o.id);
    const v = r && Number.isFinite(r.percent) ? r.percent / 100 : (baseline.find((b) => b.outcomeId === o.id)?.p ?? 0);
    return Math.min(0.99, Math.max(0.01, v));
  });
  const total = vals.reduce((a, b) => a + b, 0);
  return outcomes.map((o, i) => ({ outcomeId: o.id, p: vals[i] / total }));
}

/**
 * Refresh a bet's odds. With Claude on, the model reads the stored-history facts,
 * the stats baseline, and any evidence so far. With it off, only `manual`
 * refreshes do anything (history changes are handled at settlement).
 */
export async function refreshOdds(betId: string, trigger: OddsEstimate["trigger"]): Promise<OddsEstimate | null> {
  if (aiMode() !== "claude") {
    if (trigger !== "manual") return null;
    return transact((db) => {
      const bet = db.bets.find((b) => b.id === betId);
      if (!bet) throw new BetError(404, "bet_not_found", "That bet doesn't exist.");
      if (bet.receiptId) throw new BetError(409, "bet_settled", "This bet is already settled.");
      const est = statsEstimate(db, bet, "manual", new Date());
      addEstimate(db, bet, est);
      return est;
    });
  }

  const { ctx, base } = await read((db) => {
    const ctx = context(db, betId);
    const live = db.bets.find((b) => b.id === betId)!;
    if (live.receiptId) throw new BetError(409, "bet_settled", "This bet is already settled.");
    return { ctx, base: statsEstimate(db, live, trigger, new Date()) };
  });

  let est: OddsEstimate;
  try {
    const { output, model } = await estimateOdds({
      proposition: ctx.bet.proposition,
      category: ctx.bet.category,
      outcomes: ctx.bet.outcomes,
      subject: ctx.users.find((u) => u.id === ctx.bet.subjectId)?.name,
      facts: base.facts,
      baseline: base.probabilities,
      evidence: ctx.evidence,
      users: ctx.users,
      stakes: ctx.stakes,
    });
    const factIds = new Set(base.facts.map((f) => f.id));
    const evIds = new Set(ctx.evidence.map((e) => e.id));
    est = {
      ...base,
      id: newId("o"),
      source: "claude",
      model,
      probabilities: normalize(ctx.bet.outcomes, output.probabilities, base.probabilities),
      uncertainty: output.uncertainty,
      explanation: output.explanation.trim().slice(0, 600),
      // The model may only point at facts we computed and evidence that exists.
      citedFactIds: output.cited_fact_ids.filter((id) => factIds.has(id)),
      citedEvidenceIds: output.cited_evidence_ids.filter((id) => evIds.has(id)),
    };
  } catch (err) {
    if (!(err instanceof AiUnavailable)) throw err;
    console.warn(`[bookie] odds for ${betId} fell back to stats: ${err.message}`);
    est = { ...base, fallbackReason: err.message };
  }

  return transact((db) => {
    const bet = db.bets.find((b) => b.id === betId);
    if (!bet || bet.receiptId) return null;
    // Keep the stats baseline next to the model's number so both stay visible.
    if (est.source === "claude") addEstimate(db, bet, { ...base, id: newId("o") });
    addEstimate(db, bet, est);
    return est;
  });
}

// ---------- evidence review ----------

/** No model: describe what was submitted and flag it for a human. Never recommends. */
function rulesReview(outcomes: Outcome[], evidence: StoredEvidence[], entriesByUser: Map<string, string>, why: string) {
  const issues: ReviewIssue[] = [];
  if (!evidence.length) issues.push({ type: "missing", detail: "Nobody has submitted evidence yet.", evidenceIds: [] });
  const claimed = new Set(evidence.map((e) => e.claimsOutcomeId).filter(Boolean));
  if (claimed.size > 1) {
    issues.push({
      type: "contradictory",
      detail: `Evidence points to different outcomes: ${[...claimed].map((id) => outcomes.find((o) => o.id === id)?.label).join(" vs ")}.`,
      evidenceIds: evidence.filter((e) => e.claimsOutcomeId).map((e) => e.id),
    });
  }
  const self = evidence.filter((e) => e.claimsOutcomeId && entriesByUser.get(e.userId) === e.claimsOutcomeId);
  if (self.length) {
    issues.push({ type: "self_interested", detail: "Some evidence backs the outcome its submitter staked on.", evidenceIds: self.map((e) => e.id) });
  }
  const unseen = evidence.filter((e) => e.kind !== "text");
  if (unseen.length) {
    issues.push({ type: "unverifiable", detail: "Links and images weren't checked by an AI. Open them yourself.", evidenceIds: unseen.map((e) => e.id) });
  }
  const counts = outcomes.map((o) => `${o.label}: ${evidence.filter((e) => e.claimsOutcomeId === o.id).length}`).join(", ");
  return {
    status: "needs_review" as const,
    explanation: `${why} ${evidence.length} piece${evidence.length === 1 ? "" : "s"} of evidence submitted (claims by outcome: ${counts}). A human needs to decide.`,
    evidenceUsed: [],
    issues,
  };
}

/** Deterministic stand-in for tests (BOOKIE_AI=stub): recommends only when 2+ items agree and none disagree. */
function stubReview(evidence: StoredEvidence[]) {
  const claims = evidence.filter((e) => e.claimsOutcomeId);
  const ids = new Set(claims.map((e) => e.claimsOutcomeId));
  if (claims.length >= 2 && ids.size === 1) {
    return {
      status: "recommended" as const,
      outcomeId: claims[0].claimsOutcomeId,
      confidence: 0.9,
      explanation: `Test stub: ${claims.length} pieces of evidence agree and none disagree.`,
      evidenceUsed: claims.map((e) => ({ evidenceId: e.id, how: "Claims this outcome." })),
      issues: [] as ReviewIssue[],
    };
  }
  return {
    status: "needs_review" as const,
    explanation: "Test stub: evidence is missing or disagrees.",
    evidenceUsed: [],
    issues: [{ type: ids.size > 1 ? "contradictory" : "missing", detail: "Not enough agreeing evidence.", evidenceIds: claims.map((e) => e.id) }] as ReviewIssue[],
  };
}

const running = new Set<string>();

/** Ask the AI Bookie to review a closed bet's evidence. Records a recommendation; never settles. */
export async function reviewBet(betId: string, userId: string): Promise<Review> {
  if (running.has(betId)) throw new BetError(409, "review_running", "A review is already running for this bet.");
  running.add(betId);
  try {
    const ctx = await read((db) => {
      const bet = requireInvolved(db, userId, betId);
      const s = statusOf(bet);
      if (s === "open") throw new BetError(409, "bet_open", "Entries are still open. Close the bet before reviewing evidence.");
      if (s === "settled") throw new BetError(409, "bet_settled", "This bet is already settled.");
      const c = context(db, betId);
      const entriesByUser = new Map(db.entries.filter((e) => e.betId === betId).map((e) => [e.userId, e.outcomeId]));
      return { ...c, entriesByUser };
    });
    const { bet, evidence, stakes, users, entriesByUser } = ctx;
    const mode = aiMode();

    let result: Omit<Review, "id" | "betId" | "requestedBy" | "at" | "evidenceSeen">;
    if (mode === "stub") {
      result = { source: "test-stub", ...stubReview(evidence) };
    } else if (mode === "off" || evidence.length === 0) {
      const why = evidence.length === 0 ? "There's nothing to review yet." : "AI review is off (no Anthropic API key), so nothing was judged.";
      const r = rulesReview(bet.outcomes, evidence, entriesByUser, why);
      result = { source: "rules", status: r.status, explanation: r.explanation, evidenceUsed: [], issues: r.issues };
    } else {
      try {
        const { output, model } = await reviewEvidence({ proposition: bet.proposition, outcomes: bet.outcomes, deadline: bet.deadline, evidence, users, stakes });
        const evIds = new Set(evidence.map((e) => e.id));
        const used = output.evidence_used.filter((u) => evIds.has(u.evidence_id)).map((u) => ({ evidenceId: u.evidence_id, how: u.how.slice(0, 300) }));
        const issues: ReviewIssue[] = output.issues.map((i) => ({ type: i.type, detail: i.detail.slice(0, 300), evidenceIds: i.evidence_ids.filter((id) => evIds.has(id)) }));
        const outcome = bet.outcomes.find((o) => o.id === output.outcome_id);
        const confidence = Math.min(1, Math.max(0, Number(output.confidence) || 0));

        // The server, not the model, decides whether this counts as a recommendation.
        const blockers: string[] = [];
        if (output.verdict !== "recommend") blockers.push("the AI called it inconclusive");
        if (!outcome) blockers.push("no valid outcome was named");
        if (confidence < MIN_CONFIDENCE) blockers.push(`confidence ${Math.round(confidence * 100)}% is below ${MIN_CONFIDENCE * 100}%`);
        if (!used.length) blockers.push("no evidence was cited");
        if (issues.some((i) => i.type === "contradictory")) blockers.push("evidence contradicts itself");
        const recommended = blockers.length === 0;
        if (!recommended && output.verdict === "recommend") {
          issues.push({ type: "inconclusive", detail: `Flagged for human review: ${blockers.join("; ")}.`, evidenceIds: [] });
        }
        result = {
          source: "claude",
          model,
          status: recommended ? "recommended" : "needs_review",
          outcomeId: recommended ? outcome!.id : undefined,
          confidence,
          explanation: output.explanation.trim().slice(0, 1200),
          evidenceUsed: used,
          issues,
        };
      } catch (err) {
        if (!(err instanceof AiUnavailable)) throw err;
        const r = rulesReview(bet.outcomes, evidence, entriesByUser, `The AI review failed (${err.message}).`);
        result = { source: "rules", status: r.status, explanation: r.explanation, evidenceUsed: [], issues: r.issues };
      }
    }

    return await transact((db) => {
      const live = db.bets.find((b) => b.id === betId)!;
      if (live.receiptId) throw new BetError(409, "bet_settled", "This bet was settled while the review ran.");
      const now = new Date();
      const review: Review = { id: newId("rv"), betId, requestedBy: userId, at: now.toISOString(), evidenceSeen: evidence.map((e) => e.id), ...result };
      db.reviews.push(review);
      const label = review.outcomeId ? live.outcomes.find((o) => o.id === review.outcomeId)?.label : undefined;
      audit(
        db,
        betId,
        review.source === "claude" ? "ai" : "system",
        "review_completed",
        review.status === "recommended"
          ? `Recommended ${label} (${Math.round((review.confidence ?? 0) * 100)}% confidence) from ${review.evidenceUsed.length} pieces of evidence. Waiting for a human to confirm.`
          : `Flagged for human review (${review.source}): ${review.issues.map((i) => i.type).join(", ") || "no recommendation"}.`,
        now,
        [review.id, ...review.evidenceSeen]
      );
      return review;
    });
  } finally {
    running.delete(betId);
  }
}
