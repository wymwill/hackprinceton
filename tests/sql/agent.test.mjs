// The Bookie messaging agent (migration 0023), against the real migrations in PGlite.
// The agent calls agent_* as the anon role with a shared secret; players link a
// phone with a one-time code from the app.
// Run: npm run test:series-sql
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDb, SqlError } from "./harness.mjs";

const SECRET = "test-agent-secret-0123456789abcdef0123456789";
let t;
let ana, ben;
before(async () => {
  t = await createDb();
  [ana, ben] = await Promise.all(["Ana", "Ben"].map((n) => t.user(n)));
  await t.db.query("select public.set_bookie_agent_secret($1)", [SECRET]);
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

/** Call a function as the agent does: anon role, no signed-in user. */
async function agent(fn, args) {
  const keys = Object.keys(args);
  const list = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
  return t.db.transaction(async (tx) => {
    await tx.exec("set local role anon");
    try {
      const r = await tx.query(`select public.${fn}(${list}) as v`, keys.map((k) => args[k]));
      return r.rows[0].v;
    } catch (err) {
      throw new SqlError(err);
    }
  });
}
const code = async (who) => (await val(who.rpc("imessage_link_code"))).code;

async function liveSeries() {
  const [s] = await ana.rpc("create_bet_series", {
    p_title: "Game night", p_description: "", p_planned_bet_count: 2, p_initial_bankroll: 1000,
    p_loser_count: 1, p_stake_mode: "MONEY", p_questions: ["Knicks win?"], p_settings: { minContribution: 5 },
  });
  await ben.rpc("join_bet_series", { p_series_id: s.id });
  for (const p of [ana, ben]) await p.rpc("set_series_ready", { p_series_id: s.id, p_ready: true });
  await ana.rpc("start_bet_series", { p_series_id: s.id });
  const st = await val(ana.rpc("my_series_state"));
  return st.series.find((x) => x.id === s.id);
}

describe("linking a phone", () => {
  test("a code from the app links the sender's address once; the agent then sees that player's series", async () => {
    const c = await code(ana);
    assert.match(c, /^[A-HJ-NP-Z2-9]{8}$/);
    const linked = await agent("agent_link", { p_secret: SECRET, p_handle: "iMessage:+15550000001", p_code: c.toLowerCase() });
    assert.equal(linked.name, "Ana");
    await rejects(agent("agent_link", { p_secret: SECRET, p_handle: "iMessage:+15550000002", p_code: c }), "invalid_code");
    const s = await liveSeries();
    const state = await agent("agent_state", { p_secret: SECRET, p_handle: "iMessage:+15550000001" });
    assert.equal(state.linked, true);
    assert.equal(state.me.id, ana.id);
    assert.ok(state.series.some((x) => x.id === s.id));
    const links = await val(ana.rpc("imessage_links"));
    assert.equal(links.length, 1);
    assert.equal(links[0].label, "iMessage ending 0001");
  });

  test("an unknown address isn't linked and can't wager", async () => {
    assert.deepEqual(await agent("agent_state", { p_secret: SECRET, p_handle: "iMessage:+15559999999" }), { linked: false });
    await rejects(
      agent("agent_wager", { p_secret: SECRET, p_handle: "iMessage:+15559999999", p_request_id: randomUUID(), p_series_id: randomUUID(), p_bet_id: randomUUID(), p_outcome: "YES", p_amount: 10 }),
      "not_linked"
    );
  });

  test("a wrong or missing secret is refused, and the tables can't be read directly", async () => {
    await rejects(agent("agent_state", { p_secret: "nope", p_handle: "iMessage:+15550000001" }), "agent_unauthorized");
    await rejects(agent("agent_link", { p_secret: null, p_handle: "x:y", p_code: "AAAAAAAA" }), "agent_unauthorized");
    await assert.rejects(t.db.transaction(async (tx) => { await tx.exec("set local role anon"); await tx.query("select * from public.agent_links"); }));
    await assert.rejects(ben.as("select * from public.agent_link_codes"));
  });

  test("only the SQL editor can set the secret", async () => {
    await assert.rejects(ben.as("select public.set_bookie_agent_secret('x'::text || repeat('y', 40))"));
  });

  test("a new code replaces the old one, and expired codes don't work", async () => {
    const first = await code(ben);
    const second = await code(ben);
    await rejects(agent("agent_link", { p_secret: SECRET, p_handle: "Telegram:42", p_code: first }), "invalid_code");
    await t.db.query("update public.agent_link_codes set expires_at = now() - interval '1 second' where code = $1", [second]);
    await rejects(agent("agent_link", { p_secret: SECRET, p_handle: "Telegram:42", p_code: second }), "invalid_code");
  });
});

describe("acting as the player", () => {
  test("a wager from a phone follows the app's rules and charges once per request id", async () => {
    const handle = "iMessage:+15550000003";
    await agent("agent_link", { p_secret: SECRET, p_handle: handle, p_code: await code(ben) });
    const s = await liveSeries();
    const bet = s.bets.find((b) => b.status === "open");
    const req = randomUUID();
    const args = { p_secret: SECRET, p_handle: handle, p_request_id: req, p_series_id: s.id, p_bet_id: bet.id, p_outcome: "yes", p_amount: 100 };
    const r1 = await agent("agent_wager", args);
    assert.equal(r1.replayed, false);
    assert.equal(r1.available, 900);
    const r2 = await agent("agent_wager", args);
    assert.equal(r2.replayed, true);
    const st = await val(ben.rpc("my_series_state"));
    const mine = st.series.find((x) => x.id === s.id).bets.find((b) => b.id === bet.id).wagers.find((w) => w.userId === ben.id);
    assert.equal(mine.amount, 100);
    await rejects(agent("agent_wager", { ...args, p_request_id: randomUUID(), p_amount: 5000 }), "insufficient_balance");
  });

  test("unlinking from the app or the phone stops it", async () => {
    const handle = "iMessage:+15550000004";
    await agent("agent_link", { p_secret: SECRET, p_handle: handle, p_code: await code(ben) });
    assert.equal((await agent("agent_state", { p_secret: SECRET, p_handle: handle })).linked, true);
    assert.equal(await agent("agent_unlink", { p_secret: SECRET, p_handle: handle }), true);
    assert.equal((await agent("agent_state", { p_secret: SECRET, p_handle: handle })).linked, false);
    await agent("agent_link", { p_secret: SECRET, p_handle: handle, p_code: await code(ben) });
    const before = await val(ben.rpc("imessage_links"));
    assert.ok(before.length >= 1);
    assert.equal(await val(ben.rpc("imessage_unlink", { p_id: null })), before.length);
    assert.equal((await agent("agent_state", { p_secret: SECRET, p_handle: handle })).linked, false);
  });
});
