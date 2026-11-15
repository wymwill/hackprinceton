// Bet close times (migration 0015), run against the real migrations in PGlite.
// Run: npm run test:series-sql
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "./harness.mjs";

let t;
let ana, ben, cat;
before(async () => {
  t = await createDb();
  [ana, ben, cat] = await Promise.all(["Ana", "Ben", "Cat"].map((n) => t.user(n)));
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
const inMinutes = (m) => new Date(Date.now() + m * 60_000).toISOString();
const view = async (who, id) => (await one(who.rpc("my_series_state"))).my_series_state.series.find((s) => s.id === id);
const bet = async (who, id, betId) => (await view(who, id)).bets.find((b) => b.id === betId);
const wager = (who, id, betId, outcome, amount) => who.rpc("place_series_wager", { p_series_id: id, p_bet_id: betId, p_outcome: outcome, p_amount: amount });
const setClose = (who, id, betId, at) => who.rpc("set_series_bet_close", { p_series_id: id, p_bet_id: betId, p_closes_at: at });
/** Pretend the close time passed: move it into the past directly, since the clock can't be moved. */
const pastClose = (betId) => t.db.query("update public.series_bets set closes_at = now() - interval '1 minute' where id = $1", [betId]);

async function running(settings = {}) {
  const s = await one(
    ana.rpc("create_bet_series", {
      p_title: "Weekend", p_description: "", p_planned_bet_count: 3, p_initial_bankroll: 1000, p_loser_count: 1,
      p_stake_mode: "MONEY", p_questions: ["Will it rain?", "Will the game go to overtime?"], p_settings: { minContribution: 5, withdrawMinutes: 30, ...settings },
    })
  );
  return s;
}
async function start(s) {
  for (const p of [ben, cat]) await p.rpc("join_bet_series", { p_series_id: s.id });
  for (const p of [ana, ben, cat]) await p.rpc("set_series_ready", { p_series_id: s.id, p_ready: true });
  await one(ana.rpc("start_bet_series", { p_series_id: s.id }));
  return (await view(ana, s.id)).bets;
}

describe("bet close times", () => {
  test("the host sets one on a draft bet in the lobby; everyone sees closesAt, and it's null when unset", async () => {
    const s = await running();
    const [rain, ot] = (await view(ana, s.id)).bets;
    const at = inMinutes(120);
    const r = (await one(setClose(ana, s.id, rain.id, at))).set_series_bet_close;
    assert.equal(r.closesAt, at);
    const seen = await view(ana, s.id);
    assert.equal(seen.bets[0].closesAt, at);
    assert.equal(seen.bets[1].closesAt, null);
    assert.equal(seen.bets[0].status, "draft");
    assert.equal(ot.status, "draft");
  });

  test("only the host, only in the future, only within a year", async () => {
    const s = await running();
    const [rain] = (await view(ana, s.id)).bets;
    await ben.rpc("join_bet_series", { p_series_id: s.id });
    await rejects(setClose(ben, s.id, rain.id, inMinutes(60)), "not_host");
    await rejects(setClose(ana, s.id, rain.id, inMinutes(-5)), "invalid_close_time", /future/);
    await rejects(setClose(ana, s.id, rain.id, inMinutes(60 * 24 * 400)), "invalid_close_time", /within a year/);
  });

  test("before the close time wagers work; after it, wagers and withdrawals are refused and the bet reads as closed", async () => {
    const s = await running();
    const [rain, ot] = await start(s);
    await one(setClose(ana, s.id, rain.id, inMinutes(30)));
    await wager(ben, s.id, rain.id, "YES", 100);
    await wager(cat, s.id, rain.id, "NO", 50);
    assert.equal((await bet(ana, s.id, rain.id)).status, "open");

    await pastClose(rain.id);
    await rejects(wager(cat, s.id, rain.id, "NO", 10), "bet_not_open", /closing time/);
    await rejects(ben.rpc("withdraw_series_wager", { p_series_id: s.id, p_bet_id: rain.id }), "bet_not_open");
    const closed = await bet(ana, s.id, rain.id);
    assert.equal(closed.status, "closed");
    assert.equal(closed.closedAt, closed.closesAt);
    // Coins stayed where they were: Ben 900 free + 100 in play.
    assert.equal((await view(ben, s.id)).standings.find((r) => r.userId === ben.id).coins, 1000);
    // A bet without a close time is unaffected.
    await wager(cat, s.id, ot.id, "YES", 20);
    assert.equal((await bet(ana, s.id, ot.id)).status, "open");
  });

  test("the host still resolves a bet after its close time, and can't move a time that has passed", async () => {
    const s = await running();
    const [rain] = await start(s);
    await one(setClose(ana, s.id, rain.id, inMinutes(10)));
    await wager(ben, s.id, rain.id, "YES", 100);
    await wager(cat, s.id, rain.id, "NO", 100);
    await pastClose(rain.id);
    await rejects(setClose(ana, s.id, rain.id, inMinutes(60)), "bet_not_open");
    const r = (await one(ana.rpc("finish_series_bet", { p_series_id: s.id, p_bet_id: rain.id, p_outcome: "YES", p_cancel: false }))).finish_series_bet;
    assert.ok(r);
    const done = await bet(ana, s.id, rain.id);
    assert.equal(done.status, "resolved");
    assert.equal(done.outcome, "yes");
  });

  test("an open bet's close time can be moved or removed, and the change is logged", async () => {
    const s = await running();
    const [rain] = await start(s);
    await one(setClose(ana, s.id, rain.id, inMinutes(10)));
    await one(setClose(ana, s.id, rain.id, inMinutes(90)));
    await one(setClose(ana, s.id, rain.id, null));
    assert.equal((await bet(ana, s.id, rain.id)).closesAt, null);
    const log = (await view(ana, s.id)).activity.map((a) => a.text ?? a.message ?? "");
    assert.ok(log.some((m) => /Closing time set: Will it rain\?/.test(m)), JSON.stringify(log.slice(0, 5)));
    assert.ok(log.some((m) => /No closing time any more: Will it rain\?/.test(m)));
  });
});
