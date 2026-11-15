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

test("0013 gives every existing clan a chat and leaves clans, friends and bets working", async () => {
  const t = await createDb({ upTo: "202611140013" });
  const [ana, ben, cat] = await Promise.all(["Ana", "Ben", "Cat"].map((n) => t.user(n)));
  const val = async (p) => Object.values((await p)[0])[0];
  // Clans made with the 0012 functions, before chat existed.
  const clan = await val(ana.rpc("create_clan", { p_name: "Old Clan" }));
  await ben.rpc("join_clan", { p_code: clan.code });
  await cat.rpc("add_friend", { p_code: (await val(ana.rpc("my_social_state"))).me.friendCode });
  const before = await val(ana.rpc("my_social_state"));

  await t.migrate();

  // Same clan, members, owner and friends.
  const after = await val(ana.rpc("my_social_state"));
  assert.deepEqual(after.clan, before.clan);
  assert.deepEqual(after.friends, before.friends);
  // Its chat exists, empty (no announcements for joins that happened before), and nothing is unread.
  const page = await val(ben.rpc("clan_messages_page", { p_clan_id: clan.id }));
  assert.deepEqual([page.messages, page.hasMore, page.unread], [[], false, 0]);
  await ana.rpc("send_clan_message", { p_clan_id: clan.id, p_body: "first message after the upgrade" });
  assert.equal((await val(ben.rpc("clan_chat_status"))).unread, 1);
  await rejects(cat.rpc("clan_messages_page", { p_clan_id: clan.id }), "not_clan_member");
  // Leaving still hands the clan over, now with a note in the chat.
  await ana.rpc("leave_clan");
  const last = (await val(ben.rpc("clan_messages_page", { p_clan_id: clan.id }))).messages.map((m) => m.event);
  assert.deepEqual(last, [null, "member_left", "owner_changed"]);
  await t.close();
});

async function rejects(p, hint) {
  await assert.rejects(p, (err) => {
    assert.equal(err.hint, hint, `hint for: ${err.message}`);
    return true;
  });
}

