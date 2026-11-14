import "server-only";
import { baselineEstimate } from "@/lib/markets/baseline";
import type { AiSource, BookieEstimate, Outcome, Review, ReviewIssue } from "@/lib/markets/types";
import { AppError } from "../errors";
import { requireMember } from "../groups";
import { aiQueue, applyBookieEstimate, positionsOf, requireMarket, settledRecords, statusOf } from "../markets";
import { newId, read, transact, type Db, type StoredEvidence } from "../store";
import { AiUnavailable, estimateOdds, reviewEvidence, suggestDare, writeRoast } from "./claude";
import { aiMode } from "./config";

/**
 * The Bookie around the market lifecycle. Model calls take seconds, so they
 * never run inside the database lock: read a snapshot, call the model,
 * validate, then write in a short transaction. The Bookie only records
 * estimates, recommendations, roasts and dare ideas. People settle markets.
 */

const MIN_CONFIDENCE = 0.75;

function log(db: Db, groupId: string, marketId: string | undefined, kind: "odds" | "review" | "roast" | "dare", source: AiSource, summary: string, model?: string, facts?: string[]) {
  db.aiLog.push({ id: newId("ai"), groupId, marketId, at: new Date().toISOString(), kind, source, model, summary, facts });
}

// ---------- odds ----------

export async function refreshOdds(marketId: string, trigger: string): Promise<BookieEstimate | null> {
  const ctx = await read((db) => {
    const m = db.markets.find((x) => x.id === marketId);
    if (!m || m.receiptId) return null;
    const subject = m.subjectId ? db.users.find((u) => u.id === m.subjectId)?.name : undefined;
    const base = baselineEstimate({ category: m.category, subjectId: m.subjectId, subjectName: subject, history: settledRecords(db, m.groupId) });
    return { question: m.question, rule: m.rule, category: m.category, subject, base, groupId: m.groupId };
  });
  if (!ctx) return null;
  const { base } = ctx;
  const at = new Date().toISOString();
  const mode = aiMode();
  let est: BookieEstimate;

  if (mode === "claude") {
    try {
      const { output, model } = await estimateOdds({ question: ctx.question, rule: ctx.rule, category: ctx.category, subject: ctx.subject, facts: base.facts, baseline: base.chance });
      const ids = new Set(base.facts.map((f) => f.id));
      const cited = output.cited_fact_ids.filter((id) => ids.has(id));
      const chance = Math.round(Math.min(95, Math.max(5, output.chance)));
      const lo = Math.round(Math.min(chance, Math.max(1, output.range_low)));
      const hi = Math.round(Math.max(chance, Math.min(99, output.range_high)));
      est = {
        chance,
        range: [lo, hi],
        uncertainty: output.uncertainty,
        explanation: output.explanation.trim().slice(0, 300),
        facts: cited.length ? base.facts.filter((f) => cited.includes(f.id)) : base.facts,
        source: "claude",
        model,
        at,
      };
    } catch (err) {
      if (!(err instanceof AiUnavailable)) throw err;
      console.warn(`[bookie] odds for ${marketId} fell back to the baseline: ${err.message}`);
      est = { ...base, source: "baseline", at, fallbackReason: err.message };
    }
  } else if (mode === "stub") {
    est = { ...base, explanation: `Test stub: ${base.explanation}`, source: "stub", at };
  } else {
    est = { ...base, source: "baseline", at };
  }

  return transact((db) => {
    if (!applyBookieEstimate(db, marketId, est)) return null;
    log(db, ctx.groupId, marketId, "odds", est.source, `${trigger === "created" ? "Opening line" : "Re-check"}: ${est.chance}% Yes. ${est.explanation}`, est.model, est.facts.map((f) => f.text));
    return est;
  });
}

// ---------- evidence review ----------

