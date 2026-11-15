// Idempotent submissions (migration 0017): a repeated submission id never places a
// second wager or creates a second series. Runs against the real migrations in PGlite.
// Run: npm run test:series-sql
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDb } from "./harness.mjs";

let t;
let ana, ben, cat;
before(async () => {
  t = await createDb();
  [ana, ben, cat] = await Promise.all(["Ana", "Ben", "Cat"].map((n) => t.user(n)));
});
after(() => t.close());

const val = async (p) => Object.values((await p)[0])[0];
const rejects = async (p, hint) => {
  await assert.rejects(p, (err) => {
    assert.equal(err.hint, hint, `hint for: ${err.message}`);
    return true;
  });
};
const count = async (sql, params) => (await t.db.query(sql, params)).rows[0].n;

/** An active MONEY series with one open YES/NO bet; Ana and Ben start with 1000 coins. */
async function liveBet() {
  const [s] = await ana.rpc("create_bet_series", {
    p_title: "Idempotency", p_description: "", p_planned_bet_count: 1, p_initial_bankroll: 1000,
    p_loser_count: 1, p_stake_mode: "MONEY", p_questions: ["Rain?"], p_settings: { minContribution: 5 },
  });
  await ben.rpc("join_bet_series", { p_series_id: s.id });
  for (const p of [ana, ben]) await p.rpc("set_series_ready", { p_series_id: s.id, p_ready: true });
  await ana.rpc("start_bet_series", { p_series_id: s.id });
  const [b] = await ana.as("select id from public.series_bets where series_id = $1", [s.id]);
  const outcomes = await ana.as("select id, label from public.series_bet_outcomes where bet_id = $1 order by position", [b.id]);
  return { s, betId: b.id, yes: outcomes[0].id, no: outcomes[1].id };
}
const wager = (who, bet, requestId, outcome, amount) =>
  val(who.rpc("place_series_wager_once", { p_request_id: requestId, p_series_id: bet.s.id, p_bet_id: bet.betId, p_outcome: outcome, p_amount: amount }));
const balance = async (who, bet) => (await t.db.query("select balance from public.bet_series_participants where series_id = $1 and user_id = $2", [bet.s.id, who.id])).rows[0].balance;
const wagerRows = (who, bet) => count("select count(*)::int as n from public.series_wagers where bet_id = $1 and user_id = $2", [bet.betId, who.id]);

describe("wagers", () => {
  test("the same submission twice (double tap, or retry after a lost response) places one wager and returns the same receipt", async () => {
    const bet = await liveBet();
    const id = randomUUID();
    const first = await wager(ana, bet, id, bet.yes, 200);
    assert.deepEqual(
      [first.replayed, first.amount, first.previousStake, first.totalStake, first.addedToExisting, first.available, first.outcome],
      [false, 200, 0, 200, false, 800, "YES"]
    );
    // The response is "lost"; the app retries with the same id.
    const again = await wager(ana, bet, id, bet.yes, 200);
    assert.equal(again.replayed, true);
    assert.deepEqual({ ...again, replayed: false }, first, "a retry gets the original receipt");
    assert.equal(await wagerRows(ana, bet), 1);
    assert.equal(await balance(ana, bet), 800, "coins were taken once");
  });

  test("two identical requests at the same moment still place one wager", async () => {
    const bet = await liveBet();
    const id = randomUUID();
    const results = await Promise.all([wager(ana, bet, id, bet.yes, 150), wager(ana, bet, id, bet.yes, 150)]);
    assert.deepEqual(results.map((r) => r.replayed).sort(), [false, true]);
    assert.equal(results[0].wagerId, results[1].wagerId);
    assert.equal(await wagerRows(ana, bet), 1);
    assert.equal(await balance(ana, bet), 850);
  });

  test("reusing a submission id for a different amount, outcome or bet is refused and changes nothing", async () => {
    const bet = await liveBet();
    const other = await liveBet();
    const id = randomUUID();
    await wager(ana, bet, id, bet.yes, 100);
    await rejects(wager(ana, bet, id, bet.yes, 101), "request_id_reused");
    await rejects(wager(ana, bet, id, bet.no, 100), "request_id_reused");
    await rejects(wager(ana, other, id, other.yes, 100), "request_id_reused");
    // A series created under a wager's id is refused too.
    await rejects(val(ana.rpc("create_bet_series_once", {
      p_request_id: id, p_title: "x", p_description: "", p_planned_bet_count: 1, p_initial_bankroll: 1000,
      p_loser_count: 1, p_stake_mode: "MONEY", p_settings: { minContribution: 5 },
    })), "request_id_reused");
    assert.equal(await wagerRows(ana, bet), 1);
    assert.equal(await wagerRows(ana, other), 0);
    assert.equal(await balance(ana, bet), 900);
    assert.equal(await balance(ana, other), 1000);
  });

  test("separate submissions add to the stake on purpose, and each receipt says what changed", async () => {
    const bet = await liveBet();
    const a = await wager(ana, bet, randomUUID(), bet.yes, 100);
    const b = await wager(ana, bet, randomUUID(), bet.yes, 50);
    assert.deepEqual([a.addedToExisting, a.previousStake, a.totalStake, a.available], [false, 0, 100, 900]);
    assert.deepEqual([b.addedToExisting, b.previousStake, b.totalStake, b.available, b.amount], [true, 100, 150, 850, 50]);
    assert.notEqual(a.wagerId, b.wagerId);
    assert.equal(await balance(ana, bet), 850);
  });

  test("a refused wager leaves no receipt: nothing is taken, and the same id can be tried again", async () => {
    const bet = await liveBet();
    const id = randomUUID();
    await rejects(wager(ana, bet, id, bet.yes, 5000), "insufficient_balance");
    await rejects(wager(ana, bet, id, bet.yes, 5000), "insufficient_balance");
    assert.equal(await count("select count(*)::int as n from public.submission_receipts where request_id = $1", [id]), 0);
    assert.equal(await balance(ana, bet), 1000);
    // Nothing was committed, so the id is still free for the corrected amount.
    const ok = await wager(ana, bet, id, bet.yes, 500);
    assert.deepEqual([ok.replayed, ok.available], [false, 500]);
    // The usual rules still apply through the wrapper.
    await wager(ben, bet, randomUUID(), bet.no, 10);
    await rejects(wager(ben, bet, randomUUID(), bet.yes, 10), "cannot_switch_sides");
    await rejects(wager(cat, bet, randomUUID(), bet.yes, 10), "not_member");
    await rejects(val(ana.rpc("place_series_wager_once", { p_request_id: null, p_series_id: bet.s.id, p_bet_id: bet.betId, p_outcome: bet.yes, p_amount: 1 })), "invalid_request");
  });

  test("submission ids belong to one person: someone else's identical id is their own wager", async () => {
    const bet = await liveBet();
    const id = randomUUID();
    const a = await wager(ana, bet, id, bet.yes, 100);
    const b = await wager(ben, bet, id, bet.yes, 100);
    assert.notEqual(a.wagerId, b.wagerId);
    assert.equal(b.replayed, false);
  });

  test("a retried submission settles once: payouts and balances come out the same as a single wager", async () => {
    const bet = await liveBet();
    const id = randomUUID();
    for (let i = 0; i < 3; i++) await wager(ana, bet, id, bet.yes, 300);
    await wager(ben, bet, randomUUID(), bet.no, 100);
    await ana.rpc("finish_series_bet", { p_series_id: bet.s.id, p_bet_id: bet.betId, p_outcome: bet.yes });
    // Pool 400, all to Ana's 300: she ends at 700 + 400 = 1100; Ben at 900.
    assert.deepEqual([await balance(ana, bet), await balance(ben, bet)], [1100, 900]);
  });

  test("nobody can read or write receipts directly", async () => {
    await assert.rejects(ana.as("select * from public.submission_receipts"));
    await assert.rejects(ana.as("insert into public.submission_receipts(user_id, request_id, action, fingerprint) values ($1, $2, 'place_wager', 'x')", [ana.id, randomUUID()]));
  });
});