test("catch-up SQL for the live project: 0012 already applied, then 0009, 0010, 0011, 0013 in one go", async () => {
  const { readFile } = await import("node:fs/promises");
  const { catchupSql } = await import("../../scripts/catchup-sql.mjs");
  const val = async (p) => Object.values((await p)[0])[0];
  // The live project's state: 0001–0008, then 0012 (friends and clans) applied before 0009–0011 existed.
  const t = await createDb({ upTo: "202611140009" });
  await t.db.exec(await readFile(new URL("../../supabase/migrations/202611140012_friends_and_clans.sql", import.meta.url), "utf8"));
  const [ana, ben, cat] = await Promise.all(["Ana", "Ben", "Cat"].map((n) => t.user(n)));

  // Data made with the old functions: a live YES/NO series with wagers, a pledge lobby, a clan and a friendship.
  const [s] = await ana.rpc("create_bet_series", {
    p_title: "Live", p_description: "", p_planned_bet_count: 2, p_initial_bankroll: 1000,
    p_loser_count: 1, p_stake_mode: "MONEY", p_questions: ["Rain?", "Snow?"], p_settings: { minContribution: 5 },
  });
  await ben.rpc("join_bet_series", { p_series_id: s.id });
  for (const p of [ana, ben]) await p.rpc("set_series_ready", { p_series_id: s.id, p_ready: true });
  await ana.rpc("start_bet_series", { p_series_id: s.id });
  const bets = await ana.as("select id from public.series_bets where series_id = $1 order by position", [s.id]);
  await ana.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: bets[0].id, p_outcome: "YES", p_amount: 100 });
  await ben.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: bets[0].id, p_outcome: "NO", p_amount: 50 });
  const [pl] = await ana.rpc("create_bet_series", {
    p_title: "Pledges", p_description: "", p_planned_bet_count: 1, p_initial_bankroll: 1000,
    p_loser_count: 1, p_stake_mode: "PLEDGE", p_questions: ["Gym?"], p_settings: {},
  });
  await ben.rpc("join_bet_series", { p_series_id: pl.id });
  const clan = await val(ana.rpc("create_clan", { p_name: "Old Clan" }));
  await ben.rpc("join_clan", { p_code: clan.code });
  await cat.rpc("add_friend", { p_code: (await val(ana.rpc("my_social_state"))).me.friendCode });
  const socialBefore = await val(ana.rpc("my_social_state"));
  const coinsBefore = await t.db.query("select user_id, balance from public.bet_series_participants order by series_id, user_id");

  await t.db.exec(await catchupSql());

  // Bets: existing ones became YES/NO with outcome ids, wagers and balances intact; settling works.
  let v = (await val(ana.rpc("my_series_state"))).series.find((x) => x.id === s.id);
  assert.deepEqual(v.bets[0].outcomes.map((o) => [o.label, o.pool]), [["YES", 100], ["NO", 50]]);
  assert.deepEqual((await t.db.query("select user_id, balance from public.bet_series_participants order by series_id, user_id")).rows, coinsBefore.rows);
  await ana.rpc("finish_series_bet", { p_series_id: s.id, p_bet_id: bets[0].id, p_outcome: v.bets[0].outcomes[0].id });
  v = (await val(ana.rpc("my_series_state"))).series.find((x) => x.id === s.id);
  assert.equal(v.bets[0].status, "resolved");
  // Multiple-choice (0009) and range (0010) bets can be added.
  const [lobby] = await ana.rpc("create_bet_series", {
    p_title: "New", p_description: "", p_planned_bet_count: 2, p_initial_bankroll: 1000, p_loser_count: 1, p_stake_mode: "MONEY",
    p_settings: { minContribution: 5 },
    p_bets: [{ question: "Who wins?", outcomes: ["A", "B", "C"] }, { question: "High?", kind: "range", unit: "°F", decimals: 0, ranges: [{ lower: null, upper: 60 }, { lower: 60, upper: null }] }],
  });
  const nv = (await val(ana.rpc("my_series_state"))).series.find((x) => x.id === lobby.id);
  assert.deepEqual(nv.bets.map((b) => b.kind), ["multi", "range"]);
  // Pledge changes un-ready everyone (0011).
  await ana.rpc("propose_series_favor", { p_series_id: pl.id, p_description: "Cook dinner" });
  await ben.rpc("propose_series_favor", { p_series_id: pl.id, p_description: "Wash the car" });
  for (const p of [ana, ben]) await p.rpc("set_series_ready", { p_series_id: pl.id, p_ready: true });
  await ben.rpc("propose_series_favor", { p_series_id: pl.id, p_description: "Something easier" });
  assert.ok((await val(ana.rpc("my_series_state"))).series.find((x) => x.id === pl.id).members.every((m) => !m.ready));
  // Friends and clans unchanged; clan chat works and is in the Realtime publication (0013).
  const socialAfter = await val(ana.rpc("my_social_state"));
  assert.deepEqual([socialAfter.clan, socialAfter.friends], [socialBefore.clan, socialBefore.friends]);
  await ana.rpc("send_clan_message", { p_clan_id: clan.id, p_body: "chat works" });
  assert.deepEqual((await val(ben.rpc("clan_messages_page", { p_clan_id: clan.id }))).messages.map((m) => m.body), ["chat works"]);
  await rejects(cat.rpc("clan_messages_page", { p_clan_id: clan.id }), "not_clan_member");
  const pub = await t.db.query("select tablename from pg_publication_tables where pubname = 'supabase_realtime'");
  assert.deepEqual(pub.rows.map((r) => r.tablename), ["clan_messages"]);

  // Running it a second time is refused by the preflight check, and changes nothing.
  const count = async () => (await t.db.query("select count(*)::int as n from public.clan_messages")).rows[0].n;
  const n = await count();
  await assert.rejects(t.db.exec(await catchupSql()), /already applied/);
  await t.db.exec("rollback");
  assert.equal(await count(), n);
  await t.close();
});

