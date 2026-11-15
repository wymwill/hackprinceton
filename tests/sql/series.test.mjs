// The Bet Series rules, run against the real migrations in PGlite.
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

/** Create a series as `host`. `mode` is the stake mode; `settings` go in p_settings. */
async function create(host, { title = "Test series", bets = 2, coins = 1000, losers = 1, mode = "SHARED_FAVOR_POOL", questions = [], settings = {} } = {}) {
  return one(host.rpc("create_bet_series", {
    p_title: title, p_description: "Placeholder placeholder", p_planned_bet_count: bets, p_initial_bankroll: coins,
    p_loser_count: losers, p_stake_mode: mode, p_questions: questions, p_settings: settings,
  }));
}
const state = async (who) => (await one(who.rpc("my_series_state"))).my_series_state;
const view = async (who, id) => (await state(who)).series.find((s) => s.id === id);
const balance = async (who, id) => (await view(who, id)).standings.find((r) => r.userId === who.id);
const join = (who, id) => who.rpc("join_bet_series", { p_series_id: id });
const favor = (who, id, text) => one(who.rpc("propose_series_favor", { p_series_id: id, p_description: text }));
const ready = (who, id, on = true) => who.rpc("set_series_ready", { p_series_id: id, p_ready: on });
const start = (who, id) => one(who.rpc("start_bet_series", { p_series_id: id }));
const addBet = (who, id, q) => one(who.rpc("create_series_bet", { p_series_id: id, p_question: q }));
const wager = (who, id, betId, side, amount) =>
  one(who.rpc("place_series_wager", { p_series_id: id, p_bet_id: betId, p_outcome: side, p_amount: amount }));
const resolve = async (who, id, betId, outcome) =>
  (await one(who.rpc("finish_series_bet", { p_series_id: id, p_bet_id: betId, p_outcome: outcome, p_cancel: false }))).finish_series_bet;
const cancel = async (who, id, betId) =>
  (await one(who.rpc("finish_series_bet", { p_series_id: id, p_bet_id: betId, p_outcome: null, p_cancel: true }))).finish_series_bet;

/** A started series with every player in, a favor each and everyone ready. Returns ids. */
async function running(players, opts = {}) {
  const [host, ...rest] = players;
  const s = await create(host, opts);
  for (const p of rest) await join(p, s.id);
  if ((opts.mode ?? "SHARED_FAVOR_POOL") !== "MONEY") for (const p of players) await favor(p, s.id, `favor from ${p.name}`);
  for (const p of players) await ready(p, s.id);
  const v = await view(host, s.id);
  for (let i = v.bets.length; i < (opts.ensureBets ?? 0); i++) await addBet(host, s.id, `Extra bet ${i + 1}?`);
  await start(host, s.id);
  return { id: s.id, code: s.invite_code, bets: (await view(host, s.id)).bets.map((b) => b.id) };
}

describe("creating a series", () => {
  test("a valid create is a lobby with the host as a named member, an invite code and the settings", async () => {
    const s = await create(ana, { bets: 3, losers: 1, questions: ["Will it rain?", "Will we win?"], settings: { withdrawMinutes: 15, tiebreak: "random", betCreation: "during", favorsPerPlayer: 2, exclusivePool: false } });
    assert.equal(s.status, "LOBBY");
    assert.match(s.invite_code, /^[A-Z2-9]{6}$/);
    const v = await view(ana, s.id);
    assert.deepEqual(v.members.map((m) => [m.name, m.plays]), [["Ana", true]]);
    assert.deepEqual(v.bets.map((b) => [b.question, b.status]), [["Will it rain?", "draft"], ["Will we win?", "draft"]]);
    assert.deepEqual(v.settings, {
      betCount: 3, losers: 1, startingCoins: 1000, mode: "pool", minContribution: 0, favorsPerPlayer: 2,
      exclusivePool: false, tiebreak: "random", betCreation: "during", withdrawMinutes: 15, hostPlays: true,
    });
  });

  test("the old call shape still works: all questions up front means bets are locked at start", async () => {
    const s = await create(ana, { bets: 1, questions: ["Old style?"] });
    assert.equal(s.bet_creation, "UPFRONT");
    assert.equal(s.withdraw_minutes, 0);
  });

  test("bad input is refused and nothing is saved", async () => {
    const before = (await state(ben)).series.length;
    await rejects(create(ben, { title: "  " }), "invalid_title");
    await rejects(create(ben, { mode: "DARES" }), "invalid_stake_mode");
    await rejects(create(ben, { bets: 0 }), "invalid_series");
    await rejects(create(ben, { coins: 50 }), "invalid_series", /100 to 100,000/);
    await rejects(create(ben, { losers: 0 }), "invalid_series");
    await rejects(create(ben, { bets: 1, questions: ["One?", "Two?"] }), "planned_questions_full");
    await rejects(create(ben, { questions: ["?"] }), "invalid_question");
    await rejects(create(ben, { settings: { withdrawMinutes: 90 } }), "invalid_settings");
    await rejects(create(ben, { settings: { favorsPerPlayer: 9 } }), "invalid_settings");
    await rejects(create(ben, { mode: "MONEY", settings: { minContribution: 0 } }), "invalid_settings");
    assert.equal((await state(ben)).series.length, before);
  });
});

