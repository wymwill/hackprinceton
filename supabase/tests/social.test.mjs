// Friends and clans, run against the real migrations in PGlite.
// Run: npm run test:series-sql
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "./harness.mjs";

let t;
let ana, ben, cat, dan;
before(async () => {
  t = await createDb();
  [ana, ben, cat, dan] = await Promise.all(["Ana", "Ben", "Cat", "Dan"].map((n) => t.user(n)));
});
after(() => t.close());

const one = async (p) => (await p)[0];
const social = async (who) => (await one(who.rpc("my_social_state"))).my_social_state;
const rejects = async (p, hint) => {
  await assert.rejects(p, (err) => {
    assert.equal(err.hint, hint, `hint for: ${err.message}`);
    return true;
  });
};

describe("friends", () => {
  test("everyone gets a stable 8-character friend code", async () => {
    const a = await social(ana);
    assert.match(a.me.friendCode, /^[A-Z2-9]{8}$/);
    assert.equal((await social(ana)).me.friendCode, a.me.friendCode);
    assert.equal(a.me.name, "Ana");
    assert.deepEqual(a.friends, []);
  });

  test("adding by code works both ways, ignores dashes and case, and twice is harmless", async () => {
    const code = (await social(ben)).me.friendCode;
    const pretty = `${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase();
    const added = (await one(ana.rpc("add_friend", { p_code: pretty }))).add_friend;
    assert.equal(added.name, "Ben");
    await ana.rpc("add_friend", { p_code: code });
    assert.deepEqual((await social(ana)).friends.map((f) => f.name), ["Ben"]);
    assert.deepEqual((await social(ben)).friends.map((f) => f.name), ["Ana"]);
  });

  test("unknown codes and your own code are refused", async () => {
    await rejects(ana.rpc("add_friend", { p_code: "NOPE2345" }), "friend_not_found");
    await rejects(ana.rpc("add_friend", { p_code: (await social(ana)).me.friendCode }), "friend_self");
  });

  test("removing a friend removes it for both", async () => {
    await ben.rpc("remove_friend", { p_user_id: ana.id });
    assert.deepEqual((await social(ana)).friends, []);
    assert.deepEqual((await social(ben)).friends, []);
  });

  test("nobody can read the tables directly", async () => {
    await assert.rejects(ana.as("select * from public.player_profiles"));
    await assert.rejects(ana.as("select * from public.clans"));
  });
});

describe("clans", () => {
  let code;

  test("create a clan and you're its owner and only member", async () => {
    const c = (await one(ana.rpc("create_clan", { p_name: "  Gym Rats " }))).create_clan;
    code = c.code;
    assert.equal(c.name, "Gym Rats");
    const s = await social(ana);
    assert.equal(s.clan.name, "Gym Rats");
    assert.equal(s.clan.ownerId, ana.id);
    assert.deepEqual(s.clan.members.map((m) => m.name), ["Ana"]);
    assert.deepEqual(s.clanBoard.map((r) => [r.name, r.members, r.mine]), [["Gym Rats", 1, true]]);
  });

  test("bad names are refused, and you can only be in one clan", async () => {
    await rejects(ben.rpc("create_clan", { p_name: "   " }), "invalid_clan_name");
    await rejects(ana.rpc("create_clan", { p_name: "Second" }), "already_in_clan");
  });

  test("join by code; joining again is harmless; another clan needs leaving first", async () => {
    await ben.rpc("join_clan", { p_code: code.toLowerCase() });
    await ben.rpc("join_clan", { p_code: code });
    await rejects(cat.rpc("join_clan", { p_code: "ZZZZ2222" }), "clan_not_found");
    await one(cat.rpc("create_clan", { p_name: "Night Owls" }));
    await rejects(cat.rpc("join_clan", { p_code: code }), "already_in_clan");
    assert.deepEqual((await social(ben)).clan.members.map((m) => m.name).sort(), ["Ana", "Ben"]);
  });

  test("the board ranks clans by coins wagered on bets that weren't cancelled", async () => {
    // A tiny series so Cat can outbet the Gym Rats.
    const s = await one(cat.rpc("create_bet_series", {
      p_title: "Bet", p_description: "", p_planned_bet_count: 2, p_initial_bankroll: 1000, p_loser_count: 1,
      p_stake_mode: "SHARED_FAVOR_POOL", p_questions: ["One?", "Two?"], p_settings: {},
    }));
    await dan.rpc("join_bet_series", { p_series_id: s.id });
    for (const p of [cat, dan]) await p.rpc("propose_series_favor", { p_series_id: s.id, p_description: `favor from ${p.name}` });
    for (const p of [cat, dan]) await p.rpc("set_series_ready", { p_series_id: s.id, p_ready: true });
    await cat.rpc("start_bet_series", { p_series_id: s.id });
    const bets = (await social(cat)) && (await one(cat.rpc("my_series_state"))).my_series_state.series.find((x) => x.id === s.id).bets;
    await cat.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: bets[0].id, p_outcome: "YES", p_amount: 300 });
    await cat.rpc("place_series_wager", { p_series_id: s.id, p_bet_id: bets[1].id, p_outcome: "NO", p_amount: 200 });
    await cat.rpc("finish_series_bet", { p_series_id: s.id, p_bet_id: bets[1].id, p_outcome: null, p_cancel: true });

    const board = (await social(ana)).clanBoard;
    assert.deepEqual(board.map((r) => [r.rank, r.name, r.wagered]), [[1, "Night Owls", 300], [2, "Gym Rats", 0]]);
    assert.equal((await social(cat)).me.wagered, 300);
  });

  test("when the owner leaves, the longest-standing member takes over; the last one out closes it", async () => {
    await ana.rpc("leave_clan");
    const s = await social(ben);
    assert.equal(s.clan.ownerId, ben.id);
    assert.equal((await social(ana)).clan, null);
    await ben.rpc("leave_clan");
    assert.deepEqual((await social(ana)).clanBoard.map((r) => r.name), ["Night Owls"]);
    await rejects(ben.rpc("leave_clan"), "not_in_clan");
  });
});
