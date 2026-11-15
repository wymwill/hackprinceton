import test from "node:test";
import assert from "node:assert/strict";
import { demoWrappedSummary, getWrappedSummary } from "../shared/wrapped.ts";

const YEAR = 2026;
function series(id = "s", members = []) {
  return { id, name: `Series ${id}`, settings: { startingCoins: 1000 }, members: [{ userId: "me", name: "Piggopie" }, ...members], bets: [] };
}
function bet(id, { status = "resolved", stake = 100, payout = 190, net = payout - stake, date = "2026-04-01T12:00:00.000Z", refunded = false, tiedOutcomeIds = null, outcomeId = "yes", question = `Question ${id}`, otherResults = [] } = {}) {
  return { id, question, status, refunded, settledAt: date, tiedOutcomeIds,
    outcomes: [{ id: "yes", label: "YES" }, { id: "no", label: "NO" }],
    wagers: [{ userId: "me", amount: stake, outcomeId, updatedAt: date, firstAt: date }],
    results: [{ userId: "me", outcomeId, stake, payout, net }, ...otherResults] };
}

test("totals use the caller's placed stakes and actual settlement rows exactly once", () => {
  const s = series();
  s.bets = [bet("win", { stake: 100, payout: 250, net: 150 }), bet("loss", { stake: 300, payout: 0, net: -300, date: "2026-05-01T12:00:00.000Z", outcomeId: "no" }),
    { ...bet("open", { date: "2026-06-01T12:00:00.000Z" }), status: "open", results: null, settledAt: null }];
  const result = getWrappedSummary([s], "me", "Piggopie", YEAR);
  assert.equal(result.totalBets, 3);
  assert.equal(result.markets, 3);
  assert.equal(result.totalWagered, 500);
  assert.equal(result.eligible, 2);
  assert.equal(result.wins, 1);
  assert.equal(result.winRate, 0.5);
  assert.equal(result.net, -150);
  assert.equal(result.best.net, 150);
  assert.equal(result.worst.net, -300);
  assert.equal(result.timeline.at(-1).cumulative, -150);
});

test("pending, canceled, refunded, tied, and void settlements do not inflate win rate", () => {
  const s = series();
  s.bets = [bet("tie", { tiedOutcomeIds: ["yes", "no"], net: 100 }), bet("refund", { refunded: true, net: 0, payout: 100 }),
    { ...bet("pending"), status: "open", settledAt: null, results: null }, { ...bet("draft"), status: "draft" },
    { ...bet("canceled", { refunded: true, net: 0 }), status: "canceled" }, bet("valid")];
  const r = getWrappedSummary([s], "me", "Piggopie", YEAR);
  assert.equal(r.totalBets, 5);
  assert.equal(r.eligible, 1);
  assert.equal(r.wins, 1);
  assert.equal(r.winRate, 1);
  assert.equal(r.net, 190); // includes the actual first-listed tie settlement, though the tie is not a win-rate trial
  assert.equal(r.timeline.at(-1).cumulative, r.net);
});

test("multiple choice and range outcomes are measured from actual result IDs, without implied odds", () => {
  const s = series();
  const multiple = bet("multi"); multiple.outcomes = [{ id: "yes", label: "Team A" }, { id: "no", label: "Team B" }]; multiple.question = "Who wins?";
  const range = bet("range", { stake: 50, payout: 0, net: -50, outcomeId: "no", date: "2026-05-01T12:00:00Z" }); range.kind = "range"; range.outcomes = [{ id: "yes", label: "0–10 points" }, { id: "no", label: "10+ points" }];
  s.bets = [multiple, range];
  const r = getWrappedSummary([s], "me", "Piggopie", YEAR);
  assert.equal(r.eligible, 2);
  assert.equal(r.best.outcome, "Team A");
  assert.equal(r.worst.outcome, "10+ points");
  assert.equal("probability" in r.best, false);
});

