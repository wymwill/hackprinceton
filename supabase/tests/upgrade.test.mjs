// The live project already ran migrations 0001–0006 and may hold series made with
// them. Migration 0007 has to keep that data working.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "./harness.mjs";

test("0007 upgrades a database that already has a running series", async () => {
  const t = await createDb({ upTo: "202611140007" });
  const [host, friend, third] = await Promise.all(["Old Host", "Old Friend", "Old Third"].map((n) => t.user(n)));
  // Made with the 0006 functions: questions at creation, consent by others, one bet settled, one open.
  const [s] = await host.rpc("create_bet_series", {
    p_title: "Old", p_description: "", p_planned_bet_count: 2, p_initial_bankroll: 1000,
    p_loser_count: 1, p_stake_mode: "SHARED_FAVOR_POOL", p_questions: ["Q one?", "Q two?"],
  });
  await friend.rpc("join_bet_series", { p_series_id: s.id });
  await third.rpc("join_bet_series", { p_series_id: s.id });
  const [fav] = await host.rpc("propose_series_favor", { p_series_id: s.id, p_description: "host favor" });
  await third.rpc("consent_series_favor", { p_favor_id: fav.id, p_consent: true });
  await host.rpc("start_bet_series", { p_series_id: s.id });
  const bets = await host.as("select id from public.series_bets where series_id = $1 order by position", [s.id]);
  await host.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: bets[0].id, p_outcome: "YES", p_amount: 100 });
  await third.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: bets[0].id, p_outcome: "NO", p_amount: 100 });
  await host.rpc("finish_series_bet", { p_series_id: s.id, p_bet_id: bets[0].id, p_outcome: "YES", p_cancel: false });
  await host.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: bets[1].id, p_outcome: "NO", p_amount: 50 });

  await t.migrate();

  const state = async () => (await host.rpc("my_series_state"))[0].my_series_state.series[0];
  let v = await state();
  assert.match(v.code, /^[A-Z2-9]{6}$/);
  assert.equal(v.status, "active");
  assert.deepEqual(v.members.map((m) => m.name), ["Old Host", "Old Friend", "Old Third"]);
  // Host: 1,100 settled with 50 riding; Friend untouched; Third lost 100.
  assert.deepEqual(v.standings.map((r) => [r.coins, r.atStake, r.available]), [[1100, 50, 1050], [1000, 0, 1000], [900, 0, 900]]);
  assert.deepEqual(v.favors[0].agreedBy, [third.id]);

  // Old bets keep settling under the new rules, and the series ends by itself.
  await third.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: bets[1].id, p_outcome: "YES", p_amount: 50 });
  await host.rpc("finish_series_bet", { p_series_id: s.id, p_bet_id: bets[1].id, p_outcome: "NO", p_cancel: false });
  v = await state();
  assert.equal(v.status, "assigning");
  assert.deepEqual(v.standings.map((r) => [r.coins, r.losing]), [[1150, false], [1000, false], [850, true]]);
  assert.deepEqual(v.assignments.map((a) => [a.chooserId, a.loserId, a.status]), [[host.id, third.id, "picking"]]);
  await t.close();
});

// Migration 0009 (multiple-choice bets) runs on a project that already has YES/NO series.
test("0009 turns existing bets into YES/NO bets with outcome ids, and they keep working", async () => {
  const t = await createDb({ upTo: "202611140009" });
  const [host, friend, third] = await Promise.all(["Host 8", "Friend 8", "Third 8"].map((n) => t.user(n)));
  // Made with the 0007/0008 functions: one bet settled, one open with wagers, one still a draft in a second series.
  const [s] = await host.rpc("create_bet_series", {
    p_title: "Before 0009", p_description: "", p_planned_bet_count: 2, p_initial_bankroll: 1000,
    p_loser_count: 1, p_stake_mode: "MONEY", p_questions: ["Settled?", "Still open?"], p_settings: { minContribution: 5 },
  });
  for (const p of [friend, third]) await p.rpc("join_bet_series", { p_series_id: s.id });
  for (const p of [host, friend, third]) await p.rpc("set_series_ready", { p_series_id: s.id, p_ready: true });
  await host.rpc("start_bet_series", { p_series_id: s.id });
  const bets = await host.as("select id from public.series_bets where series_id = $1 order by position", [s.id]);
  await friend.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: bets[0].id, p_outcome: "YES", p_amount: 100 });
  await third.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: bets[0].id, p_outcome: "NO", p_amount: 100 });
  await host.rpc("finish_series_bet", { p_series_id: s.id, p_bet_id: bets[0].id, p_outcome: "YES", p_cancel: false });
  await friend.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: bets[1].id, p_outcome: "NO", p_amount: 50 });
  await third.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: bets[1].id, p_outcome: "YES", p_amount: 25 });
  const [lobby] = await host.rpc("create_bet_series", {
    p_title: "Lobby before 0009", p_description: "", p_planned_bet_count: 1, p_initial_bankroll: 1000,
    p_loser_count: 1, p_stake_mode: "MONEY", p_questions: ["Draft?"], p_settings: { minContribution: 5 },
  });

  await t.migrate();

  const all = (await host.rpc("my_series_state"))[0].my_series_state.series;
  let v = all.find((x) => x.id === s.id);
  const [done, open] = v.bets;
  for (const b of [done, open]) {
    assert.equal(b.kind, "binary");
    assert.deepEqual(b.outcomes.map((o) => [o.label, o.position]), [["YES", 1], ["NO", 2]]);
  }
  const yes = (b) => b.outcomes.find((o) => o.label === "YES").id;
  const no = (b) => b.outcomes.find((o) => o.label === "NO").id;
  // Settled bet: winner, results and wagers all point at outcome ids; the old text is still there.
  assert.equal(done.outcomeId, yes(done));
  assert.equal(done.outcome, "yes");
  assert.deepEqual(Object.fromEntries(done.results.map((r) => [r.userId, [r.outcomeId, r.net]])), { [friend.id]: [yes(done), 100], [third.id]: [no(done), -100] });
  // Open bet: pools come from the linked wagers.
  assert.deepEqual(open.outcomes.map((o) => o.pool), [25, 50]);
  assert.deepEqual(Object.fromEntries(open.wagers.map((w) => [w.userId, [w.outcomeId, w.side]])), { [friend.id]: [no(open), "no"], [third.id]: [yes(open), "yes"] });
  // No wager is left without an outcome id.
  assert.equal((await t.db.query("select count(*)::int as n from public.series_wagers where outcome_id is null")).rows[0].n, 0);

  // The open bet still takes wagers by label and settles with the old call.
  await friend.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: bets[1].id, p_outcome: "NO", p_amount: 25 });
  await assert.rejects(third.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: bets[1].id, p_outcome: "NO", p_amount: 5 }), (e) => e.hint === "cannot_switch_sides");
  await host.rpc("finish_series_bet", { p_series_id: s.id, p_bet_id: bets[1].id, p_outcome: "NO", p_cancel: false });
  v = (await host.rpc("my_series_state"))[0].my_series_state.series.find((x) => x.id === s.id);
  // Friend: +100 then wins 100 back on a 100-coin pool (75 on NO) = 1000 + 100 + 25 = 1125; Third: -100 - 25 = 875.
  assert.deepEqual(Object.fromEntries(v.standings.map((r) => [r.userId, r.coins])), { [friend.id]: 1125, [host.id]: 1000, [third.id]: 875 });
  assert.equal(v.status, "finished");

  // A lobby draft from before 0009 can be turned into a multiple-choice bet.
  const draft = all.find((x) => x.id === lobby.id).bets[0];
  const [edited] = await host.rpc("update_series_bet", { p_series_id: lobby.id, p_bet_id: draft.id, p_outcomes: ["Red", "Blue", "Green"] });
  assert.equal(edited.kind, "MULTI");
  await t.close();
});

