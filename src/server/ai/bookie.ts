import "server-only";
import { baselineEstimate } from "@/lib/markets/baseline";
import type { AiSource, BookieEstimate, Outcome, Review, ReviewIssue } from "@/lib/markets/types";
import { AppError } from "../errors";
import { requireMember } from "../groups";
import { aiQueue, applyBookieEstimate, positionsOf, requireMarket, settledRecords, statusOf } from "../markets";
import { newId, read, transact, type Db, type StoredEvidence } from "../store";
import { ChatAnthropic } from "@langchain/anthropic";
import { agentFailureReason, askAgent, type AgentContext, type AgentOutput, type AgentRecord } from "./agent";
import { AiUnavailable, estimateOdds, reviewEvidence, suggestDare, writeRoast } from "./claude";
import { AI_MODEL, aiMode } from "./config";

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

type Baseline = ReturnType<typeof baselineEstimate>;

/** Clamp and check a model's odds against the facts it was given. Shared by the Deep Agent and the single call. */
function fromModel(output: AgentOutput, base: Baseline, model: string, via: BookieEstimate["via"], at: string): BookieEstimate {
  const ids = new Set(base.facts.map((f) => f.id));
  const cited = output.cited_fact_ids.filter((id) => ids.has(id));
  const chance = Math.round(Math.min(95, Math.max(5, output.chance)));
  const lo = Math.round(Math.min(chance, Math.max(1, output.range_low)));
  const hi = Math.round(Math.max(chance, Math.min(99, output.range_high)));
  return {
    chance,
    range: [lo, hi],
    uncertainty: output.uncertainty,
    explanation: output.explanation.trim().slice(0, 300),
    facts: cited.length ? base.facts.filter((f) => cited.includes(f.id)) : base.facts,
    source: "claude",
    model,
    via,
    at,
  };
}

/** Each group member's settled history, for the agent's get_track_record tool. */
function trackRecords(db: Db, groupId: string): AgentRecord[] {
  const settled = db.receipts
    .filter((r) => !r.voided)
    .flatMap((r) => {
      const m = db.markets.find((x) => x.id === r.marketId);
      return m && m.groupId === groupId ? [{ r, m }] : [];
    })
    .sort((a, b) => b.r.settledAt.localeCompare(a.r.settledAt));
  return db.memberships
    .filter((ms) => ms.groupId === groupId)
    .map((ms) => ({
      name: db.users.find((u) => u.id === ms.userId)?.name ?? ms.userId,
      aboutThem: settled
        .filter(({ m }) => m.subjectId === ms.userId)
        .slice(0, 10)
        .map(({ m, r }) => ({ question: m.question, result: r.outcome === "yes" ? ("yes" as const) : ("no" as const) })),
      played: settled.flatMap(({ m, r }) => r.results.filter((x) => x.userId === ms.userId).map((x) => ({ question: m.question, result: x.result }))).slice(0, 10),
    }));
}

// LangChain retries with long backoff by default, which would sit out the whole agent timeout when the API is down.
const anthropicModel = () => new ChatAnthropic({ model: AI_MODEL, maxTokens: 8000, maxRetries: 2 });

export async function refreshOdds(marketId: string, trigger: string): Promise<BookieEstimate | null> {
  const ctx = await read((db) => {
    const m = db.markets.find((x) => x.id === marketId);
    if (!m || m.receiptId) return null;
    const name = (id: string) => db.users.find((u) => u.id === id)?.name ?? id;
    const subject = m.subjectId ? name(m.subjectId) : undefined;
    const base = baselineEstimate({ category: m.category, subjectId: m.subjectId, subjectName: subject, history: settledRecords(db, m.groupId) });
    const agent: AgentContext = {
      market: { question: m.question, rule: m.rule, category: m.category, deadline: m.deadline, host: name(m.hostId), subject },
      friends: db.memberships.filter((x) => x.groupId === m.groupId).map((x) => name(x.userId)),
      facts: base.facts,
      baseline: base.chance,
      records: trackRecords(db, m.groupId),
    };
    return { question: m.question, rule: m.rule, category: m.category, subject, base, groupId: m.groupId, agent };
  });
  if (!ctx) return null;
  const { base } = ctx;
  const at = new Date().toISOString();
  const mode = aiMode();
  let est: BookieEstimate | undefined;

  if (mode === "claude") {
    // The opening line comes from the Deep Agent. Re-checks, and any agent failure, use one structured call.
    let agentFallbackReason: string | undefined;
    if (trigger === "created") {
      try {
        est = fromModel(await askAgent(ctx.agent, anthropicModel()), base, AI_MODEL, "deep-agent", at);
      } catch (err) {
        agentFallbackReason = agentFailureReason(err);
        console.warn(`[bookie] opening-line agent for ${marketId} failed, trying a single call: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (!est) {
      try {
        const { output, model } = await estimateOdds({ question: ctx.question, rule: ctx.rule, category: ctx.category, subject: ctx.subject, facts: base.facts, baseline: base.chance });
        est = { ...fromModel(output, base, model, "single-call", at), agentFallbackReason };
      } catch (err) {
        if (!(err instanceof AiUnavailable)) throw err;
        console.warn(`[bookie] odds for ${marketId} fell back to the baseline: ${err.message}`);
        est = { ...base, source: "baseline", at, fallbackReason: err.message, agentFallbackReason };
      }
    }
  } else if (mode === "stub") {
    est = { ...base, explanation: `Test stub: ${base.explanation}`, source: "stub", at };
  } else {
    est = { ...base, source: "baseline", at };
  }

  const final = est;
  return transact((db) => {
    if (!applyBookieEstimate(db, marketId, final)) return null;
    const how = final.via === "deep-agent" ? " (Deep Agent)" : "";
    log(db, ctx.groupId, marketId, "odds", final.source, `${trigger === "created" ? "Opening line" : "Re-check"}${how}: ${final.chance}% Yes. ${final.explanation}`, final.model, final.facts.map((f) => f.text));
    return final;
  });
}

const RECHECK_COOLDOWN_MS = Number(process.env.BWF_ODDS_COOLDOWN_MS ?? 30_000);
const rechecking = new Set<string>();
const lastRecheck = new Map<string, number>();

/** A person asked for a re-check. One at a time per market, and at most once per cooldown, so nobody can run up model calls. */
export async function requestRecheck(marketId: string) {
  if (rechecking.has(marketId)) throw new AppError(409, "recheck_running", "The Bookie is already re-checking this one.");
  const wait = (lastRecheck.get(marketId) ?? 0) + RECHECK_COOLDOWN_MS - Date.now();
  if (wait > 0) throw new AppError(429, "recheck_cooldown", `The Bookie just looked. Try again in ${Math.ceil(wait / 1000)}s.`);
  rechecking.add(marketId);
  lastRecheck.set(marketId, Date.now());
  try {
    return await refreshOdds(marketId, "manual");
  } finally {
    rechecking.delete(marketId);
  }
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