function rulesReview(evidence: StoredEvidence[], why: string) {
  const issues: ReviewIssue[] = [];
  if (!evidence.length) issues.push({ type: "missing", detail: "Nobody has posted evidence yet.", evidenceIds: [] });
  const claims = new Set(evidence.map((e) => e.claims).filter(Boolean));
  if (claims.size > 1) issues.push({ type: "contradictory", detail: "Evidence points both ways.", evidenceIds: evidence.filter((e) => e.claims).map((e) => e.id) });
  const yes = evidence.filter((e) => e.claims === "yes").length;
  const no = evidence.filter((e) => e.claims === "no").length;
  return { explanation: `${why} ${evidence.length} item${evidence.length === 1 ? "" : "s"} posted (${yes} say Yes, ${no} say No). The host decides.`, issues };
}

function stubReview(evidence: StoredEvidence[]) {
  const claims = evidence.filter((e) => e.claims);
  const sides = new Set(claims.map((e) => e.claims));
  if (claims.length >= 2 && sides.size === 1) {
    return {
      status: "recommended" as const,
      outcome: claims[0].claims as Outcome,
      confidence: 0.9,
      explanation: `Test stub: ${claims.length} items agree and none disagree.`,
      evidenceUsed: claims.map((e) => ({ evidenceId: e.id, how: "Says this happened." })),
      issues: [] as ReviewIssue[],
    };
  }
  return {
    status: "needs_human" as const,
    explanation: "Test stub: evidence is missing or disagrees.",
    evidenceUsed: [],
    issues: [{ type: sides.size > 1 ? "contradictory" : "missing", detail: "Not enough agreeing evidence.", evidenceIds: claims.map((e) => e.id) }] as ReviewIssue[],
  };
}

const running = new Set<string>();

/** Ask the Bookie to review a closed market's evidence. Records a recommendation. Never settles. */
export async function requestReview(marketId: string, userId: string): Promise<Review> {
  if (running.has(marketId)) throw new AppError(409, "review_running", "The Bookie is already looking at this one.");
  running.add(marketId);
  try {
    const ctx = await read((db) => {
      const { market } = requireMarket(db, userId, marketId);
      const s = statusOf(market);
      if (s === "open") throw new AppError(409, "market_open", "Close the market before asking the Bookie.");
      if (s === "settled") throw new AppError(409, "market_settled", "This market is already settled.");
      const users = db.users.map((u) => ({ id: u.id, name: u.name }));
      const stakes = new Map<string, string>();
      for (const p of positionsOf(db, marketId)) stakes.set(p.userId, `${p.yes} Yes and ${p.no} No contracts`);
      for (const p of db.picks.filter((x) => x.marketId === marketId)) stakes.set(p.userId, `picked ${p.side.toUpperCase()}`);
      return { market: structuredClone(market), users, stakes, evidence: structuredClone(db.evidence.filter((e) => e.marketId === marketId && !e.dareProof)) };
    });
    const { market, evidence } = ctx;
    const mode = aiMode();
    let result: Omit<Review, "id" | "marketId" | "requestedBy" | "at" | "evidenceSeen">;

    if (mode === "stub") {
      result = { source: "stub", ...stubReview(evidence) };
    } else if (mode === "off" || evidence.length === 0) {
      const r = rulesReview(evidence, evidence.length ? "The Bookie's AI is off, so nothing was judged." : "There's nothing to review yet.");
      result = { source: "rules", status: "needs_human", evidenceUsed: [], ...r };
    } else {
      try {
        const { output, model } = await reviewEvidence({ question: market.question, rule: market.rule, deadline: market.closedAt ?? market.deadline, evidence, users: ctx.users, stakes: ctx.stakes });
        const ids = new Set(evidence.map((e) => e.id));
        const used = output.evidence_used.filter((u) => ids.has(u.evidence_id)).map((u) => ({ evidenceId: u.evidence_id, how: u.how.slice(0, 300) }));
        const issues: ReviewIssue[] = output.issues.map((i) => ({ type: i.type, detail: i.detail.slice(0, 300), evidenceIds: i.evidence_ids.filter((id) => ids.has(id)) }));
        const confidence = Math.min(1, Math.max(0, Number(output.confidence) || 0));
        // The server, not the model, decides whether this counts as a recommendation.
        const ok = output.verdict === "recommend" && output.outcome && confidence >= MIN_CONFIDENCE && used.length > 0 && !issues.some((i) => i.type === "contradictory");
        result = {
          source: "claude",
          model,
          status: ok ? "recommended" : "needs_human",
          outcome: ok ? output.outcome! : undefined,
          confidence,
          explanation: output.explanation.trim().slice(0, 600),
          evidenceUsed: used,
          issues,
        };
      } catch (err) {
        if (!(err instanceof AiUnavailable)) throw err;
        const r = rulesReview(evidence, `The Bookie couldn't review this (${err.message}).`);
        result = { source: "rules", status: "needs_human", evidenceUsed: [], ...r };
      }
    }

    return await transact((db) => {
      const live = db.markets.find((m) => m.id === marketId)!;
      if (live.receiptId) throw new AppError(409, "market_settled", "This market settled while the Bookie was reading.");
      const review: Review = { id: newId("rv"), marketId, requestedBy: userId, at: new Date().toISOString(), evidenceSeen: evidence.map((e) => e.id), ...result };
      db.reviews.push(review);
      log(
        db,
        live.groupId,
        marketId,
        "review",
        review.source,
        review.status === "recommended" ? `Recommends ${review.outcome!.toUpperCase()} (${Math.round((review.confidence ?? 0) * 100)}% sure).` : "Needs a human to decide.",
        review.model
      );
      return review;
    });
  } finally {
    running.delete(marketId);
  }
}