test("catch-up SQL refuses a database without friends and clans (0012), changing nothing", async () => {
  const { catchupSql } = await import("../../scripts/catchup-sql.mjs");
  const t = await createDb({ upTo: "202611140009" });
  await assert.rejects(t.db.exec(await catchupSql()), /0012\) are missing/);
  await t.db.exec("rollback");
  assert.equal((await t.db.query("select to_regclass('public.series_bet_outcomes') as t")).rows[0].t, null);
  await t.close();
});

/** Every row of every table that exists now, in the columns that exist now (to compare after a migration adds columns). */
async function snapshot(db) {
  const cols = (await db.query(`select table_name, array_agg(column_name::text order by column_name) as cols
    from information_schema.columns where table_schema = 'public' and table_name in
      (select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')
    group by table_name order by table_name`)).rows;
  const out = {};
  for (const { table_name: t, cols: c } of cols) {
    const list = c.map((x) => `"${x}"`).join(", ");
    out[t] = { cols: c, rows: (await db.query(`select ${list} from public."${t}" order by ${list}`)).rows };
  }
  return out;
}

/** The live project's state (0001–0008, then 0012) with a bit of everything in it. */
async function liveProjectWithData() {
  const { readFile } = await import("node:fs/promises");
  const val = async (p) => Object.values((await p)[0])[0];
  const t = await createDb({ upTo: "202611140009" });
  await t.db.exec(await readFile(new URL("../../supabase/migrations/202611140012_friends_and_clans.sql", import.meta.url), "utf8"));
  const [ana, ben, cat] = await Promise.all(["Ana", "Ben", "Cat"].map((n) => t.user(n)));
  const make = async (host, mode, questions, settings = {}) =>
    (await host.rpc("create_bet_series", { p_title: `${mode} series`, p_description: "", p_planned_bet_count: questions.length,
      p_initial_bankroll: 1000, p_loser_count: 1, p_stake_mode: mode, p_questions: questions, p_settings: settings }))[0];
  const betIds = async (host, s) => (await host.as("select id from public.series_bets where series_id = $1 order by position", [s.id])).map((r) => r.id);

  // A live money series: one bet won, one cancelled, one still open with wagers on both sides.
  const m = await make(ana, "MONEY", ["Rain?", "Snow?", "Sun?"], { minContribution: 5 });
  await ben.rpc("join_bet_series", { p_series_id: m.id });
  for (const p of [ana, ben]) await p.rpc("set_series_ready", { p_series_id: m.id, p_ready: true });
  await ana.rpc("start_bet_series", { p_series_id: m.id });
  const [b1, b2, b3] = await betIds(ana, m);
  await ana.rpc("place_series_wager", { p_series_id: m.id, p_bet_id: b1, p_outcome: "YES", p_amount: 120 });
  await ben.rpc("place_series_wager", { p_series_id: m.id, p_bet_id: b1, p_outcome: "NO", p_amount: 80 });
  await ana.rpc("finish_series_bet", { p_series_id: m.id, p_bet_id: b1, p_outcome: "NO", p_cancel: false });
  await ben.rpc("place_series_wager", { p_series_id: m.id, p_bet_id: b2, p_outcome: "YES", p_amount: 40 });
  await ana.rpc("place_series_wager", { p_series_id: m.id, p_bet_id: b2, p_outcome: "NO", p_amount: 40 });
  await ana.rpc("finish_series_bet", { p_series_id: m.id, p_bet_id: b2, p_outcome: null, p_cancel: true });
  await ana.rpc("place_series_wager", { p_series_id: m.id, p_bet_id: b3, p_outcome: "YES", p_amount: 30 });
  await ben.rpc("place_series_wager", { p_series_id: m.id, p_bet_id: b3, p_outcome: "NO", p_amount: 70 });

  // A finished shared-pool series, with the winner's favor pick waiting on the loser.
  const pool = await make(cat, "SHARED_FAVOR_POOL", ["Gym?"]);
  await ben.rpc("join_bet_series", { p_series_id: pool.id });
  const [f1] = await cat.rpc("propose_series_favor", { p_series_id: pool.id, p_description: "Cook dinner" });
  await ben.rpc("propose_series_favor", { p_series_id: pool.id, p_description: "Wash the car" });
  for (const p of [cat, ben]) await p.rpc("set_series_ready", { p_series_id: pool.id, p_ready: true });
  await cat.rpc("start_bet_series", { p_series_id: pool.id });
  const [g1] = await betIds(cat, pool);
  await cat.rpc("place_series_wager", { p_series_id: pool.id, p_bet_id: g1, p_outcome: "YES", p_amount: 200 });
  await ben.rpc("place_series_wager", { p_series_id: pool.id, p_bet_id: g1, p_outcome: "NO", p_amount: 100 });
  await cat.rpc("finish_series_bet", { p_series_id: pool.id, p_bet_id: g1, p_outcome: "YES", p_cancel: false });
  await cat.rpc("assign_series_favor", { p_series_id: pool.id, p_loser_id: ben.id, p_favor_id: f1.id });

  // A pledge lobby, a clan of two, a friendship.
  const pl = await make(ana, "PLEDGE", ["Run?"]);
  await cat.rpc("join_bet_series", { p_series_id: pl.id });
  await cat.rpc("propose_series_favor", { p_series_id: pl.id, p_description: "Buy coffee" });
  const clan = await val(ana.rpc("create_clan", { p_name: "Old Clan" }));
  await ben.rpc("join_clan", { p_code: clan.code });
  await cat.rpc("add_friend", { p_code: (await val(ana.rpc("my_social_state"))).me.friendCode });
  return { t, ana, ben, cat, val, series: { m, pool, pl }, clan };
}

