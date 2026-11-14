#!/usr/bin/env node
/**
 * End-to-end checks for the AI Bookie: odds from stored history, evidence,
 * reviews, human decisions, and settlement through the existing backend.
 *
 * Run against a fresh data file. The checks adapt to the server's AI mode:
 *
 *   BOOKIE_AI=stub BOOKIE_DATA_FILE=/tmp/ai.json npm run dev   # deterministic recommender
 *   BOOKIE_AI=off  BOOKIE_DATA_FILE=/tmp/ai.json npm run dev   # no model: rules only
 *   npm run test:ai
 *
 * With BOOKIE_AI=claude (a real API key) the deterministic recommendation checks
 * are skipped and the live review is printed for a human to read.
 */
import assert from "node:assert/strict";

const BASE = process.env.BOOKIE_URL ?? "http://localhost:3000";
let step = 0;
const ok = (msg) => console.log(`  ✓ ${++step}. ${msg}`);

async function call(as, method, path, body) {
  const form = body instanceof FormData;
  const res = await fetch(BASE + path, {
    method,
    headers: { Cookie: `bookie_user=${as}`, ...(form || !body ? {} : { "Content-Type": "application/json" }) },
    body: form ? body : body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get("content-type") ?? "";
  return { status: res.status, type, json: type.includes("json") ? await res.json() : null };
}
const state = async (as = "alex") => (await call(as, "GET", "/api/state")).json;
const betOf = async (id, as = "alex") => (await state(as)).bets.find((b) => b.id === id);
const balances = async () => Object.fromEntries((await state()).users.map((u) => [u.id, u.balance]));
const inFuture = (ms) => new Date(Date.now() + ms).toISOString();
const pct = (est, oid) => Math.round(est.probabilities.find((p) => p.outcomeId === oid).p * 100);

// 1x1 transparent PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const image = (bytes, type, name = "proof.png") => {
  const f = new FormData();
  f.set("file", new Blob([bytes], { type }), name);
  f.set("text", "Gym check-in screen");
  return f;
};

const s0 = await state();
const MODE = s0.ai.mode;
console.log(`AI Bookie e2e against ${BASE} (AI mode: ${MODE})`);

// ---------- A. odds ----------

// Seeded open bet about Jake: the record must match the stored bets it cites.
const legDay = s0.bets.find((b) => b.proposition.startsWith("Will Jake make 6 AM leg day"));
assert.ok(legDay?.odds, "seeded bet has an estimate");
const subj = legDay.odds.facts.find((f) => f.id === "f_subject");
assert.match(subj.text, /2 of the last 7/);
const cited = subj.betIds.map((id) => s0.bets.find((b) => b.id === id));
assert.equal(cited.length, 7);
assert.ok(cited.every((b) => b && b.subjectId === "jake" && b.status === "settled"), "every cited bet is a settled bet about Jake");
assert.equal(cited.filter((b) => b.receipt.outcomeId === "o1").length, 2, "cited bets really contain 2 Yes results");
const jakeP = pct(legDay.odds, "o1");
assert.ok(jakeP > 15 && jakeP < 45, `Jake's estimate ${jakeP}% reflects a weak record`);
assert.notEqual(jakeP, legDay.outcomes[0].chance, "AI estimate is stored apart from the pool %");
ok(`seeded odds cite real stored bets: "${legDay.odds.explanation}"`);

// No history: multi-outcome with nobody on the hook.
const multi = await call("alex", "POST", "/api/bets", {
  proposition: "AI e2e: who wins Friday's chess night?", outcomes: ["Alex", "Sam", "Priya"], deadline: inFuture(3_600_000), stake: 10, pick: 0, category: "Pop Culture",
});
assert.equal(multi.status, 201);
let mv = await betOf(multi.json.result.id);
assert.deepEqual(mv.odds.probabilities.map((p) => Math.round(p.p * 100)), [33, 33, 33]);
assert.equal(mv.odds.uncertainty, "high");
assert.equal(mv.odds.facts.length, 0, "no invented facts");
ok("no history: even split, high uncertainty, no facts");

// Subject with no record of their own.
const fresh = await call("sam", "POST", "/api/bets", {
  proposition: "AI e2e: will Alex finish the puzzle tonight?", outcomes: ["Yes", "No"], deadline: inFuture(3_600_000), stake: 10, pick: 0, category: "Habits", subjectId: "alex",
});
mv = await betOf(fresh.json.result.id);
assert.match(mv.odds.facts.find((f) => f.id === "f_subject").text, /No settled bets have had Alex on the hook/);
assert.equal(mv.odds.uncertainty, "high");
assert.equal((await call("sam", "POST", "/api/bets", { proposition: "x bad subject", outcomes: ["Yes", "No"], deadline: inFuture(60_000), stake: 1, pick: 0, subjectId: "nobody" })).status, 400);
ok("subject without history says so instead of guessing a record");

// Manual re-estimate keeps working.
const re = await call("priya", "POST", `/api/bets/${legDay.id}/odds`);
assert.equal(re.status, 200);
assert.ok((await betOf(legDay.id)).oddsHistory.length > legDay.oddsHistory.length);
ok("odds can be re-estimated on demand");

// ---------- B. evidence and review ----------

// A Jake bet we'll settle via the AI flow.
const created = await call("sam", "POST", "/api/bets", {
  proposition: "AI e2e: will Jake be at the gym before 6 AM tomorrow?", outcomes: ["Yes", "No"], deadline: inFuture(3_600_000), stake: 100, pick: 1, category: "Fitness", subjectId: "jake",
});
const id = created.json.result.id;
assert.equal((await call("jake", "POST", `/api/bets/${id}/entries`, { outcomeId: "o1", amount: 100 })).status, 201);
assert.equal((await call("priya", "POST", `/api/bets/${id}/entries`, { outcomeId: "o1", amount: 50 })).status, 201);

// Who can submit, and what.
assert.equal((await call("marcus", "POST", `/api/bets/${id}/evidence`, { kind: "text", text: "trust me" })).status, 403);
assert.equal((await call("jake", "POST", `/api/bets/${id}/evidence`, { kind: "link", url: "javascript:alert(1)" })).status, 400);
assert.equal((await call("jake", "POST", `/api/bets/${id}/evidence`, { kind: "text", text: "" })).status, 400);
assert.equal((await call("jake", "POST", `/api/bets/${id}/evidence`, image(Buffer.from("not really a png"), "image/png"))).status, 400);
assert.equal((await call("jake", "POST", `/api/bets/${id}/evidence`, image(PNG, "image/svg+xml", "x.svg"))).status, 400);
ok("non-participants, bad links, empty text, fake and SVG images are rejected");

const img = await call("jake", "POST", `/api/bets/${id}/evidence`, image(PNG, "image/png"));
assert.equal(img.status, 201, JSON.stringify(img.json));
const served = await fetch(BASE + `/api/evidence/${img.json.result.id}`);
assert.equal(served.headers.get("content-type"), "image/png");
assert.equal(Buffer.from(await served.arrayBuffer()).length, PNG.length);
const ev1 = await call("jake", "POST", `/api/bets/${id}/evidence`, { kind: "text", text: "Checked in at 5:41 AM, screenshot attached.", claimsOutcomeId: "o1" });
assert.equal(ev1.status, 201);
ok("participants can submit statements and images; images are served back safely");

assert.equal((await call("sam", "POST", `/api/bets/${id}/review`)).json.error.code, "bet_open");
assert.equal((await call("sam", "POST", `/api/bets/${id}/close`)).status, 200);
assert.equal((await call("marcus", "POST", `/api/bets/${id}/review`)).status, 403);
ok("reviews wait until entries close and are limited to people in the bet");

const before = await balances();
if (MODE === "stub") {
  // One supporting claim isn't enough for the stub; ask anyway.
  let rv = await call("sam", "POST", `/api/bets/${id}/review`);
  assert.equal(rv.status, 201);
  assert.equal(rv.json.result.status, "needs_review");
  assert.equal((await call("sam", "POST", `/api/bets/${id}/decision`, { reviewId: rv.json.result.id, action: "confirm" })).json.error.code, "needs_human_review");
  ok("thin evidence is flagged for a human and can't be confirmed");

  await call("priya", "POST", `/api/bets/${id}/evidence`, { kind: "link", url: "https://example.com/checkin/5-41", claimsOutcomeId: "o1" });
  rv = await call("jake", "POST", `/api/bets/${id}/review`);
  assert.equal(rv.json.result.status, "recommended");
  assert.equal(rv.json.result.outcomeId, "o1");
  const review = rv.json.result;
  assert.equal((await call("jake", "POST", `/api/bets/${id}/decision`, { reviewId: review.id, action: "confirm" })).status, 403);
  ok("agreeing evidence gets a recommendation; only the creator can act on it");

  // New evidence after the review makes it stale.
  await call("sam", "POST", `/api/bets/${id}/evidence`, { kind: "text", text: "Saw the check-in too.", claimsOutcomeId: "o1" });
  assert.equal((await call("sam", "POST", `/api/bets/${id}/decision`, { reviewId: review.id, action: "confirm" })).json.error.code, "stale_review");
  const rv2 = (await call("sam", "POST", `/api/bets/${id}/review`)).json.result;
  assert.equal((await call("sam", "POST", `/api/bets/${id}/decision`, { reviewId: review.id, action: "confirm" })).json.error.code, "stale_review");
  ok("a review is stale once newer evidence or a newer review exists");

  // Confirm, then hammer it.
  const conf = await call("sam", "POST", `/api/bets/${id}/decision`, { reviewId: rv2.id, action: "confirm", note: "Check-in matches." });
  assert.equal(conf.status, 200, JSON.stringify(conf.json));
  assert.equal(conf.json.result.alreadySettled, false);
  const receipt = conf.json.result.receipt;
  assert.equal(receipt.reviewId, rv2.id);
  assert.equal(receipt.pool, 250);
  const after = await balances();
  assert.equal(after.jake - before.jake, 167); // 100/150 * 250 = 166.67 -> 166 + 1 remainder
  assert.equal(after.priya - before.priya, 83);
  assert.equal(after.sam, before.sam);
  ok("confirming settles through the existing backend: jake +167, priya +83, sam 0");

  const burst = await Promise.all(Array.from({ length: 6 }, () => call("sam", "POST", `/api/bets/${id}/decision`, { reviewId: rv2.id, action: "confirm" })));
  assert.ok(burst.every((r) => r.status === 200 && r.json.result.alreadySettled));
  assert.equal((await call("sam", "POST", `/api/bets/${id}/settle`, { outcomeId: "o1" })).json.result.alreadySettled, true);
  assert.equal((await call("sam", "POST", `/api/bets/${id}/settle`, { outcomeId: "o2" })).status, 409);
  assert.equal((await call("sam", "POST", `/api/bets/${id}/decision`, { reviewId: rv2.id, action: "reject", note: "too late" })).status, 409);
  assert.deepEqual(await balances(), after);
  ok("repeated and concurrent confirmations never pay out twice");
} else {
  const rv = await call("sam", "POST", `/api/bets/${id}/review`);
  assert.equal(rv.status, 201);
  assert.equal(rv.json.result.status, "needs_review");
  console.log(`    review (${rv.json.result.source}): ${rv.json.result.explanation}`);
  if (MODE === "off") {
    assert.equal(rv.json.result.source, "rules");
    assert.ok(rv.json.result.issues.some((i) => i.type === "unverifiable"), "images flagged as unchecked");
    assert.equal((await call("sam", "POST", `/api/bets/${id}/decision`, { reviewId: rv.json.result.id, action: "confirm" })).json.error.code, "needs_human_review");
  }
  const s = await call("sam", "POST", `/api/bets/${id}/settle`, { outcomeId: "o1", note: "Saw the check-in myself." });
  assert.equal(s.status, 200);
  assert.equal(s.json.result.receipt.note, "Saw the check-in myself.");
  ok("without a model, reviews only describe and flag; the creator settles by hand with a note");
}

// ---------- C. contradictions, rejection, manual override ----------
const bench = s0.bets.find((b) => b.proposition.startsWith("Will Dave bench 225"));
const br = await call("alex", "POST", `/api/bets/${bench.id}/review`);
assert.equal(br.json.result.status, "needs_review");
if (MODE !== "claude") assert.ok(br.json.result.issues.some((i) => i.type === "contradictory"), "conflicting claims flagged");
assert.equal((await call("alex", "POST", `/api/bets/${bench.id}/decision`, { reviewId: br.json.result.id, action: "reject" })).json.error.code, "note_required");
assert.equal((await call("alex", "POST", `/api/bets/${bench.id}/decision`, { reviewId: br.json.result.id, action: "reject", note: "Need the video." })).status, 200);
ok("contradictory evidence is flagged; rejecting needs a note");

// ---------- D. history update, audit, leaderboard ----------
const ld = await betOf(legDay.id);
const latestStats = [...ld.oddsHistory].reverse().find((o) => o.source === "stats");
assert.equal(latestStats.trigger, "history");
assert.match(latestStats.facts.find((f) => f.id === "f_subject").text, /3 of the last 8/);
assert.ok(pct(latestStats, "o1") > jakeP, "Jake's estimate rose after a new Yes");
ok(`settling a Jake bet updated open Jake bets: ${jakeP}% → ${pct(latestStats, "o1")}%`);

const done = await betOf(id);
const types = done.audit.map((a) => a.type);
for (const t of ["bet_created", "entry_joined", "odds_estimated", "evidence_submitted", "entries_closed", "review_completed", "settled"]) {
  assert.ok(types.includes(t), `audit has ${t}`);
}
if (MODE === "stub") assert.ok(types.includes("recommendation_confirmed"));
assert.equal(done.status, "settled");
const jake = (await state()).users.find((u) => u.id === "jake");
assert.ok(jake.stats.wins >= 3, "leaderboard stats count the new win");
ok(`audit trail has ${done.audit.length} entries; leaderboard updated (jake ${jake.stats.wins}-${jake.stats.losses})`);

console.log(`\nAll ${step} checks passed (${MODE}). Bet: ${BASE}/bets/${id}`);