// Migration 0010 (range bets) runs on a project that already has YES/NO and multiple-choice bets.
test("0010 keeps YES/NO and multiple-choice bets working and adds range bets", async () => {
  const t = await createDb({ upTo: "202611140010" });
  const [host, friend, third] = await Promise.all(["Host 9", "Friend 9", "Third 9"].map((n) => t.user(n)));
  // Made with the 0009 functions.
  const [s] = await host.rpc("create_bet_series", {
    p_title: "Before 0010", p_description: "", p_planned_bet_count: 3, p_initial_bankroll: 1000, p_loser_count: 1,
    p_stake_mode: "MONEY", p_questions: [], p_settings: { minContribution: 5, betCreation: "during" },
    p_bets: [{ question: "Who wins the bake-off?", outcomes: ["Ann", "Bo", "Cy"], tieRule: "first_listed" }, { question: "Will it rain?" }],
  });
  for (const p of [friend, third]) await p.rpc("join_bet_series", { p_series_id: s.id });
  for (const p of [host, friend, third]) await p.rpc("set_series_ready", { p_series_id: s.id, p_ready: true });
  await host.rpc("start_bet_series", { p_series_id: s.id });
  const read = async () => (await host.rpc("my_series_state"))[0].my_series_state.series.find((x) => x.id === s.id);
  let v = await read();
  const [mc, yn] = v.bets;
  const o = Object.fromEntries(mc.outcomes.map((x) => [x.label, x.id]));
  await friend.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: mc.id, p_outcome: o.Bo, p_amount: 100 });
  await third.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: mc.id, p_outcome: o.Cy, p_amount: 50 });
  await friend.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: yn.id, p_outcome: "YES", p_amount: 40 });
  await third.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: yn.id, p_outcome: "NO", p_amount: 40 });
  await host.rpc("finish_series_bet", { p_series_id: s.id, p_bet_id: yn.id, p_outcome: "NO", p_cancel: false });

  await t.migrate();

  v = await read();
  assert.deepEqual(v.bets.map((b) => [b.kind, b.unit, b.decimals, b.resultValue]), [["multi", null, null, null], ["binary", null, null, null]]);
  assert.ok(v.bets[0].outcomes.every((x) => x.lower === null && x.upper === null));
  // The open multiple-choice bet still takes a tie under its old rule, via the same call.
  const [r] = await host.rpc("finish_series_bet", { p_series_id: s.id, p_bet_id: mc.id, p_outcome: null, p_cancel: false, p_tied: [o.Cy, o.Bo] });
  assert.equal(r.finish_series_bet.outcomeId, o.Bo);
  v = await read();
  assert.deepEqual(Object.fromEntries(v.standings.map((x) => [x.userId, x.coins])), { [friend.id]: 1010, [third.id]: 990, [host.id]: 1000 });
  // And range bets work in the same series.
  const [rb] = await host.rpc("create_series_bet", {
    p_series_id: s.id, p_question: "High tomorrow?", p_kind: "range", p_unit: "°F", p_decimals: 0,
    p_ranges: [{ lower: null, upper: 60 }, { lower: 60, upper: 70 }, { lower: 70, upper: null }],
  });
  assert.equal(rb.kind, "RANGE");
  await t.close();
});