test("catch-up SQL keeps every existing row and column exactly as it was", async () => {
  const { catchupSql } = await import("../../scripts/catchup-sql.mjs");
  const { t, ana, val, series } = await liveProjectWithData();
  const before = await snapshot(t.db);
  await t.db.exec(await catchupSql());
  const after = await snapshot(t.db);
  for (const [table, { cols, rows }] of Object.entries(before)) {
    const kept = after[table].rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
    assert.deepEqual(kept, rows, `rows of ${table} changed`);
  }
  // The new columns on old rows are filled in: every wager points at its YES/NO outcome, winners too.
  const { rows: [w] } = await t.db.query("select count(*)::int as n, count(*) filter (where o.label = w.outcome)::int as ok from public.series_wagers w join public.series_bet_outcomes o on o.id = w.outcome_id");
  assert.deepEqual([w.n, w.ok], [before.series_wagers.rows.length, before.series_wagers.rows.length]);
  // And the open bet from before still settles on the new rules.
  const s = (await val(ana.rpc("my_series_state"))).series.find((x) => x.id === series.m.id);
  const open = s.bets.find((b) => b.status === "open");
  await ana.rpc("finish_series_bet", { p_series_id: series.m.id, p_bet_id: open.id, p_outcome: open.outcomes.find((o) => o.label === "NO").id });
  await t.close();
});

