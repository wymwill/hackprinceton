// Multiple-choice bets (migration 0009), run against the real migrations in PGlite.
// Run: npm run test:series-sql
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "./harness.mjs";

let t;
let will, jake, mal, sam, eve;
before(async () => {
  t = await createDb();
  [will, jake, mal, sam, eve] = await Promise.all(["Will", "Jake", "Malachi", "Sam", "Eve"].map((n) => t.user(n)));
});
after(() => t.close());

const one = async (p) => (await p)[0];
const rejects = async (p, hint, message) => {
  await assert.rejects(p, (err) => {
    if (hint) assert.equal(err.hint, hint, `hint for: ${err.message}`);
    if (message) assert.match(err.message, message);
    return true;
  });
};

const MIDTERM = { question: "Who will score highest on the midterm?", outcomes: ["Will", "Jake", "Malachi", "Other"] };

async function create(host, { bets = 2, coins = 1000, questions = [], list = null, settings = {} } = {}) {
  return one(host.rpc("create_bet_series", {
    p_title: "Midterms", p_description: "", p_planned_bet_count: bets, p_initial_bankroll: coins,
    p_loser_count: 1, p_stake_mode: "MONEY", p_questions: questions, p_settings: { minContribution: 5, ...settings },
    p_bets: list,
  }));
}
const state = async (who) => (await one(who.rpc("my_series_state"))).my_series_state;
const view = async (who, id) => (await state(who)).series.find((s) => s.id === id);
const bet = async (who, id, betId) => (await view(who, id)).bets.find((b) => b.id === betId);
const coins = async (who, id) => (await view(who, id)).standings.find((r) => r.userId === who.id);
const wager = (who, id, betId, outcome, amount) =>
  one(who.rpc("place_series_wager", { p_series_id: id, p_bet_id: betId, p_outcome: outcome, p_amount: amount }));
const resolve = async (who, id, betId, outcome) =>
  (await one(who.rpc("finish_series_bet", { p_series_id: id, p_bet_id: betId, p_outcome: outcome, p_cancel: false }))).finish_series_bet;
const tie = async (who, id, betId, tied) =>
  (await one(who.rpc("finish_series_bet", { p_series_id: id, p_bet_id: betId, p_outcome: null, p_cancel: false, p_tied: tied }))).finish_series_bet;
const update = (who, id, betId, args) => one(who.rpc("update_series_bet", { p_series_id: id, p_bet_id: betId, ...args }));

/** A running money-mode series (no favors needed) with everyone in and ready. */
async function running(players, opts = {}) {
  const [host, ...rest] = players;
  const s = await create(host, opts);
  for (const p of rest) await p.rpc("join_bet_series", { p_series_id: s.id });
  for (const p of players) await p.rpc("set_series_ready", { p_series_id: s.id, p_ready: true });
  await one(host.rpc("start_bet_series", { p_series_id: s.id }));
  const v = await view(host, s.id);
  return { id: s.id, bets: v.bets };
}
const ids = (b) => Object.fromEntries(b.outcomes.map((o) => [o.label, o.id]));

