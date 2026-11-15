// Opt-in reminders (migration 0019), against the real migrations in PGlite.
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

const val = async (p) => Object.values((await p)[0])[0];
const mine = (who) => val(who.rpc("my_notifications"));
const prefs = (who, p) => val(who.rpc("set_notification_prefs", p));
/** The reminders about one series (the same people play in several series across these tests). */
const here = (r, series) => r.notifications.filter((n) => n.seriesId === series.id);
const inHours = (h) => new Date(Date.now() + h * 3_600_000).toISOString();

/** Active MONEY series, Ana hosts, Ben and Cat play, with withdrawals allowed for 30 minutes. */
async function liveSeries() {
  const [s] = await ana.rpc("create_bet_series", {
    p_title: "Reminders", p_description: "", p_planned_bet_count: 5, p_initial_bankroll: 1000, p_loser_count: 1,
    p_stake_mode: "MONEY", p_settings: { minContribution: 5, betCreation: "during", withdrawMinutes: 30 },
  });
  for (const p of [ben, cat]) await p.rpc("join_bet_series", { p_series_id: s.id });
  for (const p of [ana, ben, cat]) await p.rpc("set_series_ready", { p_series_id: s.id, p_ready: true });
  await ana.rpc("start_bet_series", { p_series_id: s.id });
  return s;
}
const newBet = async (s, question, closesInHours) =>
  (await ana.rpc("create_series_bet", { p_series_id: s.id, p_question: question, p_closes_at: closesInHours === null ? null : inHours(closesInHours) }))[0];
const bet = (who, s, b, outcome, amount) => who.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: b.id, p_outcome: outcome, p_amount: amount });