describe("the lobby", () => {
  test("join by id or code; joining twice doesn't duplicate; only members see the series", async () => {
    const s = await create(ana);
    assert.equal(await view(ben, s.id), undefined);
    await join(ben, s.id);
    await join(ben, s.id);
    await one(cat.rpc("join_bet_series_by_code", { p_code: s.invite_code.toLowerCase() }));
    await rejects(dan.rpc("join_bet_series_by_code", { p_code: "NOPE00" }), "series_not_found");
    const v = await view(ben, s.id);
    assert.deepEqual(v.members.map((m) => m.name), ["Ana", "Ben", "Cat"]);
    // RLS: someone outside can't read the tables directly either.
    assert.equal((await dan.as("select * from public.bet_series where id = $1", [s.id])).length, 0);
    assert.equal((await ben.as("select * from public.bet_series where id = $1", [s.id])).length, 1);
  });

  test("leave and kick: lobby only, host only, never the host", async () => {
    const s = await create(ana);
    await join(ben, s.id);
    await join(cat, s.id);
    await rejects(ben.rpc("remove_series_participant", { p_series_id: s.id, p_user_id: cat.id }), "not_host");
    await rejects(ana.rpc("remove_series_participant", { p_series_id: s.id, p_user_id: ana.id }), "cannot_remove_host");
    await rejects(ana.rpc("leave_bet_series", { p_series_id: s.id }), "cannot_remove_host");
    await ana.rpc("remove_series_participant", { p_series_id: s.id, p_user_id: cat.id });
    await ben.rpc("leave_bet_series", { p_series_id: s.id });
    assert.deepEqual((await view(ana, s.id)).members.map((m) => m.name), ["Ana"]);
  });

  test("shared pool: favor limit, any pool change resets everyone's ready, ready agrees to the pool", async () => {
    const s = await create(ana, { settings: { favorsPerPlayer: 1 } });
    await join(ben, s.id);
    const fa = await favor(ana, s.id, "Buy coffee");
    await rejects(favor(ana, s.id, "Second one"), "favor_limit", /up to 1 favor\./);
    await rejects(ready(ben, s.id), "favors_missing", /Add at least one favor/);
    const fb = await favor(ben, s.id, "Sing a song");
    await ready(ana, s.id);
    await ready(ben, s.id);
    let v = await view(ana, s.id);
    assert.deepEqual(v.favors.find((f) => f.id === fa.id).agreedBy, [ben.id]);
    assert.deepEqual(v.favors.find((f) => f.id === fb.id).agreedBy, [ana.id]);
    assert.ok(v.members.every((m) => m.ready));
    // Ben swaps his favor: the pool changed, so both have to agree again.
    await ben.rpc("withdraw_series_favor", { p_favor_id: fb.id });
    await favor(ben, s.id, "Do the dishes");
    v = await view(ana, s.id);
    assert.ok(v.members.every((m) => !m.ready));
    assert.deepEqual(v.blockers, ["Not ready yet: Ana, Ben."]);
  });

  test("per-favor agreement: not on your own, and taking it back un-readies you", async () => {
    const s = await create(ana);
    await join(ben, s.id);
    const fa = await favor(ana, s.id, "Buy coffee");
    await favor(ben, s.id, "Sing a song");
    await rejects(ana.rpc("consent_series_favor", { p_favor_id: fa.id, p_consent: true }), "cannot_consent_own_favor");
    await ben.rpc("consent_series_favor", { p_favor_id: fa.id, p_consent: true });
    assert.deepEqual((await view(ben, s.id)).favors.find((f) => f.id === fa.id).agreedBy, [ben.id]);
    await ready(ben, s.id);
    await ben.rpc("consent_series_favor", { p_favor_id: fa.id, p_consent: false });
    const v = await view(ben, s.id);
    assert.deepEqual(v.favors.find((f) => f.id === fa.id).agreedBy, []);
    assert.equal(v.members.find((m) => m.userId === ben.id).ready, false);
  });

  test("pledge mode: changing or taking back a pledge un-readies everyone, so nobody starts on stakes they didn't see", async () => {
    const p = await create(ana, { mode: "PLEDGE" });
    await join(ben, p.id);
    await join(cat, p.id);
    for (const who of [ana, ben, cat]) await favor(who, p.id, `${who.name}'s pledge`);
    for (const who of [ana, ben, cat]) await ready(who, p.id);
    assert.ok((await view(ana, p.id)).members.every((m) => m.ready));

    // Ben swaps his pledge at the last minute: everyone has to look again.
    await favor(ben, p.id, "Something much easier");
    let v = await view(ana, p.id);
    assert.ok(v.members.every((m) => !m.ready));
    assert.match(v.activity[0].text, /Ben changed their pledge to "Something much easier"\. Everyone needs to say ready again/);
    await rejects(start(ana, p.id), "not_ready");

    // Everyone re-readies; then Cat takes hers back: same again.
    for (const who of [ana, ben, cat]) await ready(who, p.id);
    const catFavor = (await view(cat, p.id)).favors.find((f) => f.authorId === cat.id);
    await cat.rpc("withdraw_series_favor", { p_favor_id: catFavor.id });
    v = await view(ana, p.id);
    assert.ok(v.members.every((m) => !m.ready));
    assert.match(v.activity[0].text, /Cat took back their pledge/);
    // Every pledge shows who made it.
    assert.deepEqual(v.favors.map((f) => [f.authorId, f.text]).sort(), [[ana.id, "Ana's pledge"], [ben.id, "Something much easier"]].sort());
  });

  test("pledge mode replaces your one pledge; money mode has no favors", async () => {
    const p = await create(ana, { mode: "PLEDGE" });
    await favor(ana, p.id, "First pledge");
    await favor(ana, p.id, "Second pledge");
    assert.deepEqual((await view(ana, p.id)).favors.map((f) => f.text), ["Second pledge"]);
    const m = await create(ana, { mode: "MONEY", settings: { minContribution: 20 } });
    await rejects(favor(ana, m.id, "Nope"), "wrong_mode");
    assert.equal((await view(ana, m.id)).settings.minContribution, 20);
  });

  test("lobby bets: host adds and removes, up to the count", async () => {
    const s = await create(ana, { bets: 1 });
    await rejects(addBet(ben, s.id, "Not host?"), "not_host");
    const b = await addBet(ana, s.id, "Only bet?");
    await rejects(addBet(ana, s.id, "One too many?"), "planned_questions_full");
    await ana.rpc("remove_series_bet", { p_series_id: s.id, p_bet_id: b.id });
    await addBet(ana, s.id, "Replacement?");
    assert.deepEqual((await view(ana, s.id)).bets.map((x) => x.question), ["Replacement?"]);
  });
});

