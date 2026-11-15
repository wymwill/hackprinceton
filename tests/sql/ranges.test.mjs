// Numerical range bets (migration 0010), run against the real migrations in PGlite.
// Run: npm run test:series-sql
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "./harness.mjs";

let t;
let ana, ben, cat, dan, eve;
before(async () => {
  t = await createDb();
  [ana, ben, cat, dan, eve] = await Promise.all(["Ana", "Ben", "Cat", "Dan", "Eve"].map((n) => t.user(n)));
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

/** Tomorrow's high: below 60, 60–64, 65–69, 70–74, 75–79, 80 or above. */
const cuts = (points, { openBelow = true, openAbove = true } = {}) => {
  const r = [];
  if (openBelow) r.push({ lower: null, upper: points[0] });
  for (let i = 0; i < points.length - 1; i++) r.push({ lower: points[i], upper: points[i + 1] });
  if (openAbove) r.push({ lower: points.at(-1), upper: null });
  return r;
};
const TEMP = { question: "What will tomorrow's high temperature be?", kind: "range", unit: "°F", decimals: 0, ranges: cuts([60, 65, 70, 75, 80]) };

async function create(host, { bets = 2, list = null, settings = {} } = {}) {
  return one(host.rpc("create_bet_series", {
    p_title: "Weather", p_description: "", p_planned_bet_count: bets, p_initial_bankroll: 1000,
    p_loser_count: 1, p_stake_mode: "MONEY", p_questions: [], p_settings: { minContribution: 5, ...settings }, p_bets: list,
  }));
}
const view = async (who, id) => (await one(who.rpc("my_series_state"))).my_series_state.series.find((s) => s.id === id);
const bet = async (who, id, betId) => (await view(who, id)).bets.find((b) => b.id === betId);
const coins = async (who, id) => (await view(who, id)).standings.find((r) => r.userId === who.id).coins;
const wager = (who, id, betId, outcome, amount) => one(who.rpc("place_series_wager", { p_series_id: id, p_bet_id: betId, p_outcome: outcome, p_amount: amount }));
const settle = async (who, id, betId, value, extra = {}) =>
  (await one(who.rpc("finish_series_bet", { p_series_id: id, p_bet_id: betId, p_outcome: null, p_cancel: false, p_value: value, ...extra }))).finish_series_bet;
const ids = (b) => Object.fromEntries(b.outcomes.map((o) => [o.label, o.id]));

async function running(players, opts = {}) {
  const [host, ...rest] = players;
  const s = await create(host, opts);
  for (const p of rest) await p.rpc("join_bet_series", { p_series_id: s.id });
  for (const p of players) await p.rpc("set_series_ready", { p_series_id: s.id, p_ready: true });
  await one(host.rpc("start_bet_series", { p_series_id: s.id }));
  return { id: s.id, bets: (await view(host, s.id)).bets };
}

describe("creating range bets", () => {
  test("the six-range temperature market gets readable labels and stored bounds", async () => {
    const s = await create(ana, { list: [TEMP, { question: "Will it rain?" }] });
    const [b, yn] = (await view(ana, s.id)).bets;
    assert.deepEqual([b.kind, b.unit, b.decimals, b.resultValue], ["range", "°F", 0, null]);
    assert.deepEqual(b.outcomes.map((o) => [o.label, o.lower, o.upper]), [
      ["Below 60°F", null, 60], ["60–64°F", 60, 65], ["65–69°F", 65, 70], ["70–74°F", 70, 75], ["75–79°F", 75, 80], ["80°F or above", 80, null],
    ]);
    assert.equal(yn.kind, "binary");
  });

  test("units, decimals and negative numbers label correctly", async () => {
    const list = [
      { question: "Lowest overnight temperature?", kind: "range", unit: "°C", decimals: 1, ranges: cuts([-10, -5, 0, 2.5]) },
      { question: "Final score margin?", kind: "range", unit: "points", decimals: 0, ranges: cuts([0, 1, 7], { openBelow: false }) },
      { question: "Price of a latte?", kind: "range", unit: "$", decimals: 2, ranges: cuts([4.5, 5, 5.5], { openBelow: false, openAbove: false }) },
    ];
    const s = await create(ben, { bets: 3, list });
    const [c, pts, usd] = (await view(ben, s.id)).bets;
    assert.deepEqual(c.outcomes.map((o) => o.label), ["Below -10.0°C", "-10.0 to -5.1°C", "-5.0 to -0.1°C", "0.0–2.4°C", "2.5°C or above"]);
    // A one-wide range at 0 decimals shows as a single value.
    assert.deepEqual(pts.outcomes.map((o) => o.label), ["0 points", "1–6 points", "7 points or above"]);
    assert.deepEqual(usd.outcomes.map((o) => o.label), ["$4.50–$4.99", "$5.00–$5.49"]);
  });

  test("gaps, overlaps, backwards ranges, inner open ends, counts and precision are refused", async () => {
    const bad = (ranges, extra = {}) => create(eve, { bets: 1, list: [{ question: "Bad range?", kind: "range", unit: "°F", decimals: 0, ranges, ...extra }] });
    await rejects(bad([{ lower: null, upper: 60 }, { lower: 61, upper: null }]), "invalid_ranges", /gap between range 1 and range 2/);
    await rejects(bad([{ lower: null, upper: 60 }, { lower: 59, upper: null }]), "invalid_ranges", /overlaps/);
    await rejects(bad([{ lower: 70, upper: 60 }, { lower: 60, upper: 80 }]), "invalid_ranges", /ends before it starts/);
    await rejects(bad([{ lower: 60, upper: 60 }, { lower: 60, upper: 80 }]), "invalid_ranges", /ends before it starts/);
    await rejects(bad([{ lower: 50, upper: 60 }, { lower: null, upper: 80 }]), "invalid_ranges", /first range can be open/);
    await rejects(bad([{ lower: 50, upper: null }, { lower: 60, upper: 80 }]), "invalid_ranges", /last range can be open/);
    await rejects(bad([{ lower: null, upper: null }]), "invalid_ranges", /2 to 10/);
    await rejects(bad(cuts([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), {}), "invalid_ranges", /2 to 10/); // 11 ranges
    await rejects(bad(cuts([60.5, 65])), "invalid_ranges", /more than 0 decimal places/);
    await rejects(bad(cuts([60, 65]), { decimals: 4 }), "invalid_ranges", /0 to 3/);
    await rejects(bad(cuts([60, 65]), { unit: "degrees Fahrenheit" }), "invalid_ranges", /12 characters/);
    await rejects(bad([{ lower: null, upper: "60" }, { lower: "60", upper: null }]), "invalid_ranges", /must be a number/);
    await rejects(bad(cuts([60, 1e10])), "invalid_ranges", /too large/);
    // Exactly 10 ranges is fine.
    await create(eve, { bets: 1, list: [{ question: "Ten ranges?", kind: "range", unit: "", decimals: 0, ranges: cuts([1, 2, 3, 4, 5, 6, 7, 8, 9]) }] });
  });

  test("the host edits draft ranges, unit and precision; switching kinds works; it all locks when betting opens", async () => {
    const s = await create(ana, { bets: 2, list: [TEMP], settings: { betCreation: "during" } });
    const [b] = (await view(ana, s.id)).bets;
    const update = (who, args) => one(who.rpc("update_series_bet", { p_series_id: s.id, p_bet_id: b.id, ...args }));
    await update(ana, { p_unit: "°C" });
    assert.deepEqual((await bet(ana, s.id, b.id)).outcomes.map((o) => o.label).slice(0, 2), ["Below 60°C", "60–64°C"]);
    await update(ana, { p_decimals: 1 });
    assert.equal((await bet(ana, s.id, b.id)).outcomes[1].label, "60.0–64.9°C");
    await update(ana, { p_ranges: cuts([10, 20, 30]), p_unit: "°C", p_decimals: 0 });
    assert.deepEqual((await bet(ana, s.id, b.id)).outcomes.map((o) => o.label), ["Below 10°C", "10–19°C", "20–29°C", "30°C or above"]);
    await rejects(update(ana, { p_ranges: cuts([10, 9]) }), "invalid_ranges");
    await rejects(update(ben, { p_unit: "K" }), "not_host");
    await update(ana, { p_kind: "multi", p_outcomes: ["Cold", "Warm"] });
    let v = await bet(ana, s.id, b.id);
    assert.deepEqual([v.kind, v.unit, v.outcomes.map((o) => [o.label, o.lower])], ["multi", null, [["Cold", null], ["Warm", null]]]);
    await update(ana, { p_kind: "range", p_ranges: cuts([0]), p_unit: "°F" });
    assert.deepEqual((await bet(ana, s.id, b.id)).outcomes.map((o) => o.label), ["Below 0°F", "0°F or above"]);
    await update(ana, { p_kind: "range" }); // no ranges given: keeps the existing ones
    assert.deepEqual((await bet(ana, s.id, b.id)).outcomes.map((o) => o.label), ["Below 0°F", "0°F or above"]);
    await update(ana, { p_kind: "binary" });
    v = await bet(ana, s.id, b.id);
    assert.deepEqual([v.kind, v.outcomes.map((o) => o.label)], ["binary", ["YES", "NO"]]);
    await rejects(update(ana, { p_kind: "range" }), "invalid_ranges", /List the ranges/);
    await update(ana, { p_kind: "range", p_ranges: TEMP.ranges, p_unit: "°F", p_decimals: 0 });

    await ben.rpc("join_bet_series", { p_series_id: s.id });
    for (const p of [ana, ben]) await p.rpc("set_series_ready", { p_series_id: s.id, p_ready: true });
    await ana.rpc("start_bet_series", { p_series_id: s.id });
    await rejects(update(ana, { p_unit: "°C" }), "outcomes_locked");
    await rejects(update(ana, { p_ranges: cuts([0, 1]) }), "outcomes_locked");
    // Added mid-series: open right away, so locked right away.
    const live = await one(ana.rpc("create_series_bet", { p_series_id: s.id, p_question: "Inches of rain?", p_kind: "range", p_ranges: cuts([0.5, 1]), p_unit: "in", p_decimals: 1 }));
    assert.equal(live.status, "OPEN");
    await rejects(one(ana.rpc("update_series_bet", { p_series_id: s.id, p_bet_id: live.id, p_decimals: 2 })), "outcomes_locked");
  });
});

describe("the temperature market", () => {
  test("acceptance: friends bet on different ranges; entering 72°F picks 70–74°F and settles everyone", async () => {
    const s = await running([ana, ben, cat, dan], { bets: 2, list: [TEMP, { question: "Will it rain?" }] });
    const [b] = s.bets;
    const o = ids(b);
    await wager(ben, s.id, b.id, o["70–74°F"], 200);
    await wager(cat, s.id, b.id, o["65–69°F"], 300);
    await wager(dan, s.id, b.id, o["70–74°F"], 100);
    await wager(ana, s.id, b.id, "75–79°F", 150); // by label works too

    let v = await bet(ana, s.id, b.id);
    assert.deepEqual(v.outcomes.map((x) => x.pool), [0, 0, 300, 300, 150, 0]);

    // The host can't pick a range by hand, report a tie, or enter a mis-precise value.
    await rejects(one(ana.rpc("finish_series_bet", { p_series_id: s.id, p_bet_id: b.id, p_outcome: o["65–69°F"], p_cancel: false })), "invalid_outcome", /picked for you/);
    await rejects(settle(ana, s.id, b.id, 72, { p_outcome: o["70–74°F"] }), "invalid_outcome");
    await rejects(settle(ana, s.id, b.id, null, { p_tied: [o["65–69°F"], o["70–74°F"]] }), "invalid_outcome");
    await rejects(settle(ana, s.id, b.id, null), "invalid_result", /as a number/);
    await rejects(settle(ana, s.id, b.id, 72.5), "invalid_result", /0 decimal places/);
    await rejects(settle(ben, s.id, b.id, 72), "not_host");

    const r = await settle(ana, s.id, b.id, 72);
    assert.equal(r.outcomeId, o["70–74°F"]);
    assert.equal(Number(r.resultValue), 72);
    // Pool 750; 70–74 side 300: Ben 200 → 500, Dan 100 → 250.
    const pay = Object.fromEntries(r.payouts.map((p) => [p.userId, p.gross]));
    assert.deepEqual([pay[ben.id], pay[dan.id], pay[cat.id], pay[ana.id]], [500, 250, 0, 0]);
    v = await bet(ana, s.id, b.id);
    assert.deepEqual([v.status, v.outcomeId, Number(v.resultValue), v.outcome], ["resolved", o["70–74°F"], 72, "70–74°f"]);
    assert.match((await view(ana, s.id)).activity[0].text, /Result 72°F → 70–74°F/);
    assert.deepEqual([await coins(ben, s.id), await coins(dan, s.id), await coins(cat, s.id), await coins(ana, s.id)], [1300, 1150, 700, 850]);
    await rejects(settle(ana, s.id, b.id, 61), "bet_not_open");
  });

  test("exact boundaries go to the range they start; open ends catch everything beyond", async () => {
    const expect = { 59: "Below 60°F", 60: "60–64°F", 64: "60–64°F", 65: "65–69°F", 74: "70–74°F", 75: "75–79°F", 79: "75–79°F", 80: "80°F or above", 135: "80°F or above", [-40]: "Below 60°F" };
    for (const [value, label] of Object.entries(expect)) {
      const s = await running([ana, ben, cat], { bets: 2, list: [TEMP, { question: "Placeholder?" }] });
      const [b] = s.bets;
      const o = ids(b);
      await wager(ben, s.id, b.id, o[label], 10);
      await wager(cat, s.id, b.id, o[label === "Below 60°F" ? "80°F or above" : "Below 60°F"], 10);
      const r = await settle(ana, s.id, b.id, Number(value));
      assert.equal(r.outcomeId, o[label], `${value}°F should land in ${label}`);
    }
  });

  test("decimals and negatives: -5.0 starts its range, 2.49 is refused at 1 place, -12.3 outside closed ends refunds", async () => {
    const C = { question: "Overnight low?", kind: "range", unit: "°C", decimals: 1, ranges: cuts([-10, -5, 0, 2.5], { openBelow: false }) };
    let s = await running([ana, ben, cat], { bets: 2, list: [C, { question: "Placeholder?" }] });
    let [b] = s.bets;
    let o = ids(b);
    await wager(ben, s.id, b.id, o["-5.0 to -0.1°C"], 40);
    await wager(cat, s.id, b.id, o["-10.0 to -5.1°C"], 60);
    await rejects(settle(ana, s.id, b.id, 2.49), "invalid_result", /1 decimal place\./);
    let r = await settle(ana, s.id, b.id, -5);
    assert.equal(r.outcomeId, o["-5.0 to -0.1°C"]);
    assert.equal(Object.fromEntries(r.payouts.map((p) => [p.userId, p.gross]))[ben.id], 100);

    s = await running([ana, ben, cat], { bets: 2, list: [C, { question: "Placeholder?" }] });
    [b] = s.bets;
    o = ids(b);
    await wager(ben, s.id, b.id, o["-5.0 to -0.1°C"], 40);
    await wager(cat, s.id, b.id, o["2.5°C or above"], 60);
    r = await settle(ana, s.id, b.id, -12.3);
    assert.deepEqual([r.refunded, r.outcomeId, Number(r.resultValue)], [true, null, -12.3]);
    assert.ok(r.payouts.every((p) => p.net === 0));
    assert.match((await view(ana, s.id)).activity[0].text, /Result -12\.3°C is outside every range, so coins went back/);
  });

  test("refunds: nobody on the winning range, one range only at lock, and cancel", async () => {
    const s = await running([ana, ben, cat], { bets: 3, list: [TEMP, TEMP, TEMP] });
    const [a, b, c] = s.bets;
    await wager(ben, s.id, a.id, ids(a)["60–64°F"], 50);
    await wager(cat, s.id, a.id, ids(a)["65–69°F"], 50);
    let r = await settle(ana, s.id, a.id, 90);
    assert.deepEqual([r.refunded, r.outcomeId], [true, ids(a)["80°F or above"]]);

    await wager(ben, s.id, b.id, ids(b)["70–74°F"], 50);
    await wager(cat, s.id, b.id, ids(b)["70–74°F"], 25);
    const locked = await one(ana.rpc("lock_series_bet", { p_series_id: s.id, p_bet_id: b.id }));
    assert.deepEqual([locked.status, locked.refunded], ["RESOLVED", true]);

    await wager(ben, s.id, c.id, ids(c)["70–74°F"], 50);
    r = (await one(ana.rpc("finish_series_bet", { p_series_id: s.id, p_bet_id: c.id, p_outcome: null, p_cancel: true }))).finish_series_bet;
    assert.equal(r.status, "CANCELLED");
    assert.deepEqual([await coins(ben, s.id), await coins(cat, s.id)], [1000, 1000]);
  });

  test("wagering rules carry over: no switching ranges, withdraw in the window then repick, no overspending", async () => {
    const s = await running([ana, ben], { bets: 2, list: [TEMP, { question: "Placeholder?" }], settings: { withdrawMinutes: 5 } });
    const [b] = s.bets;
    const o = ids(b);
    await wager(ben, s.id, b.id, o["60–64°F"], 100);
    await rejects(wager(ben, s.id, b.id, o["65–69°F"], 10), "cannot_switch_sides", /You're on 60–64°F/);
    await rejects(wager(ben, s.id, b.id, o["60–64°F"], 901), "insufficient_balance");
    await ben.rpc("withdraw_series_wager", { p_series_id: s.id, p_bet_id: b.id });
    await wager(ben, s.id, b.id, o["65–69°F"], 100);
    assert.deepEqual((await bet(ben, s.id, b.id)).outcomes.map((x) => x.pool), [0, 0, 100, 0, 0, 0]);
  });

  test("concurrent settles with different values pay out once", async () => {
    const s = await running([ana, ben, cat], { bets: 2, list: [TEMP, { question: "Placeholder?" }] });
    const [b] = s.bets;
    await wager(ben, s.id, b.id, ids(b)["70–74°F"], 100);
    await wager(cat, s.id, b.id, ids(b)["Below 60°F"], 100);
    const res = await Promise.allSettled([settle(ana, s.id, b.id, 72), settle(ana, s.id, b.id, 50), settle(ana, s.id, b.id, 73)]);
    assert.equal(res.filter((x) => x.status === "fulfilled").length, 1);
    assert.ok(res.filter((x) => x.status === "rejected").every((x) => x.reason.hint === "bet_not_open"));
    assert.equal((await coins(ben, s.id)) + (await coins(cat, s.id)), 2000);
  });

  test("other bet kinds refuse a number, and still settle by outcome", async () => {
    const s = await running([ana, ben, cat], { bets: 2, list: [{ question: "Who wins?", outcomes: ["Ben", "Cat"] }, { question: "Will it rain?" }] });
    const [mc, yn] = s.bets;
    await rejects(settle(ana, s.id, mc.id, 3), "invalid_result", /Only range bets/);
    await rejects(settle(ana, s.id, yn.id, 1), "invalid_result");
    await wager(ben, s.id, mc.id, ids(mc).Ben, 10);
    await wager(cat, s.id, mc.id, ids(mc).Cat, 10);
    const r = (await one(ana.rpc("finish_series_bet", { p_series_id: s.id, p_bet_id: mc.id, p_outcome: "Cat", p_cancel: false }))).finish_series_bet;
    assert.equal(r.outcomeId, ids(mc).Cat);
  });
});