test("social awards require five shared eligible results and only compare actual peers", () => {
  const s = series("social", [{ userId: "friend", name: "Will" }]);
  s.bets = Array.from({ length: 5 }, (_, i) => bet(`b${i}`, {
    stake: i < 4 ? 200 : 100, payout: i < 4 ? 0 : 190, net: i < 4 ? -200 : 90,
    otherResults: [{ userId: "friend", outcomeId: i < 4 ? "no" : "yes", stake: 100, payout: i < 4 ? 180 : 280, net: i < 4 ? 80 : 180 }],
  }));
  const r = getWrappedSummary([s], "me", "Piggopie", YEAR);
  assert.equal(r.social.nemesis.name, "Will");
  assert.equal(r.social.nemesis.beaten, 5);
  assert.equal(r.social.rideOrDie.aligned, 1);
  assert.equal(r.social.opposite.disagreed, 4);
  s.bets.pop();
  assert.equal(getWrappedSummary([s], "me", "Piggopie", YEAR).social.nemesis, null);
});

test("year boundaries and missing timestamps are excluded rather than guessed", () => {
  const s = series();
  s.bets = [bet("in", { date: "2026-12-31T23:59:59.000Z" }), bet("before", { date: "2025-12-31T23:59:59.000Z" }),
    bet("after", { date: "2027-01-01T00:00:00.000Z" }), { ...bet("unknown"), settledAt: null, wagers: [{ userId: "me", amount: 8, outcomeId: "yes", firstAt: "2026-04-01T00:00:00Z", updatedAt: "2026-04-01T00:00:00Z" }] }];
  const r = getWrappedSummary([s], "me", "Piggopie", YEAR);
  assert.equal(r.totalBets, 1);
  assert.equal(r.winRate, 1);
});

test("archetypes are deterministic and require their documented minimum history", () => {
  const tiny = series(); tiny.bets = [bet("one")];
  assert.equal(getWrappedSummary([tiny], "me", "Piggopie", YEAR).archetype.id, "steady");
  const undefeated = series(); undefeated.bets = Array.from({ length: 8 }, (_, i) => bet(`u${i}`, { date: `2026-04-${String(i + 1).padStart(2, "0")}T12:00:00Z` }));
  const first = getWrappedSummary([undefeated], "me", "Piggopie", YEAR);
  const second = getWrappedSummary([undefeated], "me", "Piggopie", YEAR);
  assert.equal(first.archetype.id, "unbeaten");
  assert.deepEqual(first.archetype, second.archetype);
});

test("empty real histories stay empty while the separate demo mode is clearly labeled", () => {
  const empty = getWrappedSummary([], "me", "Piggopie", YEAR);
  const demo = demoWrappedSummary(YEAR);
  assert.equal(empty.totalBets, 0);
  assert.equal(empty.winRate, null);
  assert.equal(empty.best, null);
  assert.equal(empty.archetype.id, "fresh");
  assert.equal(empty.demo, false);
  assert.equal(demo.demo, true);
  assert.ok(demo.totalBets > 0);
  assert.equal(demo.best.seriesId, "demo");
});

test("share-card quote: curly quotes inside the lines, never a skipped word, an ellipsis when it doesn't fit", async () => {
  const { posterLines } = await import("../frontend/src/lib/poster.ts");
  // The demo verdict: quote marks belong to the first and last lines (a separate opening mark was overdrawn by the first line).
  const demo = posterLines("THE COMEBACK KID. The receipts are in. Your confidence is still under investigation.");
  assert.deepEqual(demo, ["“THE COMEBACK KID. The receipts are in.", "Your confidence is still under", "investigation.”"]);
  for (const line of demo) assert.ok(line.length <= 41, line);

  // Too long for four lines: keep the words in order up to the last that fits, then "…". No word from later on sneaks in.
  const long = Array.from({ length: 40 }, (_, i) => (i === 20 ? "extraordinarilylongwordthatcannotfit" : `w${i}`)).join(" ");
  const lines = posterLines(long);
  assert.equal(lines.length, 4);
  assert.ok(lines.at(-1).endsWith("…”"));
  const shown = lines.join(" ").replace(/[“”…]/g, "").split(" ");
  const original = long.split(" ");
  assert.deepEqual(shown, original.slice(0, shown.length), "words are a prefix of the quote, in order, with none skipped");

  // One enormous word is shortened rather than overflowing the card; control characters are dropped; empty stays empty.
  assert.ok(posterLines("x".repeat(90))[0].length <= 42);
  assert.deepEqual(posterLines("Hi\u0007 there​"), ["“Hi there”"]);
  assert.deepEqual(posterLines("   "), []);
});