describe("starting", () => {
  test("blockers come in order and the host can't start until they're gone", async () => {
    const s = await create(ana, { losers: 2, bets: 1, settings: { betCreation: "upfront" } });
    await rejects(start(ana, s.id), "one_person", /At least 2 players/);
    await join(ben, s.id);
    await join(cat, s.id);
    await rejects(start(ana, s.id), "too_few_participants", /at least 4 players/);
    await join(dan, s.id);
    await rejects(start(ben, s.id), "not_host");
    await rejects(start(ana, s.id), "favors_missing", /Ana, Ben, Cat, Dan/);
    for (const p of [ana, ben, cat, dan]) await favor(p, s.id, `favor from ${p.name}`);
    await rejects(start(ana, s.id), "not_ready");
    for (const p of [ana, ben, cat, dan]) await ready(p, s.id);
    await rejects(start(ana, s.id), "planned_questions_required", /Write all 1 bets/);
    await addBet(ana, s.id, "Ready now?");
    const started = await start(ana, s.id);
    assert.equal(started.status, "ACTIVE");
  });

  test("coins are handed out exactly once and only in that series; favors lock", async () => {
    const r = await running([ana, ben], { bets: 1, coins: 500, ensureBets: 1 });
    await start(ana, r.id);
    const v = await view(ana, r.id);
    assert.deepEqual(v.standings.map((x) => x.available), [500, 500]);
    assert.equal(v.bets[0].status, "open");
    const other = await running([ana, ben], { bets: 1, coins: 2000, ensureBets: 1 });
    assert.deepEqual((await view(ana, other.id)).standings.map((x) => x.available), [2000, 2000]);
    assert.equal((await balance(ana, r.id)).available, 500);
    await rejects(favor(ben, r.id, "too late"), "favor_proposals_closed");
    await rejects(join(cat, r.id), "series_not_lobby");
  });

  test("a host who isn't playing gets no coins, no favors and no wagers", async () => {
    const s = await create(ana, { bets: 1, questions: ["Host sits out?"], settings: { hostPlays: false } });
    await join(ben, s.id);
    await join(cat, s.id);
    await rejects(favor(ana, s.id, "host favor"), "not_player");
    for (const p of [ben, cat]) await favor(p, s.id, `favor ${p.name}`);
    for (const p of [ben, cat]) await ready(p, s.id);
    await start(ana, s.id);
    const v = await view(ana, s.id);
    assert.deepEqual(v.standings.map((x) => x.userId).sort(), [ben.id, cat.id].sort());
    await rejects(wager(ana, s.id, v.bets[0].id, "YES", 10), "not_player");
  });
});

