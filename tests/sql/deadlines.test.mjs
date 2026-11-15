// Scheduled bet closing (migration 0018), against the real migrations in PGlite.
// Time passing is simulated by moving a bet's deadline into the past.
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
const rejects = async (p, hint, message) => {
  await assert.rejects(p, (err) => {
    assert.equal(err.hint, hint, `hint for: ${err.message}`);
    if (message) assert.match(err.message, message);
    return true;
  });
};
const inMinutes = (m) => new Date(Date.now() + m * 60_000).toISOString();
/** Pretend time has passed: the deadline is now `ms` ago. */
const expire = (betId, ms = 1) => t.db.query("update public.series_bets set closes_at = clock_timestamp() - make_interval(secs => $2::float / 1000) where id = $1", [betId, ms]);
const row = async (betId) => (await t.db.query("select status, closes_at, closed_at, refunded from public.series_bets where id = $1", [betId])).rows[0];
const shown = async (who, seriesId, betId) => (await val(who.rpc("my_series_state"))).series.find((x) => x.id === seriesId).bets.find((b) => b.id === betId);
const coins = async (who, seriesId) => (await t.db.query("select balance from public.bet_series_participants where series_id = $1 and user_id = $2", [seriesId, who.id])).rows[0].balance;

/** An active MONEY series (Ana hosts, Ben plays) with one open YES/NO bet that closes in `minutes`. */
async function liveBet(minutes = 60) {
  const [s] = await ana.rpc("create_bet_series", {
    p_title: "Deadlines", p_description: "", p_planned_bet_count: 3, p_initial_bankroll: 1000,
    p_loser_count: 1, p_stake_mode: "MONEY", p_settings: { minContribution: 5, betCreation: "during" },
  });
  await ben.rpc("join_bet_series", { p_series_id: s.id });
  for (const p of [ana, ben]) await p.rpc("set_series_ready", { p_series_id: s.id, p_ready: true });
  await ana.rpc("start_bet_series", { p_series_id: s.id });
  const [b] = await ana.rpc("create_series_bet", { p_series_id: s.id, p_question: "Rain by Friday?", p_closes_at: minutes === null ? null : inMinutes(minutes) });
  const outcomes = await ana.as("select id, label from public.series_bet_outcomes where bet_id = $1 order by position", [b.id]);
  return { s, b, yes: outcomes[0].id, no: outcomes[1].id };
}
const wager = (who, x, outcome, amount, requestId) =>
  requestId
    ? val(who.rpc("place_series_wager_once", { p_request_id: requestId, p_series_id: x.s.id, p_bet_id: x.b.id, p_outcome: outcome, p_amount: amount }))
    : who.rpc("place_series_wager", { p_series_id: x.s.id, p_bet_id: x.b.id, p_outcome: outcome, p_amount: amount });