describe("series creation", () => {
  const create = (who, requestId, title = "Movie night") =>
    val(who.rpc("create_bet_series_once", {
      p_request_id: requestId, p_title: title, p_description: "", p_planned_bet_count: 2, p_initial_bankroll: 1000,
      p_loser_count: 1, p_stake_mode: "MONEY", p_settings: { minContribution: 5 },
      p_bets: [{ question: "Will it be good?" }, { question: "Who wins?", outcomes: ["A", "B"] }],
    }));
  const hosted = (who) => count("select count(*)::int as n from public.bet_series where host_user_id = $1", [who.id]);

  test("a repeated submission (double click, timeout then retry) creates one series and returns it", async () => {
    const before = await hosted(cat);
    const id = randomUUID();
    const first = await create(cat, id);
    const [second, third] = await Promise.all([create(cat, id), create(cat, id)]);
    assert.equal(first.replayed, false);
    assert.deepEqual([second.replayed, third.replayed], [true, true]);
    assert.equal(second.id, first.id);
    assert.equal(second.invite_code, first.invite_code);
    assert.equal(await hosted(cat), before + 1);
    assert.equal(await count("select count(*)::int as n from public.series_bets where series_id = $1", [first.id]), 2);
  });

  test("different submissions create different series; a reused id with other details is refused", async () => {
    const before = await hosted(cat);
    const a = await create(cat, randomUUID(), "Series A");
    const b = await create(cat, randomUUID(), "Series A");
    assert.notEqual(a.id, b.id, "two separate submissions are two series, even with the same details");
    await rejects(create(cat, (await t.db.query("select request_id from public.submission_receipts where result->>'id' = $1", [a.id])).rows[0].request_id, "Renamed"), "request_id_reused");
    assert.equal(await hosted(cat), before + 2);
  });

  test("a refused creation leaves nothing behind", async () => {
    const before = await hosted(cat);
    const id = randomUUID();
    await rejects(val(cat.rpc("create_bet_series_once", {
      p_request_id: id, p_title: "", p_description: "", p_planned_bet_count: 1, p_initial_bankroll: 1000,
      p_loser_count: 1, p_stake_mode: "MONEY", p_settings: { minContribution: 5 },
    })), "invalid_title");
    assert.equal(await hosted(cat), before);
    assert.equal(await count("select count(*)::int as n from public.submission_receipts where request_id = $1", [id]), 0);
  });
});
