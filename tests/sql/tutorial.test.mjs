// Tutorial credits, run against the real migrations in PGlite.
// Run: npm run test:series-sql
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "./harness.mjs";

let t;
let ana, ben;
before(async () => {
  t = await createDb();
  [ana, ben] = await Promise.all(["Ana", "Ben"].map((n) => t.user(n)));
});
after(() => t.close());

const one = async (p) => (await p)[0];
const credits = async (who) => (await one(who.rpc("my_credits"))).my_credits;
const finish = async (who, answers) => (await one(who.rpc("complete_tutorial", { p_answers: answers }))).complete_tutorial;
const RIGHT = { payout: "split", rules: "lobby", bottom: "punishment" };

/** A started two-player series hosted by `host`. Returns the series id. */
async function startSeries(host, other) {
  const s = await one(host.rpc("create_bet_series", {
    p_title: "Credits test", p_description: "", p_planned_bet_count: 1, p_initial_bankroll: 1000, p_loser_count: 1,
    p_stake_mode: "SHARED_FAVOR_POOL", p_questions: ["One?"], p_settings: {},
  }));
  await other.rpc("join_bet_series", { p_series_id: s.id });
  for (const p of [host, other]) await p.rpc("propose_series_favor", { p_series_id: s.id, p_description: `favor from ${p.name}` });
  for (const p of [host, other]) await p.rpc("set_series_ready", { p_series_id: s.id, p_ready: true });
  await host.rpc("start_bet_series", { p_series_id: s.id });
  return s.id;
}
const coins = async (who, id) => {
  const st = (await one(who.rpc("my_series_state"))).my_series_state;
  return st.series.find((x) => x.id === id).standings.find((r) => r.userId === who.id).coins;
};

describe("tutorial credits", () => {
  test("you start with none", async () => {
    assert.deepEqual(await credits(ana), { credits: 0, tutorialDoneAt: null });
  });

  test("wrong quiz answers are refused and give nothing", async () => {
    await assert.rejects(finish(ana, { ...RIGHT, bottom: "money" }), (e) => e.hint === "quiz_wrong");
    await assert.rejects(finish(ana, {}), (e) => e.hint === "quiz_wrong");
    assert.equal((await credits(ana)).credits, 0);
  });

  test("finishing gives 200 credits once", async () => {
    const r = await finish(ana, RIGHT);
    assert.equal(r.awarded, 200);
    assert.equal(r.credits, 200);
    const again = await finish(ana, RIGHT);
    assert.equal(again.awarded, 0);
    assert.equal((await credits(ana)).credits, 200);
    assert.ok((await credits(ana)).tutorialDoneAt);
  });

  test("credits become extra starting coins in the next series that starts, then they're used up", async () => {
    const id = await startSeries(ben, ana);
    assert.equal(await coins(ana, id), 1200);
    assert.equal(await coins(ben, id), 1000);
    assert.equal((await credits(ana)).credits, 0);
    // Replaying after spending the original award must never refill credits.
    assert.equal((await finish(ana, RIGHT)).awarded, 0);
    assert.equal((await credits(ana)).credits, 0);

    const next = await startSeries(ben, ana);
    assert.equal(await coins(ana, next), 1000);
  });

  test("nobody can give themselves credits directly", async () => {
    await assert.rejects(ana.as("update public.player_profiles set credits = 9999"));
    await assert.rejects(ana.rpc("_tc_apply_credits"));
  });
});