describe("reminders", () => {
  test("nobody gets reminders they didn't opt into", async () => {
    const s = await liveSeries();
    await newBet(s, "Closing soon, unasked?", 2);
    // (The first test runs before anyone opts in.)
    const r = await mine(ben);
    assert.deepEqual(r.prefs, { closingBets: false, unresolvedResults: false, punishmentPicks: false });
    assert.deepEqual([r.notifications, r.unread], [[], 0]);
  });

  test("closing bets: only ones you haven't bet on, closing within a day; one reminder each, however often you look", async () => {
    const s = await liveSeries();
    const soon = await newBet(s, "Closes in two hours?", 2);
    await newBet(s, "Closes in two days?", 48);
    await newBet(s, "No deadline?", null);
    const betOn = await newBet(s, "Already bet on?", 3);
    await bet(ben, s, betOn, "YES", 10);
    const r = here(await prefs(ben, { p_closing_bets: true }), s);
    assert.deepEqual(r.map((n) => [n.kind, n.body]), [["closing_bet", "Closes in two hours?"]]);
    assert.ok(Math.abs(Date.parse(r[0].dueAt) - Date.parse(soon.closes_at)) < 1000);
    const again = here(await mine(ben), s);
    const third = here(await mine(ben), s);
    assert.equal(again[0].id, r[0].id);
    assert.equal(third.length, 1);
    assert.equal((await t.db.query("select count(*)::int as n from public.notifications where user_id = $1 and ref_id = $2", [ben.id, soon.id])).rows[0].n, 1);
    // Cat didn't opt in; the host isn't nagged about other people's bets.
    assert.deepEqual(here(await mine(cat), s), []);
  });

  test("doing the action stops the reminder; it only comes back if the action is needed again", async () => {
    const s = await liveSeries();
    const b = await newBet(s, "Bet before Friday?", 5);
    await prefs(cat, { p_closing_bets: true });
    assert.equal(here(await mine(cat), s).length, 1);
    await bet(cat, s, b, "NO", 20);
    assert.deepEqual(here(await mine(cat), s), [], "betting resolves it");
    assert.deepEqual(here(await mine(cat), s), [], "and it stays resolved");
    // Withdrawing makes the action needed again: the same reminder comes back once.
    await cat.rpc("withdraw_series_wager", { p_series_id: s.id, p_bet_id: b.id });
    const back = here(await mine(cat), s);
    assert.equal(back.length, 1);
    assert.equal(back[0].read, false);
    // Closing the bet resolves it too.
    await ana.rpc("lock_series_bet", { p_series_id: s.id, p_bet_id: b.id });
    assert.deepEqual(here(await mine(cat), s), []);
  });

  test("opting out removes pending reminders and stops new ones; opting back in brings them back", async () => {
    const s = await liveSeries();
    await newBet(s, "Opt out test?", 4);
    await prefs(ben, { p_closing_bets: true });
    assert.ok((await mine(ben)).notifications.some((n) => n.body === "Opt out test?"));
    const off = await prefs(ben, { p_closing_bets: false });
    assert.deepEqual(off.notifications.filter((n) => n.kind === "closing_bet"), []);
    await newBet(s, "Another while opted out?", 4);
    assert.deepEqual((await mine(ben)).notifications.filter((n) => n.kind === "closing_bet"), []);
    const on = await prefs(ben, { p_closing_bets: true });
    assert.ok(on.notifications.some((n) => n.body === "Another while opted out?"));
    // Changing one kind leaves the others as they were.
    await prefs(ben, { p_punishment_picks: true });
    assert.deepEqual((await mine(ben)).prefs, { closingBets: true, unresolvedResults: false, punishmentPicks: true });
  });

  test("unresolved results: the host is reminded when a bet closes (manually or at its deadline) until the result is in", async () => {
    const s = await liveSeries();
    const manual = await newBet(s, "Manual close?", null);
    const timed = await newBet(s, "Timed close?", 1);
    for (const b of [manual, timed]) {
      await bet(ben, s, b, "YES", 10);
      await bet(cat, s, b, "NO", 10);
    }
    await prefs(ana, { p_unresolved_results: true });
    assert.deepEqual(here(await mine(ana), s).filter((n) => n.kind === "unresolved_result"), []);
    await ana.rpc("lock_series_bet", { p_series_id: s.id, p_bet_id: manual.id });
    await t.db.query("update public.series_bets set closes_at = clock_timestamp() - interval '1 second' where id = $1", [timed.id]);
    const r = here(await mine(ana), s);
    assert.deepEqual(r.filter((n) => n.kind === "unresolved_result").map((n) => n.body).sort(), ["Manual close?", "Timed close?"]);
    // Players aren't reminded about the host's job.
    await prefs(ben, { p_unresolved_results: true });
    assert.deepEqual(here(await mine(ben), s).filter((n) => n.kind === "unresolved_result"), []);
    for (const b of [manual, timed]) await ana.rpc("finish_series_bet", { p_series_id: s.id, p_bet_id: b.id, p_outcome: "YES" });
    assert.deepEqual(here(await mine(ana), s).filter((n) => n.kind === "unresolved_result"), []);
  });

  test("punishment picks: the winner is reminded on their turn; picking (which is final since 0014) stops it", async () => {
    const [s] = await ana.rpc("create_bet_series", {
      p_title: "Pool", p_description: "", p_planned_bet_count: 1, p_initial_bankroll: 1000, p_loser_count: 1,
      p_stake_mode: "SHARED_FAVOR_POOL", p_questions: ["Gym?"], p_settings: {},
    });
    await ben.rpc("join_bet_series", { p_series_id: s.id });
    const [f1] = await ana.rpc("propose_series_favor", { p_series_id: s.id, p_description: "Cook dinner" });
    const [f2] = await ben.rpc("propose_series_favor", { p_series_id: s.id, p_description: "Wash the car" });
    for (const p of [ana, ben]) await p.rpc("set_series_ready", { p_series_id: s.id, p_ready: true });
    await ana.rpc("start_bet_series", { p_series_id: s.id });
    const [b] = await ana.as("select id from public.series_bets where series_id = $1", [s.id]);
    await ana.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: b.id, p_outcome: "YES", p_amount: 300 });
    await ben.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: b.id, p_outcome: "NO", p_amount: 300 });
    await prefs(ana, { p_punishment_picks: true });
    await prefs(ben, { p_punishment_picks: true });
    assert.deepEqual(here(await mine(ana), s), []);
    await ana.rpc("finish_series_bet", { p_series_id: s.id, p_bet_id: b.id, p_outcome: "YES" });
    // Ana won, so she picks for Ben; Ben (the loser) has nothing to pick.
    const r = here(await mine(ana), s);
    assert.deepEqual(r.map((n) => [n.kind, n.title]), [["punishment_pick", "Pick a punishment for Ben"]]);
    assert.deepEqual(here(await mine(ben), s), []);
    await ana.rpc("assign_series_favor", { p_series_id: s.id, p_loser_id: ben.id, p_favor_id: f1.id });
    assert.deepEqual(here(await mine(ana), s), []);
    assert.deepEqual(here(await mine(ana), s), [], "and it stays resolved");
    assert.ok(f2.id, "the other favor stays in the pool");
  });

  test("unread counts and marking read; reminders are private", async () => {
    const s = await liveSeries();
    await newBet(s, "Unread one?", 2);
    await newBet(s, "Unread two?", 3);
    await prefs(cat, { p_closing_bets: true });
    let r = await mine(cat);
    const ids = r.notifications.filter((n) => n.body.startsWith("Unread")).map((n) => n.id);
    assert.equal(ids.length, 2);
    assert.ok(r.unread >= 2);
    assert.equal(await val(cat.rpc("mark_notifications_read", { p_ids: [ids[0]] })), 1);
    r = await mine(cat);
    assert.deepEqual(r.notifications.filter((n) => ids.includes(n.id)).map((n) => n.read), [true, false]);
    // Someone else can't mark Cat's as read, or see them.
    assert.equal(await val(ben.rpc("mark_notifications_read", { p_ids: ids })), 0);
    await val(cat.rpc("mark_notifications_read"));
    assert.equal((await mine(cat)).unread, 0);
    await assert.rejects(cat.as("select * from public.notifications"));
    await assert.rejects(cat.as("insert into public.notification_prefs(user_id, closing_bets) values ($1, true)", [ben.id]));
  });
});