// ---------- roast ----------

async function runRoast(receiptId: string) {
  const ctx = await read((db) => {
    const r = db.receipts.find((x) => x.id === receiptId);
    const m = r && db.markets.find((x) => x.id === r.marketId);
    if (!r || !m) return null;
    const name = (id: string) => db.users.find((u) => u.id === id)?.name ?? id;
    return {
      groupId: m.groupId,
      marketId: m.id,
      question: m.question,
      outcome: r.outcome,
      winners: r.results.filter((x) => x.result === "won").map((x) => name(x.userId)),
      losers: r.results.filter((x) => x.result === "lost").map((x) => name(x.userId)),
      dare: r.dareText,
    };
  });
  if (!ctx) return;
  try {
    const { output, model } = await writeRoast(ctx);
    const line = output.line.trim().slice(0, 160);
    await transact((db) => {
      const r = db.receipts.find((x) => x.id === receiptId);
      if (!r) return;
      r.roast = line;
      r.roastSource = "claude";
      log(db, ctx.groupId, ctx.marketId, "roast", "claude", line, model);
    });
  } catch (err) {
    if (!(err instanceof AiUnavailable)) throw err;
    console.warn(`[bookie] roast fell back to the stock line: ${err.message}`);
  }
}

// ---------- dare suggestion ----------

export async function suggestDareFor(groupId: string, userId: string, question: string, rule?: string) {
  const presets = await read((db) => requireMember(db, userId, groupId).group.darePresets);
  const mode = aiMode();
  const fallback = presets[question.length % Math.max(1, presets.length)] ?? "50 burpees on camera";
  let text = fallback;
  let source: AiSource = "baseline";
  let model: string | undefined;
  if (mode === "stub") {
    text = "Test stub dare: 20 pushups on camera";
    source = "stub";
  } else if (mode === "claude") {
    try {
      const r = await suggestDare({ question, rule, presets });
      text = r.output.dare.trim().slice(0, 80) || fallback;
      source = "claude";
      model = r.model;
    } catch (err) {
      if (!(err instanceof AiUnavailable)) throw err;
    }
  }
  await transact((db) => log(db, groupId, undefined, "dare", source, `Suggested "${text}" for "${question.slice(0, 60)}".`, model));
  return { text, source };
}

// ---------- queue ----------

let draining = false;

/** Run AI work queued by mutations. Called from `after()` so it never delays a response. */
export async function runQueued() {
  if (draining) return;
  draining = true;
  try {
    const queue = aiQueue();
    while (queue.length) {
      const task = queue.shift()!;
      try {
        if (task.kind === "odds") await refreshOdds(task.marketId, task.trigger);
        else await runRoast(task.receiptId);
      } catch (err) {
        console.error("[bookie] queued task failed", task, err);
      }
    }
  } finally {
    draining = false;
  }
}