test("catch-up SQL is all-or-nothing: a failure in the last migration leaves the first three unapplied", async () => {
  const { catchupSql } = await import("../../scripts/catchup-sql.mjs");
  const { t } = await liveProjectWithData();
  const before = await snapshot(t.db);
  // Something in the database that 0013 can't replace: a same-named function with a different return type.
  await t.db.exec("create function public.clan_chat_status() returns text language sql as $$ select 'in the way' $$");
  await assert.rejects(t.db.exec(await catchupSql()), /return type/);
  await t.db.exec("rollback");
  await t.db.exec("drop function public.clan_chat_status()");
  // Nothing from 0009, 0010 or 0011 stuck, and the data is untouched.
  assert.equal((await t.db.query("select to_regclass('public.series_bet_outcomes') as x")).rows[0].x, null);
  assert.equal((await t.db.query("select count(*)::int as n from information_schema.columns where table_name = 'series_bets' and column_name in ('kind','unit')")).rows[0].n, 0);
  assert.deepEqual(await snapshot(t.db), before);
  // With the obstacle gone, it applies cleanly.
  await t.db.exec(await catchupSql());
  assert.notEqual((await t.db.query("select to_regclass('public.clan_messages') as x")).rows[0].x, null);
  await t.close();
});

test("catch-up SQL stops before changing anything if an old wager isn't YES/NO", async () => {
  const { catchupSql } = await import("../../scripts/catchup-sql.mjs");
  const { t } = await liveProjectWithData();
  await t.db.exec("alter table public.series_wagers drop constraint if exists series_wagers_outcome_check; update public.series_wagers set outcome = 'MAYBE' where amount = 30");
  const before = await snapshot(t.db);
  await assert.rejects(t.db.exec(await catchupSql()), /other than YES\/NO/);
  await t.db.exec("rollback");
  assert.deepEqual(await snapshot(t.db), before);
  await t.close();
});

test("catch-up refuses partial schema and unavailable Realtime without changing data", async () => {
  const { catchupSql } = await import("../../scripts/catchup-sql.mjs");
  for (const [setup, error] of [
    ["alter table public.series_bets add column unit text", /partial or later migration/],
    ["alter table public.clan_members add column last_read_id bigint", /partial or later migration/],
    ["drop publication supabase_realtime", /supabase_realtime must exist/],
    ["alter publication supabase_realtime set (publish = 'insert')", /INSERT and UPDATE/],
  ]) {
    const { t } = await liveProjectWithData();
    try {
      await t.db.exec(setup);
      const before = await snapshot(t.db);
      await assert.rejects(t.db.exec(await catchupSql()), error);
      await t.db.exec("rollback");
      assert.deepEqual(await snapshot(t.db), before);
      assert.equal((await t.db.query("select to_regclass('public.series_bet_outcomes') as x")).rows[0].x, null);
    } finally {
      await t.close();
    }
  }
});

test("read-only recovery audit works before and after catch-up and does not change data", async () => {
  const { readFile } = await import("node:fs/promises");
  const { catchupSql } = await import("../../scripts/catchup-sql.mjs");
  const audit = await readFile(new URL("../../supabase/diagnostics/clan-chat.sql", import.meta.url), "utf8");
  const { t } = await liveProjectWithData();
  try {
    for (const upgraded of [false, true]) {
      if (upgraded) {
        await t.db.exec(await catchupSql());
        // Exercise the ledger-present branch too; SQL-editor-only projects may lack it.
        await t.db.exec("create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text); insert into supabase_migrations.schema_migrations values ('202611140013')");
      }
      const before = await snapshot(t.db);
      const results = await t.db.exec(audit);
      assert.deepEqual(await snapshot(t.db), before);
      const flags = results.flatMap((r) => r.rows).find((r) => "has_0013" in r);
      assert.equal(flags.has_0013, upgraded);
      const fns = results.flatMap((r) => r.rows).filter((r) => "signature" in r);
      assert.equal(fns.length, 12);
      assert.ok(fns.every((r) => r.present === upgraded));
      if (upgraded) {
        assert.ok(fns.every((r) => r.anon_execute === false));
        assert.ok(fns.every((r) => r.authenticated_execute === !r.signature.startsWith("public._")));
        const publication = results.flatMap((r) => r.rows).find((r) => "publishes_chat" in r);
        assert.equal(publication.publishes_chat, true);
        assert.equal(publication.pubinsert && publication.pubupdate, true);
      }
    }
  } finally {
    await t.close();
  }
});