describe("betting", () => {
  test("add to your side, never switch, never overspend, members only", async () => {
    const r = await running([ana, ben, cat], { bets: 1, ensureBets: 1 });
    const b = r.bets[0];
    await wager(ben, r.id, b, "no", 100);
    await wager(ben, r.id, b, "NO", 50);
    await rejects(wager(ben, r.id, b, "YES", 1), "cannot_switch_sides", /You're on NO\. You can add to it\./);
    await rejects(wager(cat, r.id, b, "YES", 1001), "insufficient_balance", /1,000 coins free/);
    await rejects(wager(cat, r.id, b, "YES", 0), "invalid_wager");
    await rejects(wager(cat, r.id, b, "MAYBE", 5), "invalid_wager");
    await rejects(wager(dan, r.id, b, "YES", 5), "not_member");
    const v = await view(ben, r.id);
    assert.deepEqual(v.bets[0].wagers.map((w) => [w.userId, w.side, w.amount]), [[ben.id, "no", 150]]);
    const me = v.standings.find((x) => x.userId === ben.id);
    assert.deepEqual([me.coins, me.atStake, me.available], [1000, 150, 850]);
  });

  test("withdraw only inside the window, and only when the series allows it", async () => {
    const r = await running([ana, ben], { bets: 1, ensureBets: 1, settings: { withdrawMinutes: 15 } });
    const b = r.bets[0];
    await wager(ben, r.id, b, "YES", 200);
    await rejects(wager(ben, r.id, b, "NO", 1), "cannot_switch_sides", /or withdraw and pick again/);
    const back = await one(ben.rpc("withdraw_series_wager", { p_series_id: r.id, p_bet_id: b }));
    assert.equal(Number(back.withdraw_series_wager), 200);
    await wager(ben, r.id, b, "NO", 100);
    await t.ageBets(r.id, 16);
    await rejects(ben.rpc("withdraw_series_wager", { p_series_id: r.id, p_bet_id: b }), "withdraw_closed", /window has passed/);
    const never = await running([ana, ben], { bets: 1, ensureBets: 1, settings: { withdrawMinutes: 0 } });
    await wager(ben, never.id, never.bets[0], "YES", 10);
    await rejects(ben.rpc("withdraw_series_wager", { p_series_id: never.id, p_bet_id: never.bets[0] }), "withdraw_closed", /doesn't allow/);
  });

  test("winners split the whole pool by stake: 200 YES, 100 YES, 300 NO pays 400 / 200 / 0", async () => {
    const r = await running([ana, ben, cat], { bets: 2, ensureBets: 2 });
    const b = r.bets[0];
    await wager(ana, r.id, b, "YES", 200);
    await wager(ben, r.id, b, "YES", 100);
    await wager(cat, r.id, b, "NO", 300);
    await rejects(resolve(ben, r.id, b, "YES"), "not_host");
    const out = await resolve(ana, r.id, b, "YES");
    assert.equal(out.pool, 600);
    const gross = Object.fromEntries(out.payouts.map((p) => [p.userId, p.gross]));
    assert.deepEqual(gross, { [ana.id]: 400, [ben.id]: 200, [cat.id]: 0 });
    await rejects(resolve(ana, r.id, b, "NO"), "bet_not_open");
    await rejects(cancel(ana, r.id, b), "bet_not_open");
    const v = await view(ana, r.id);
    assert.deepEqual(v.standings.map((x) => [x.userId, x.coins]), [[ana.id, 1200], [ben.id, 1100], [cat.id, 700]]);
    assert.equal(v.bets[0].results.reduce((a, x) => a + x.net, 0), 0);
  });

  test("rounding leftovers go to the biggest winning stake, earlier first, and add up exactly", async () => {
    const r = await running([ana, ben, cat, dan], { bets: 1, ensureBets: 1 });
    const b = r.bets[0];
    await wager(ana, r.id, b, "YES", 1);
    await wager(ben, r.id, b, "YES", 1);
    await wager(cat, r.id, b, "YES", 1);
    await wager(dan, r.id, b, "NO", 2);
    const out = await resolve(ana, r.id, b, "YES");
    const g = Object.fromEntries(out.payouts.map((p) => [p.userId, p.gross]));
    assert.deepEqual([g[ana.id], g[ben.id], g[cat.id], g[dan.id]], [2, 2, 1, 0]);
  });

  test("everyone on one side gets refunded, whatever the host declares", async () => {
    const r = await running([ana, ben], { bets: 2, ensureBets: 2 });
    await wager(ana, r.id, r.bets[0], "YES", 100);
    await wager(ben, r.id, r.bets[0], "YES", 50);
    const out = await resolve(ana, r.id, r.bets[0], "NO");
    assert.equal(out.refunded, true);
    const v = await view(ana, r.id);
    assert.deepEqual(v.standings.map((x) => x.coins), [1000, 1000]);
    assert.equal(v.bets[0].refunded, true);
  });

  test("cancel refunds once; locking a one-sided pool refunds at once", async () => {
    const r = await running([ana, ben], { bets: 3, ensureBets: 3, settings: { betCreation: "during" } });
    await wager(ben, r.id, r.bets[0], "NO", 300);
    await wager(ana, r.id, r.bets[0], "YES", 100);
    await cancel(ana, r.id, r.bets[0]);
    await rejects(cancel(ana, r.id, r.bets[0]), "bet_not_open");
    assert.deepEqual((await view(ana, r.id)).standings.map((x) => x.coins), [1000, 1000]);
    await wager(ben, r.id, r.bets[1], "NO", 40);
    const locked = await one(ana.rpc("lock_series_bet", { p_series_id: r.id, p_bet_id: r.bets[1] }));
    assert.equal(locked.status, "RESOLVED");
    assert.equal(locked.refunded, true);
    await wager(ben, r.id, r.bets[2], "NO", 40);
    await wager(ana, r.id, r.bets[2], "YES", 40);
    const closed = await one(ana.rpc("lock_series_bet", { p_series_id: r.id, p_bet_id: r.bets[2] }));
    assert.equal(closed.status, "LOCKED");
    await rejects(wager(ben, r.id, r.bets[2], "NO", 1), "bet_not_open", /closed/);
    await rejects(ana.rpc("lock_series_bet", { p_series_id: r.id, p_bet_id: r.bets[2] }), "bet_not_open", /already closed/);
  });

  test("bets during the series open right away when allowed, and are locked out when not", async () => {
    const during = await running([ana, ben], { bets: 2, ensureBets: 1, settings: { betCreation: "during" } });
    const nb = await addBet(ana, during.id, "Added mid-series?");
    assert.equal(nb.status, "OPEN");
    assert.ok(nb.opened_at);
    const upfront = await running([ana, ben], { bets: 2, questions: ["Locked one?"], ensureBets: 2, settings: { betCreation: "upfront" } });
    await rejects(addBet(ana, upfront.id, "Sneaky?"), "questions_locked", /locked its bets/);
    const full = await running([ana, ben], { bets: 1, ensureBets: 1, settings: { betCreation: "during" } });
    await rejects(addBet(ana, full.id, "One too many?"), "planned_questions_full");
  });
});

describe("standings and ties", () => {
  test("first to reach the score ranks higher; the same bet goes to the earlier wager; bottom X lose", async () => {
    const r = await running([ana, ben, cat], { bets: 3, ensureBets: 3 });
    // Bet 1: Ben wins 100 from Cat. Bet 2: Ana wins 100 from Cat. Ana and Ben tie on 1,100; Ben got there first.
    await wager(ben, r.id, r.bets[0], "YES", 100);
    await wager(cat, r.id, r.bets[0], "NO", 100);
    await resolve(ana, r.id, r.bets[0], "YES");
    await wager(ana, r.id, r.bets[1], "YES", 100);
    await wager(cat, r.id, r.bets[1], "NO", 100);
    await resolve(ana, r.id, r.bets[1], "YES");
    let lb = await ana.rpc("series_leaderboard", { p_series_id: r.id });
    assert.deepEqual(lb.map((x) => [x.display_name, x.balance, x.is_loser]), [["Ben", 1100, false], ["Ana", 1100, false], ["Cat", 800, true]]);
    // Same bet: both win 50 from Cat; Ana bet first, so she ranks first.
    await wager(ana, r.id, r.bets[2], "YES", 50);
    await wager(ben, r.id, r.bets[2], "YES", 50);
    await wager(cat, r.id, r.bets[2], "NO", 100);
    await resolve(ana, r.id, r.bets[2], "YES");
    lb = await ana.rpc("series_leaderboard", { p_series_id: r.id });
    assert.deepEqual(lb.map((x) => x.display_name), ["Ana", "Ben", "Cat"]);
    assert.equal((await view(ana, r.id)).status, "assigning");
  });

  test("random tiebreak draws an order at start and uses it", async () => {
    const r = await running([ana, ben, cat], { bets: 1, ensureBets: 1, settings: { tiebreak: "random" } });
    const v = await view(ana, r.id);
    assert.equal(v.randomOrder.length, 3);
    assert.deepEqual(v.standings.map((x) => x.userId), v.randomOrder);
  });

  test("the leaderboard marks only the bottom X (it used to mark everyone outside the top X)", async () => {
    const r = await running([ana, ben, cat, dan, eve], { bets: 1, losers: 2, ensureBets: 1 });
    const lb = await ana.rpc("series_leaderboard", { p_series_id: r.id });
    assert.deepEqual(lb.map((x) => x.is_loser), [false, false, false, true, true]);
  });
});

describe("the end", () => {
  test("the host can't end with open bets; ends early when nothing's open; ending twice is harmless", async () => {
    const r = await running([ana, ben], { bets: 3, ensureBets: 1, settings: { betCreation: "during" } });
    await rejects(ana.rpc("complete_bet_series", { p_series_id: r.id }), "bets_still_open");
    await cancel(ana, r.id, r.bets[0]);
    await rejects(ben.rpc("complete_bet_series", { p_series_id: r.id }), "not_host");
    const done = await one(ana.rpc("complete_bet_series", { p_series_id: r.id }));
    assert.equal(done.status, "COMPLETED");
    const again = await one(ana.rpc("complete_bet_series", { p_series_id: r.id }));
    assert.equal(again.completed_at.getTime(), done.completed_at.getTime());
    const v = await view(ana, r.id);
    assert.equal(v.assignments.length, 1);
  });

  test("shared pool: winners pick agreed punishments in order; the picks are owed immediately", async () => {
    const r = await running([ana, ben, cat, dan], { bets: 1, losers: 2, ensureBets: 1, settings: { exclusivePool: true } });
    // Ana +200, Ben +100, Dan -100, Cat -200  =>  order Ana, Ben, Dan, Cat.
    const b = r.bets[0];
    await wager(ana, r.id, b, "YES", 200);
    await wager(ben, r.id, b, "YES", 100);
    await wager(cat, r.id, b, "NO", 200);
    await wager(dan, r.id, b, "NO", 100);
    await resolve(ana, r.id, b, "YES");
    let v = await view(ana, r.id);
    assert.equal(v.status, "assigning");
    assert.deepEqual(v.finalOrder, [ana.id, ben.id, dan.id, cat.id]);
    assert.deepEqual(v.assignments.map((a) => [a.chooserId, a.loserId, a.status]), [[ana.id, cat.id, "picking"], [ben.id, dan.id, "picking"]]);
    const fav = (name) => v.favors.find((f) => f.text === `favor from ${name}`).id;
    await rejects(ben.rpc("assign_series_favor", { p_series_id: r.id, p_loser_id: dan.id, p_favor_id: fav("Ana") }), "picks_in_order", /Ana picks first/);
    await rejects(ben.rpc("assign_series_favor", { p_series_id: r.id, p_loser_id: cat.id, p_favor_id: fav("Ana") }), "not_winner", /Ana picks this punishment/);
    await ana.rpc("assign_series_favor", { p_series_id: r.id, p_loser_id: cat.id, p_favor_id: fav("Ben") });
    await rejects(ana.rpc("assign_series_favor", { p_series_id: r.id, p_loser_id: cat.id, p_favor_id: fav("Dan") }), "already_picked");
    await rejects(ben.rpc("assign_series_favor", { p_series_id: r.id, p_loser_id: dan.id, p_favor_id: fav("Ben") }), "favor_taken");
    await ben.rpc("assign_series_favor", { p_series_id: r.id, p_loser_id: dan.id, p_favor_id: fav("Dan") });
    v = await view(ana, r.id);
    assert.equal(v.status, "finished");
    await cat.rpc("mark_series_favor_done", { p_series_id: r.id });
    v = await view(ana, r.id);
    assert.deepEqual(v.assignments.map((a) => [a.text, a.status, a.done]), [["favor from Ben", "accepted", true], ["favor from Dan", "accepted", false]]);
  });

  test("a favor the loser never agreed to can't be picked for them", async () => {
    const s = await create(ana, { bets: 1, questions: ["Consent?"] });
    await join(ben, s.id);
    const fa = await favor(ana, s.id, "Ana's favor");
    await favor(ben, s.id, "Ben's favor");
    await ready(ana, s.id);
    await ready(ben, s.id);
    // Ben takes back his agreement to Ana's favor after start isn't possible, so test the rule directly:
    await t.db.query("update public.series_favors set consented_by = '{}' where id = $1", [fa.id]);
    await t.db.query("update public.bet_series_participants set ready = true where series_id = $1", [s.id]);
    await start(ana, s.id);
    const b = (await view(ana, s.id)).bets[0].id;
    await wager(ana, s.id, b, "YES", 100);
    await wager(ben, s.id, b, "NO", 100);
    await resolve(ana, s.id, b, "YES");
    await rejects(ana.rpc("assign_series_favor", { p_series_id: s.id, p_loser_id: ben.id, p_favor_id: fa.id }), "favor_lacks_consent", /Ben hasn't agreed/);
  });

  test("pledge: the bottom X owe their own pledge, already agreed; money: recorded only", async () => {
    const p = await running([ana, ben, cat], { bets: 1, mode: "PLEDGE", ensureBets: 1 });
    await wager(ana, p.id, p.bets[0], "YES", 100);
    await wager(cat, p.id, p.bets[0], "NO", 100);
    await resolve(ana, p.id, p.bets[0], "YES");
    let v = await view(cat, p.id);
    assert.equal(v.status, "finished");
    assert.deepEqual(v.assignments.map((a) => [a.loserId, a.text, a.status]), [[cat.id, "favor from Cat", "accepted"]]);
    await cat.rpc("mark_series_favor_done", { p_series_id: p.id });
    const m = await running([ana, ben], { bets: 1, mode: "MONEY", ensureBets: 1, settings: { minContribution: 10 } });
    await wager(ana, m.id, m.bets[0], "YES", 100);
    await wager(ben, m.id, m.bets[0], "NO", 100);
    await resolve(ana, m.id, m.bets[0], "YES");
    v = await view(ben, m.id);
    assert.deepEqual(v.assignments.map((a) => [a.loserId, a.text]), [[ben.id, null]]);
    await rejects(ben.rpc("mark_series_favor_done", { p_series_id: m.id }), "wrong_mode");
  });
});

describe("one read for the app", () => {
  test("my_series_state has me, the server time, and an activity feed", async () => {
    const s = await state(eve);
    assert.equal(s.me.id, eve.id);
    assert.equal(s.me.name, "Eve");
    assert.ok(Date.parse(s.serverTime) > 0);
    const r = await running([eve, ben], { bets: 1, ensureBets: 1, title: "Feed" });
    const v = await view(eve, r.id);
    assert.equal(v.activity[0].text, "Betting started. Everyone got 1,000 coins.");
    assert.equal(v.activity.at(-1).text, "Eve created the series.");
  });
});