describe("creating multiple-choice bets", () => {
  test("bets can be YES/NO (the default) or 2 to 10 named outcomes, each with a stable id and a tie rule", async () => {
    const s = await create(will, { list: [MIDTERM, { question: "Will it rain on Friday?" }] });
    const [mc, yn] = (await view(will, s.id)).bets;
    assert.equal(mc.kind, "multi");
    assert.equal(mc.tieRule, "refund");
    assert.deepEqual(mc.outcomes.map((o) => [o.label, o.position, o.pool]), [["Will", 1, 0], ["Jake", 2, 0], ["Malachi", 3, 0], ["Other", 4, 0]]);
    assert.ok(mc.outcomes.every((o) => /^[0-9a-f-]{36}$/.test(o.id)));
    assert.equal(yn.kind, "binary");
    assert.deepEqual(yn.outcomes.map((o) => o.label), ["YES", "NO"]);
  });

  test("outcome lists are checked: 2 to 10, unique ignoring case, not blank; tie rule must be known", async () => {
    const before = (await state(eve)).series.length;
    const bad = (outcomes, extra = {}) => create(eve, { bets: 1, list: [{ question: "Who wins?", outcomes, ...extra }] });
    await rejects(bad(["Only one"]), "invalid_outcomes", /2 to 10/);
    await rejects(bad(Array.from({ length: 11 }, (_, i) => `Option ${i + 1}`)), "invalid_outcomes", /2 to 10/);
    await rejects(bad(["Will", " will "]), "invalid_outcomes", /listed twice/);
    await rejects(bad(["Will", "   "]), "invalid_outcomes", /Name outcome 2/);
    await rejects(bad(["Will", "x".repeat(61)]), "invalid_outcomes");
    await rejects(bad(["Will", "Jake"], { tieRule: "split" }), "invalid_tie_rule");
    await rejects(create(eve, { bets: 2, questions: ["Q one?"], list: [MIDTERM] }), "invalid_question", /not both/);
    // Ten distinct outcomes is the maximum and is fine.
    await create(eve, { bets: 1, list: [{ question: "Pick one?", outcomes: Array.from({ length: 10 }, (_, i) => `O${i}`) }] });
    assert.equal((await state(eve)).series.length, before + 1);
  });

  test("the host adds a multiple-choice bet in the lobby, then renames, reorders, adds and removes outcomes; ids stay stable", async () => {
    const s = await create(will, { bets: 2 });
    const b = await one(will.rpc("create_series_bet", { p_series_id: s.id, p_question: "Who wins the bake-off?", p_outcomes: ["Ann", "Bo", "Cy"], p_tie_rule: "first_listed" }));
    let v = await bet(will, s.id, b.id);
    const before = ids(v);
    assert.equal(v.tieRule, "first_listed");

    // Rename Ann→Anna, move Cy to the top, drop Bo, add Dee.
    await update(will, s.id, b.id, { p_outcomes: [{ id: before.Cy, label: "Cy" }, { id: before.Ann, label: "Anna" }, { label: "Dee" }] });
    v = await bet(will, s.id, b.id);
    assert.deepEqual(v.outcomes.map((o) => o.label), ["Cy", "Anna", "Dee"]);
    assert.equal(ids(v).Cy, before.Cy);
    assert.equal(ids(v).Anna, before.Ann);
    // Swapping two names in one edit works too.
    await update(will, s.id, b.id, { p_outcomes: [{ id: before.Cy, label: "Anna" }, { id: before.Ann, label: "Cy" }, { id: ids(v).Dee, label: "Dee" }] });
    assert.deepEqual((await bet(will, s.id, b.id)).outcomes.map((o) => [o.label, o.id]), [["Anna", before.Cy], ["Cy", before.Ann], ["Dee", ids(v).Dee]]);

    await rejects(update(jake, s.id, b.id, { p_question: "Mine now?" }), "not_host");
    await rejects(update(will, s.id, b.id, { p_outcomes: [{ label: "Solo" }] }), "invalid_outcomes");
    await rejects(update(will, s.id, b.id, { p_outcomes: [{ id: "00000000-0000-0000-0000-000000000000", label: "Ghost" }, { label: "Real" }] }), "invalid_outcomes");
    await rejects(update(will, s.id, b.id, { p_tie_rule: "coin flip" }), "invalid_tie_rule");

    // Back to YES/NO and back again.
    await update(will, s.id, b.id, { p_kind: "binary" });
    v = await bet(will, s.id, b.id);
    assert.deepEqual([v.kind, v.outcomes.map((o) => o.label)], ["binary", ["YES", "NO"]]);
    await rejects(update(will, s.id, b.id, { p_kind: "multi" }), "invalid_outcomes", /List the outcomes/);
    await update(will, s.id, b.id, { p_outcomes: ["X", "Y"], p_question: "X or Y?" });
    v = await bet(will, s.id, b.id);
    assert.deepEqual([v.kind, v.question, v.tieRule, v.outcomes.map((o) => o.label)], ["multi", "X or Y?", "refund", ["X", "Y"]]);
  });

  test("outcomes lock when betting opens: at start, or right away for a bet added mid-series", async () => {
    const s = await create(will, { bets: 2, list: [MIDTERM], settings: { betCreation: "during" } });
    await jake.rpc("join_bet_series", { p_series_id: s.id });
    for (const p of [will, jake]) await p.rpc("set_series_ready", { p_series_id: s.id, p_ready: true });
    await will.rpc("start_bet_series", { p_series_id: s.id });
    const [first] = (await view(will, s.id)).bets;
    await rejects(update(will, s.id, first.id, { p_outcomes: ["A", "B"] }), "outcomes_locked");
    await rejects(update(will, s.id, first.id, { p_question: "Different?" }), "outcomes_locked");
    const live = await one(will.rpc("create_series_bet", { p_series_id: s.id, p_question: "Who's late first?", p_outcomes: ["Will", "Jake"] }));
    assert.equal(live.status, "OPEN");
    await rejects(update(will, s.id, live.id, { p_outcomes: ["Will", "Jake", "Nobody"] }), "outcomes_locked");
  });
});

