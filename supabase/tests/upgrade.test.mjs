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
