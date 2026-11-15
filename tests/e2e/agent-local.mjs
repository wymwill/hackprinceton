// The iMessage agent end to end against the local Supabase stand-in: a player links a
// phone with a code from the app, then lists bets, wagers and checks the board by text.
// Everything but Photon itself is real (SQL rules, RPCs, the agent's parser and replies).
//
//   PORT=54439 BOOKIE_AGENT_SECRET=local-agent-secret-0123456789abcdef node tests/sql/local-supabase.mjs
//   npm run test:agent-local
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { parse, respond } from "../../agent/brain.ts";
import { connect } from "../../agent/bookie.ts";

const AUTH = process.env.SUPABASE_URL ?? "http://127.0.0.1:54439";
const SECRET = process.env.BOOKIE_AGENT_SECRET ?? "local-agent-secret-0123456789abcdef";
if (!/localhost|127\.0\.0\.1/.test(AUTH)) throw new Error("This test signs up throwaway users; point SUPABASE_URL at the local stand-in only.");

let step = 0;
const ok = (msg) => console.log(`  ✓ ${++step}. ${msg}`);

async function signUp(name) {
  const r = await fetch(`${AUTH}/auth/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: "local" },
    body: JSON.stringify({ email: `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@example.com`, password: "local-test-pw", data: { full_name: name } }),
  });
  const s = await r.json();
  assert.ok(s.access_token, JSON.stringify(s));
  return { name, id: s.user.id, token: s.access_token };
}
async function rpc(who, fn, args = {}) {
  const r = await fetch(`${AUTH}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: "local", Authorization: `Bearer ${who.token}` },
    body: JSON.stringify(args),
  });
  const j = await r.json();
  assert.ok(r.ok, `${fn}: ${JSON.stringify(j)}`);
  return j;
}

const bookieFor = connect({ url: AUTH, key: "local", secret: SECRET });
let n = 0;
/** One text from a phone, answered the way agent/index.ts answers it. */
const text = (handle, body, group = false) => {
  const intent = parse(body, group);
  return intent ? respond(intent, bookieFor(handle, `msg-${++n}`), {}) : Promise.resolve(null);
};

console.log(`iMessage agent, end to end: stand-in ${AUTH}`);
const [host, jake] = await Promise.all(["Host", "Jake"].map(signUp));
const s = await rpc(host, "create_bet_series", {
  p_title: "Game night", p_description: "", p_planned_bet_count: 2, p_initial_bankroll: 1000, p_loser_count: 1,
  p_stake_mode: "MONEY", p_questions: ["Will the Knicks win tonight?", "Pizza in under 30 minutes?"], p_settings: { minContribution: 5 },
});
await rpc(jake, "join_bet_series", { p_series_id: s.id });
for (const p of [host, jake]) await rpc(p, "set_series_ready", { p_series_id: s.id, p_ready: true });
await rpc(host, "start_bet_series", { p_series_id: s.id });

const PHONE = `iMessage:+1555${String(Date.now()).slice(-7)}`;
assert.match(await text(PHONE, "bets"), /don't know who you are yet/);
assert.match(await text(PHONE, "bookie link zzzzzzzz"), /didn't work/);
ok("an unlinked phone is told how to link, and a bad code is refused");

const { code } = await rpc(jake, "imessage_link_code");
assert.match(await text(PHONE, `link ${code}`), /You're in, Jake!/);
assert.match(await text(PHONE, `link ${code}`), /didn't work/);
ok("a code from the app links the phone once");

const list = await text(PHONE, "bets");
assert.match(list, /1\. Pizza in under 30 minutes\? \(Game night\)/);
assert.match(list, /2\. Will the Knicks win tonight\?/);
ok("\"bets\" lists the open bets, numbered");

assert.match(await text(PHONE, "bet 100 on yes #2"), /✅ 100 on YES: Will the Knicks win tonight\?[\s\S]*900 coins free/);
assert.match(await text(PHONE, "50 on no for 1"), /✅ 50 on NO: Pizza/);
assert.match(await text(PHONE, "bet 5000 on yes #2"), /only have 850/);
ok("wagers by text follow the app's rules, and refusals read naturally");

const state = await rpc(jake, "my_series_state");
const knicks = state.series.find((x) => x.id === s.id).bets.find((b) => b.question.startsWith("Will the Knicks"));
assert.equal(knicks.wagers.find((w) => w.userId === jake.id).amount, 100);
ok("the wager shows up in the app for the same player");

// The same message delivered twice charges once.
const once = bookieFor(PHONE, "duplicate-delivery");
const pizza = state.series.find((x) => x.id === s.id).bets.find((b) => b.question.startsWith("Pizza"));
const no = pizza.outcomes.find((o) => o.label === "NO").id;
const a = await once.wager(s.id, pizza.id, no, 10);
const b = await once.wager(s.id, pizza.id, no, 10);
assert.deepEqual([a.replayed, b.replayed], [false, true]);
ok("a message delivered twice places its wager once");

assert.match(await text(PHONE, "board"), /Game night: you're \d(st|nd) of 2/);
assert.match(await text(PHONE, "coins"), /Game night: 840 free, 160 in play/);
assert.equal(await text(PHONE, "lol good game", true), null);
ok("board and coins answer; group chatter is ignored");

assert.match(await text(PHONE, "unlink"), /isn't linked/);
assert.match(await text(PHONE, "bets"), /don't know who you are yet/);
ok("unlink by text");

console.log(`\nAll ${step} checks passed.`);