describe("deadlines", () => {
  test("a bet can be created with a deadline; it shows the deadline and is open until then", async () => {
    const x = await liveBet(90);
    const b = await shown(ben, x.s.id, x.b.id);
    assert.equal(b.status, "open");
    assert.ok(Math.abs(Date.parse(b.closesAt) - (Date.now() + 90 * 60_000)) < 5000);
    await wager(ben, x, x.no, 100);
    assert.equal((await row(x.b.id)).status, "OPEN");
  });

  test("bets without a deadline work as before", async () => {
    const x = await liveBet(null);
    assert.equal((await shown(ana, x.s.id, x.b.id)).closesAt, null);
    await wager(ben, x, x.yes, 10);
    await wager(ana, x, x.no, 10);
    await ana.rpc("lock_series_bet", { p_series_id: x.s.id, p_bet_id: x.b.id });
    assert.equal((await row(x.b.id)).status, "LOCKED");
  });

  test("deadlines in the past, too far ahead, or without a timezone are refused", async () => {
    const x = await liveBet(null);
    await rejects(ana.rpc("create_series_bet", { p_series_id: x.s.id, p_question: "Late one?", p_closes_at: inMinutes(-1) }), "invalid_deadline", /future/);
    await rejects(ana.rpc("create_series_bet", { p_series_id: x.s.id, p_question: "Far one?", p_closes_at: inMinutes(60 * 24 * 400) }), "invalid_deadline", /year/);
    const create = (closesAt) => ana.rpc("create_bet_series", {
      p_title: "Bad deadline", p_description: "", p_planned_bet_count: 1, p_initial_bankroll: 1000, p_loser_count: 1, p_stake_mode: "MONEY",
      p_settings: { minContribution: 5 }, p_bets: [{ question: "Will it work?", closesAt }],
    });
    await rejects(create("2031-03-01T12:00:00"), "invalid_deadline", /timezone/);
    await rejects(create("not a date"), "invalid_deadline");
    await rejects(create(inMinutes(-5)), "invalid_deadline");
  });

  test("a wager just before the deadline counts; one just after is refused, with no host action", async () => {
    const x = await liveBet(60);
    await t.db.query("update public.series_bets set closes_at = clock_timestamp() + interval '2 seconds' where id = $1", [x.b.id]);
    await wager(ben, x, x.yes, 100);
    await expire(x.b.id, 1);
    await rejects(wager(ben, x, x.yes, 50), "bet_not_open", /closed at/);
    await rejects(wager(ana, x, x.no, 50), "bet_not_open");
    assert.equal(await coins(ben, x.s.id), 900, "only the wager before the deadline was taken");
  });

  test("an expired bet reads as closed for everyone right away, before anything has closed it", async () => {
    const x = await liveBet(60);
    await expire(x.b.id, 5000);
    assert.equal((await row(x.b.id)).status, "OPEN", "nothing has written the close yet");
    const b = await shown(ben, x.s.id, x.b.id);
    assert.equal(b.status, "closed");
    assert.equal(b.closedAt, b.closesAt, "closed as of the deadline");
  });

  test("a scheduler that runs late (or a server that restarted) changes nothing: late wagers are still refused, and closing uses the deadline time", async () => {
    const x = await liveBet(60);
    await wager(ben, x, x.yes, 100);
    await wager(ana, x, x.no, 100);
    // The deadline passed a day ago and no job ran.
    await expire(x.b.id, 24 * 3600 * 1000);
    await rejects(wager(ben, x, x.yes, 10), "bet_not_open");
    // The state read (which the API does on every load) makes it permanent.
    // (It also closes any other expired bets in Ben's series, so count at least this one.)
    assert.ok((await val(ben.rpc("close_due_bets"))) >= 1);
    const r = await row(x.b.id);
    assert.equal(r.status, "LOCKED");
    assert.equal(r.closed_at.getTime(), r.closes_at.getTime(), "closed_at is the deadline, not when the job ran");
    // Closing again (another tab, the cron job) is harmless.
    assert.equal(await val(ana.rpc("close_due_bets")), 0);
    assert.equal(Object.values((await t.db.query("select public._bs_close_all_due()")).rows[0])[0], 0);
    // The host can still settle it.
    await ana.rpc("finish_series_bet", { p_series_id: x.s.id, p_bet_id: x.b.id, p_outcome: x.yes });
    assert.equal((await row(x.b.id)).status, "RESOLVED");
  });

  test("closing at the deadline refunds a one-sided pool, as a manual close does", async () => {
    const x = await liveBet(60);
    await wager(ben, x, x.yes, 100);
    await expire(x.b.id);
    assert.equal(Object.values((await t.db.query("select public._bs_close_all_due()")).rows[0])[0], 1);
    const r = await row(x.b.id);
    assert.deepEqual([r.status, r.refunded], ["RESOLVED", true]);
    assert.equal(await coins(ben, x.s.id), 1000);
  });

  test("the host can still close early; the deadline then changes nothing", async () => {
    const x = await liveBet(60);
    await wager(ben, x, x.yes, 100);
    await wager(ana, x, x.no, 50);
    await ana.rpc("lock_series_bet", { p_series_id: x.s.id, p_bet_id: x.b.id });
    const closed = (await row(x.b.id)).closed_at;
    await expire(x.b.id);
    assert.equal(await val(ben.rpc("close_due_bets")), 0);
    assert.equal((await row(x.b.id)).closed_at.getTime(), closed.getTime());
    assert.equal((await shown(ben, x.s.id, x.b.id)).status, "closed");
  });

  test("closing and wagering can't interleave: whichever takes the series lock first wins, and the other sees its result", async () => {
    const x = await liveBet(60);
    await expire(x.b.id);
    // The close and two wagers race; PGlite runs them one at a time, in whichever order they arrive.
    const results = await Promise.allSettled([ben.rpc("close_due_bets"), wager(ben, x, x.yes, 10), wager(ana, x, x.no, 10)]);
    assert.ok(results.slice(1).every((r) => r.status === "rejected" && r.reason.hint === "bet_not_open"));
    assert.equal(await coins(ben, x.s.id), 1000);
    assert.equal((await t.db.query("select count(*)::int as n from public.series_wagers where bet_id = $1", [x.b.id])).rows[0].n, 0);
  });

  test("withdrawals after the deadline are refused", async () => {
    const [s] = await ana.rpc("create_bet_series", {
      p_title: "Withdrawals", p_description: "", p_planned_bet_count: 1, p_initial_bankroll: 1000, p_loser_count: 1,
      p_stake_mode: "MONEY", p_settings: { minContribution: 5, betCreation: "during", withdrawMinutes: 30 },
    });
    await ben.rpc("join_bet_series", { p_series_id: s.id });
    for (const p of [ana, ben]) await p.rpc("set_series_ready", { p_series_id: s.id, p_ready: true });
    await ana.rpc("start_bet_series", { p_series_id: s.id });
    const [b] = await ana.rpc("create_series_bet", { p_series_id: s.id, p_question: "Snow today?", p_closes_at: inMinutes(60) });
    await ben.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: b.id, p_outcome: "YES", p_amount: 100 });
    await ana.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: b.id, p_outcome: "NO", p_amount: 100 });
    await expire(b.id);
    await rejects(ben.rpc("withdraw_series_wager", { p_series_id: s.id, p_bet_id: b.id }), "bet_not_open");
  });

  test("the same instant whatever timezone it's written in, and whatever the database's timezone", async () => {
    // Midnight UTC a month from now, written three ways.
    const d = new Date(Date.now() + 30 * 86_400_000);
    d.setUTCHours(0, 0, 0, 0);
    const at = (offsetMin) => {
      const local = new Date(d.getTime() + offsetMin * 60_000).toISOString().slice(0, 19);
      const sign = offsetMin < 0 ? "-" : "+";
      const abs = Math.abs(offsetMin);
      return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
    };
    const tokyo = at(9 * 60);
    const utc = d.toISOString().replace(".000Z", "Z");
    const la = at(-8 * 60);
    const [s] = await ana.rpc("create_bet_series", {
      p_title: "Zones", p_description: "", p_planned_bet_count: 3, p_initial_bankroll: 1000, p_loser_count: 1, p_stake_mode: "MONEY",
      p_settings: { minContribution: 5 }, p_bets: [{ question: "Tokyo time?", closesAt: tokyo }, { question: "UTC time?", closesAt: utc }, { question: "LA time?", closesAt: la }],
    });
    const rows = (await t.db.query("select closes_at from public.series_bets where series_id = $1 order by position", [s.id])).rows;
    assert.deepEqual(rows.map((r) => r.closes_at.toISOString()), [utc, utc, utc].map((d) => new Date(d).toISOString()));
    await t.db.exec("set timezone = 'America/Los_Angeles'");
    try {
      const bets = (await val(ana.rpc("my_series_state"))).series.find((x) => x.id === s.id).bets;
      assert.deepEqual(bets.map((b) => Date.parse(b.closesAt)), [Date.parse(utc), Date.parse(utc), Date.parse(utc)]);
    } finally {
      await t.db.exec("set timezone = 'UTC'");
    }
  });

  test("drafts: a deadline that passes before betting starts blocks the start until it's changed", async () => {
    const [s] = await ana.rpc("create_bet_series", {
      p_title: "Draft deadline", p_description: "", p_planned_bet_count: 1, p_initial_bankroll: 1000, p_loser_count: 1, p_stake_mode: "MONEY",
      p_settings: { minContribution: 5 }, p_bets: [{ question: "Quick one?", closesAt: inMinutes(30) }],
    });
    await ben.rpc("join_bet_series", { p_series_id: s.id });
    for (const p of [ana, ben]) await p.rpc("set_series_ready", { p_series_id: s.id, p_ready: true });
    const [b] = await ana.as("select id from public.series_bets where series_id = $1", [s.id]);
    await expire(b.id);
    await rejects(ana.rpc("start_bet_series", { p_series_id: s.id }), "invalid_deadline", /closes before betting would start/);
    await rejects(ben.rpc("set_series_bet_deadline", { p_series_id: s.id, p_bet_id: b.id, p_closes_at: inMinutes(60) }), "not_host");
    await ana.rpc("set_series_bet_deadline", { p_series_id: s.id, p_bet_id: b.id, p_closes_at: inMinutes(60) });
    await ana.rpc("start_bet_series", { p_series_id: s.id });
    assert.equal((await row(b.id)).status, "OPEN");
  });

  test("the host can move or clear a deadline while the bet is open, not after it closed", async () => {
    const x = await liveBet(60);
    await ana.rpc("set_series_bet_deadline", { p_series_id: x.s.id, p_bet_id: x.b.id, p_closes_at: inMinutes(180) });
    assert.ok(Date.parse((await shown(ben, x.s.id, x.b.id)).closesAt) > Date.now() + 170 * 60_000);
    await ana.rpc("set_series_bet_deadline", { p_series_id: x.s.id, p_bet_id: x.b.id, p_closes_at: null });
    assert.equal((await shown(ben, x.s.id, x.b.id)).closesAt, null);
    await ana.rpc("set_series_bet_deadline", { p_series_id: x.s.id, p_bet_id: x.b.id, p_closes_at: inMinutes(5) });
    await expire(x.b.id);
    // Too late to reopen it by moving the deadline.
    await rejects(ana.rpc("set_series_bet_deadline", { p_series_id: x.s.id, p_bet_id: x.b.id, p_closes_at: inMinutes(60) }), "bet_not_open");
  });

  test("works with at-most-once wagers and series: no receipt for a refused late wager; a committed one still replays after the deadline", async () => {
    const x = await liveBet(60);
    const id = randomUUID();
    const first = await wager(ben, x, x.yes, 100, id);
    await expire(x.b.id);
    const replay = await wager(ben, x, x.yes, 100, id);
    assert.deepEqual([replay.replayed, replay.wagerId], [true, first.wagerId]);
    const late = randomUUID();
    await rejects(wager(ben, x, x.yes, 50, late), "bet_not_open");
    assert.equal((await t.db.query("select count(*)::int as n from public.submission_receipts where request_id = $1", [late])).rows[0].n, 0);
    // Series created at most once, with its deadlines, however often it's sent.
    const sid = randomUUID();
    const args = {
      p_request_id: sid, p_title: "Once with deadlines", p_description: "", p_planned_bet_count: 1, p_initial_bankroll: 1000,
      p_loser_count: 1, p_stake_mode: "MONEY", p_settings: { minContribution: 5 }, p_bets: [{ question: "Deadline kept?", closesAt: inMinutes(45) }],
    };
    const a = await val(cat.rpc("create_bet_series_once", args));
    const b = await val(cat.rpc("create_bet_series_once", args));
    assert.equal(b.id, a.id);
    const rows = (await t.db.query("select closes_at from public.series_bets where series_id = $1", [a.id])).rows;
    assert.equal(rows.length, 1);
    assert.ok(rows[0].closes_at);
  });
});