describe("the four-option midterm bet", () => {
  test("friends wager on different people; pool shares show; invalid and switched picks are refused; the host resolves with exact payouts and standings", async () => {
    const s = await running([will, jake, mal, sam], { bets: 2, list: [MIDTERM, { question: "Will the curve help?" }] });
    const [mid, yn] = s.bets;
    const o = ids(mid);

    await wager(jake, s.id, mid.id, o.Jake, 300);
    await wager(mal, s.id, mid.id, o.Malachi, 200);
    await wager(sam, s.id, mid.id, o.Will, 100);
    await wager(will, s.id, mid.id, "will", 100); // by label, any case
    await wager(sam, s.id, mid.id, o.Will, 50); // adding to your own pick is fine

    let v = await bet(will, s.id, mid.id);
    assert.deepEqual(v.outcomes.map((x) => [x.label, x.pool, x.backers]), [["Will", 250, 2], ["Jake", 300, 1], ["Malachi", 200, 1], ["Other", 0, 0]]);
    assert.deepEqual(v.wagers.map((w) => [w.userId, w.outcomeId, w.amount]).sort(), [
      [jake.id, o.Jake, 300], [mal.id, o.Malachi, 200], [sam.id, o.Will, 150], [will.id, o.Will, 100],
    ].sort());

    // Invalid outcomes: another bet's outcome, an unknown name, nothing at all.
    const ynYes = ids(yn).YES;
    await rejects(wager(eve, s.id, mid.id, o.Jake, 10), "not_member");
    await rejects(wager(jake, s.id, mid.id, ynYes, 10), "invalid_wager", /this bet's outcomes/);
    await rejects(wager(jake, s.id, mid.id, "Professor", 10), "invalid_wager");
    await rejects(wager(jake, s.id, mid.id, null, 10), "invalid_wager");
    // No switching, and no spending more than you have.
    await rejects(wager(jake, s.id, mid.id, o.Will, 10), "cannot_switch_sides", /You're on Jake/);
    await rejects(wager(mal, s.id, mid.id, o.Malachi, 801), "insufficient_balance");

    // Malachi tops the class. Pool 750, Malachi side 200: Malachi alone takes it all.
    const r = await resolve(will, s.id, mid.id, o.Malachi);
    assert.equal(r.pool, 750);
    assert.equal(r.outcomeId, o.Malachi);
    v = await bet(will, s.id, mid.id);
    assert.equal(v.status, "resolved");
    assert.equal(v.outcomeId, o.Malachi);
    assert.equal(v.outcome, "malachi");
    assert.deepEqual(Object.fromEntries(v.results.map((x) => [x.userId, [x.outcomeId, x.stake, x.payout, x.net]])), {
      [jake.id]: [o.Jake, 300, 0, -300], [mal.id]: [o.Malachi, 200, 750, 550], [sam.id]: [o.Will, 150, 0, -150], [will.id]: [o.Will, 100, 0, -100],
    });
    const st = (await view(will, s.id)).standings;
    assert.deepEqual(st.map((x) => [x.userId, x.coins, x.rank]), [[mal.id, 1550, 1], [will.id, 900, 2], [sam.id, 850, 3], [jake.id, 700, 4]]);
    assert.equal(st.at(-1).losing, true);
    const board = await mal.rpc("series_leaderboard", { p_series_id: s.id });
    assert.equal(board[0].display_name, "Malachi");
    // Settling again does nothing.
    await rejects(resolve(will, s.id, mid.id, o.Jake), "bet_not_open");
    assert.equal((await coins(mal, s.id)).coins, 1550);
  });

  test("several winners split by stake, rounding leftovers go to the biggest stake, and the total is exact", async () => {
    const s = await running([will, jake, mal, sam], { bets: 1, list: [MIDTERM] });
    const [mid] = s.bets;
    const o = ids(mid);
    await wager(will, s.id, mid.id, o.Other, 100);
    await wager(jake, s.id, mid.id, o.Other, 200);
    await wager(mal, s.id, mid.id, o.Jake, 101);
    await wager(sam, s.id, mid.id, o.Will, 33);
    const r = await resolve(will, s.id, mid.id, o.Other);
    // Pool 434, winners 300: 100 → 144.67, 200 → 289.33. Floors 144 + 289 = 433; 1 left goes to the 200 stake.
    const pay = Object.fromEntries(r.payouts.map((p) => [p.userId, p.gross]));
    assert.deepEqual([pay[will.id], pay[jake.id], pay[mal.id], pay[sam.id]], [144, 290, 0, 0]);
    assert.equal(r.payouts.reduce((a, p) => a + p.gross, 0), 434);
  });

  test("refunds: nobody on the winner, everyone on one outcome at lock, and cancel", async () => {
    const s = await running([will, jake, mal], { bets: 3, list: [MIDTERM, { question: "Fastest mile?", outcomes: ["Will", "Jake", "Mal"] }, { question: "Best pun?", outcomes: ["A", "B"] }] });
    const [a, b, c] = s.bets;
    await wager(jake, s.id, a.id, ids(a).Jake, 100);
    await wager(mal, s.id, a.id, ids(a).Will, 50);
    let r = await resolve(will, s.id, a.id, ids(a).Other);
    assert.equal(r.refunded, true);
    assert.deepEqual(r.payouts.map((p) => p.net), [0, 0]);

    await wager(jake, s.id, b.id, ids(b).Mal, 100);
    await wager(mal, s.id, b.id, ids(b).Mal, 70);
    const locked = await one(will.rpc("lock_series_bet", { p_series_id: s.id, p_bet_id: b.id }));
    assert.equal(locked.status, "RESOLVED");
    assert.equal(locked.refunded, true);

    await wager(jake, s.id, c.id, ids(c).A, 40);
    await wager(mal, s.id, c.id, ids(c).B, 60);
    r = (await one(will.rpc("finish_series_bet", { p_series_id: s.id, p_bet_id: c.id, p_outcome: null, p_cancel: true }))).finish_series_bet;
    assert.equal(r.status, "CANCELLED");
    assert.deepEqual([(await coins(jake, s.id)).coins, (await coins(mal, s.id)).coins], [1000, 1000]);
  });

  test("withdraw inside the window, then pick a different outcome", async () => {
    const s = await running([will, jake], { bets: 1, list: [MIDTERM], settings: { withdrawMinutes: 10 } });
    const [mid] = s.bets;
    const o = ids(mid);
    await wager(jake, s.id, mid.id, o.Will, 100);
    await rejects(wager(jake, s.id, mid.id, o.Jake, 10), "cannot_switch_sides", /withdraw and pick again/);
    await jake.rpc("withdraw_series_wager", { p_series_id: s.id, p_bet_id: mid.id });
    await wager(jake, s.id, mid.id, o.Jake, 80);
    assert.deepEqual((await bet(jake, s.id, mid.id)).outcomes.map((x) => x.pool), [0, 80, 0, 0]);
    await t.ageBets(s.id, 11);
    await rejects(jake.rpc("withdraw_series_wager", { p_series_id: s.id, p_bet_id: mid.id }), "withdraw_closed");
  });
});

describe("ties", () => {
  test("tie rule REFUND: the host reports a tie and everyone gets their coins back", async () => {
    // A second bet keeps the series running, so the tie is the newest activity.
    const s = await running([will, jake, mal], { bets: 2, list: [{ ...MIDTERM, tieRule: "refund" }, { question: "Will it snow?" }] });
    const [mid] = s.bets;
    const o = ids(mid);
    await wager(jake, s.id, mid.id, o.Jake, 100);
    await wager(mal, s.id, mid.id, o.Malachi, 60);
    await wager(will, s.id, mid.id, o.Will, 40);
    const r = await tie(will, s.id, mid.id, [o.Malachi, o.Jake]);
    assert.equal(r.refunded, true);
    assert.equal(r.outcomeId, null);
    const v = await bet(will, s.id, mid.id);
    assert.equal(v.status, "resolved");
    assert.deepEqual([...v.tiedOutcomeIds].sort(), [o.Jake, o.Malachi].sort());
    assert.ok(v.results.every((x) => x.net === 0));
    assert.match((await view(will, s.id)).activity[0].text, /Tie between Jake and Malachi, so coins went back/);
  });

  test("tie rule FIRST_LISTED: the earliest-listed tied outcome wins", async () => {
    const s = await running([will, jake, mal], { bets: 1, list: [{ ...MIDTERM, tieRule: "first_listed" }] });
    const [mid] = s.bets;
    const o = ids(mid);
    await wager(jake, s.id, mid.id, o.Jake, 100);
    await wager(mal, s.id, mid.id, o.Malachi, 60);
    await wager(will, s.id, mid.id, o.Other, 40);
    // Malachi and Jake tie; Jake is listed before Malachi, so Jake wins the whole pool.
    const r = await tie(will, s.id, mid.id, ["Malachi", o.Jake]);
    assert.equal(r.outcomeId, o.Jake);
    assert.equal(r.refunded, false);
    assert.equal(Object.fromEntries(r.payouts.map((p) => [p.userId, p.gross]))[jake.id], 200);
    assert.equal((await bet(will, s.id, mid.id)).tiedOutcomeIds.length, 2);
  });

  test("ties need 2+ different outcomes of a multiple-choice bet", async () => {
    const s = await running([will, jake], { bets: 2, list: [MIDTERM, { question: "Will it snow?" }] });
    const [mid, yn] = s.bets;
    await rejects(tie(will, s.id, mid.id, [ids(mid).Jake]), "invalid_outcome", /at least two/);
    await rejects(tie(will, s.id, mid.id, [ids(mid).Jake, ids(mid).Jake]), "invalid_outcome", /at least two/);
    await rejects(tie(will, s.id, mid.id, [ids(mid).Jake, "Professor"]), "invalid_outcome");
    await rejects(tie(will, s.id, yn.id, ["YES", "NO"]), "invalid_outcome", /can't tie/);
    await rejects(tie(jake, s.id, mid.id, [ids(mid).Jake, ids(mid).Will]), "not_host");
    await rejects(resolve(will, s.id, mid.id, ids(yn).YES), "invalid_outcome");
  });
});

describe("races and safety", () => {
  test("concurrent wagers never overspend, and concurrent settles pay out once", async () => {
    // Two bets, so settling the first doesn't end the series: the repeats hit bet_not_open.
    const s = await running([will, jake, mal], { bets: 2, coins: 500, list: [MIDTERM, { question: "Will it snow?" }] });
    const [mid] = s.bets;
    const o = ids(mid);
    const tries = await Promise.allSettled([0, 1, 2, 3].map(() => wager(jake, s.id, mid.id, o.Jake, 200)));
    assert.equal(tries.filter((x) => x.status === "fulfilled").length, 2);
    assert.ok(tries.filter((x) => x.status === "rejected").every((x) => x.reason.hint === "insufficient_balance"));
    await wager(mal, s.id, mid.id, o.Malachi, 100);
    assert.equal((await coins(jake, s.id)).available, 100);

    const settles = await Promise.allSettled([resolve(will, s.id, mid.id, o.Jake), resolve(will, s.id, mid.id, o.Jake), resolve(will, s.id, mid.id, o.Malachi)]);
    assert.equal(settles.filter((x) => x.status === "fulfilled").length, 1);
    assert.ok(settles.filter((x) => x.status === "rejected").every((x) => x.reason.hint === "bet_not_open"));
    // Pool 500 paid exactly once.
    assert.equal((await coins(jake, s.id)).coins + (await coins(mal, s.id)).coins + (await coins(will, s.id)).coins, 1500);
  });

  test("outcomes are only readable by members", async () => {
    const s = await create(will, { bets: 1, list: [MIDTERM] });
    const [b] = (await view(will, s.id)).bets;
    assert.equal((await will.as("select * from public.series_bet_outcomes where bet_id = $1", [b.id])).length, 4);
    assert.equal((await eve.as("select * from public.series_bet_outcomes where bet_id = $1", [b.id])).length, 0);
    await rejects(eve.as("insert into public.series_bet_outcomes(bet_id, label, position) values ($1, 'Sneaky', 5)", [b.id]));
  });

  test("YES/NO bets still take YES/NO by label (any case) or by outcome id", async () => {
    const s = await running([will, jake, mal], { bets: 1, questions: ["Will the bus be late?"] });
    const [b] = s.bets;
    await wager(jake, s.id, b.id, "yes", 100);
    await wager(mal, s.id, b.id, ids(b).NO, 100);
    const r = await resolve(will, s.id, b.id, "Yes");
    assert.equal(r.outcomeId, ids(b).YES);
    const v = await bet(will, s.id, b.id);
    assert.equal(v.outcome, "yes");
    assert.deepEqual(v.wagers.map((w) => w.side).sort(), ["no", "yes"]);
  });
});
