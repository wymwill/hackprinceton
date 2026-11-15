// Starting a Bet Series with a whole clan (migration 0016).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "./harness.mjs";

let t, ana, ben, cat, dan;
before(async () => {
  t = await createDb();
  [ana, ben, cat, dan] = await Promise.all(["Ana", "Ben", "Cat", "Dan"].map((n) => t.user(n)));
});
after(() => t.close());

const one = async (p) => (await p)[0];
const rejects = (p, hint) => assert.rejects(p, (e) => (assert.equal(e.hint, hint, e.message), true));
const create = (host) =>
  one(host.rpc("create_bet_series", {
    p_title: "Clan series", p_description: "", p_planned_bet_count: 1, p_initial_bankroll: 1000,
    p_loser_count: 1, p_stake_mode: "SHARED_FAVOR_POOL", p_questions: ["Placeholder?"], p_settings: {},
  }));
const state = async (who, id) => (await one(who.rpc("my_series_state"))).my_series_state.series.find((s) => s.id === id);

test("the host adds a whole clan to the lobby; members see the series; repeats add nobody", async () => {
  const clan = (await one(ana.rpc("create_clan", { p_name: "Gym Rats" }))).create_clan;
  const code = clan.code ?? clan.clan?.code;
  const clanId = clan.id ?? clan.clan?.id;
  await ben.rpc("join_clan", { p_code: code });
  await cat.rpc("join_clan", { p_code: code });
  const s = await create(ana);
  const added = (await one(ana.rpc("add_clan_to_series", { p_series_id: s.id, p_clan_id: clanId }))).add_clan_to_series;
  assert.equal(added, 2, "Ben and Cat (Ana is already the host)");
  const v = await state(ben, s.id);
  assert.deepEqual(v.members.map((m) => m.name), ["Ana", "Ben", "Cat"]);
  assert.ok(v.members.every((m) => !m.ready), "nobody is marked ready for them");
  assert.equal(v.activity[0].text, "Ana added 2 players from Gym Rats.");
  assert.equal((await one(ana.rpc("add_clan_to_series", { p_series_id: s.id, p_clan_id: clanId }))).add_clan_to_series, 0);
  // Added members can still leave.
  await cat.rpc("leave_bet_series", { p_series_id: s.id });
  assert.deepEqual((await state(ana, s.id)).members.map((m) => m.name), ["Ana", "Ben"]);
});

test("only the host, only in the lobby, only a clan you're in", async () => {
  const clan = (await one(dan.rpc("create_clan", { p_name: "Night Owls" }))).create_clan;
  const clanId = clan.id ?? clan.clan?.id;
  const s = await create(ana);
  await rejects(ana.rpc("add_clan_to_series", { p_series_id: s.id, p_clan_id: clanId }), "not_clan_member");
  await ben.rpc("join_bet_series", { p_series_id: s.id });
  const own = (await one(ben.rpc("create_clan", { p_name: "Ben's" }))).create_clan;
  await rejects(ben.rpc("add_clan_to_series", { p_series_id: s.id, p_clan_id: own.id ?? own.clan?.id }), "not_host");
});
