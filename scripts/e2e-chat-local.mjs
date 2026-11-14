// End to end: clan chat through the Next API, with live delivery over Supabase
// Realtime, against the local Supabase stand-in (no real project, no secrets).
//
//   node supabase/tests/local-supabase.mjs                                         # :54399
//   SUPABASE_URL=http://localhost:54399 SUPABASE_PUBLISHABLE_KEY=local npx next dev -p 3210
//   API_URL=http://localhost:3210 npm run test:chat-local
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const API = process.env.API_URL ?? "http://localhost:3210";
const AUTH = process.env.SUPABASE_URL ?? "http://localhost:54399";
if (!/localhost|127\.0\.0\.1/.test(AUTH)) throw new Error("This test signs up throwaway users; point SUPABASE_URL at the local stand-in only.");

let step = 0;
const ok = (msg) => console.log(`  ✓ ${++step}. ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(what, fn, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(50);
  }
}

async function signUp(name) {
  const res = await fetch(`${AUTH}/auth/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: "local" },
    body: JSON.stringify({ email: `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@example.com`, password: "local-test-pw", data: { full_name: name } }),
  });
  const s = await res.json();
  assert.ok(s.access_token, `sign up ${name}: ${JSON.stringify(s)}`);
  return { name, id: s.user.id, token: s.access_token, refresh: s.refresh_token };
}
async function api(who, method, path, body) {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(who ? { Authorization: `Bearer ${who.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, result: json.result, error: json.error };
}
const okRes = (r, what) => {
  assert.ok(r.status < 300, `${what}: ${r.status} ${JSON.stringify(r.error)}`);
  return r.result;
};

/**
 * A chat client the way the app does it: subscribe to the clan's rows over
 * Realtime, catch up over the API after (re)connecting, and keep one copy of
 * each message by id.
 */
async function listen(who, clanId) {
  // Signed in like the app, so Realtime (re)joins with this player's token.
  const client = createClient(AUTH, "local", { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.setSession({ access_token: who.token, refresh_token: who.refresh });
  assert.ifError(error);
  const seen = new Map();
  const events = [];
  let subscribedTimes = 0;
  const catchUp = async () => {
    const last = Math.max(0, ...seen.keys());
    const r = await api(who, "GET", `/social/clans/${clanId}/messages?after=${last}`);
    // Nonmembers are refused (403) here too; they just stay empty.
    for (const m of r.result?.messages ?? []) seen.set(m.id, m);
  };
  const channel = client
    .channel(`clan:${clanId}:${who.name}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "clan_messages", filter: `clan_id=eq.${clanId}` }, (p) => {
      events.push(p);
      seen.set(Number(p.new.id), { ...seen.get(Number(p.new.id)), id: Number(p.new.id), body: p.new.body, deleted: !!p.new.deleted_at, userId: p.new.user_id });
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        subscribedTimes++;
        catchUp();
      }
    });
  return {
    seen, events,
    get subscribedTimes() { return subscribedTimes; },
    ready: () => until(`${who.name} subscribed`, () => subscribedTimes > 0),
    close: () => client.removeChannel(channel).then(() => client.realtime.disconnect()),
  };
}

console.log(`Clan chat, end to end: API ${API}, auth ${AUTH}`);
const [ana, ben, cat, dan] = await Promise.all(["Ana", "Ben", "Cat", "Dan"].map(signUp));

// 1. Two clans; every clan has a chat from the start.
const rats = okRes(await api(ana, "POST", "/social/clans", { name: "Gym Rats" }), "create rats");
okRes(await api(ben, "POST", "/social/clans/join", { code: rats.code }), "ben joins");
const owls = okRes(await api(cat, "POST", "/social/clans", { name: "Night Owls" }), "create owls");
let page = okRes(await api(ben, "GET", `/social/clans/${rats.id}/messages`), "page");
assert.deepEqual(page.messages.map((m) => m.body), ["Ana started the clan.", "Ben joined the clan."]);
ok("new clans come with a chat; creating and joining are announced in it");

// 2. Live delivery between two members; other clans and nonmembers get nothing.
const benL = await listen(ben, rats.id);
const anaL = await listen(ana, rats.id);
const catL = await listen(cat, rats.id); // in another clan, subscribing to this one's id
const danL = await listen(dan, rats.id); // in no clan
await Promise.all([benL.ready(), anaL.ready(), catL.ready(), danL.ready()]);
const t0 = Date.now();
const sent = okRes(await api(ana, "POST", `/social/clans/${rats.id}/messages`, { body: "Leg day tomorrow? 🏋️", clientId: randomUUID() }), "send");
await until("Ben to see Ana's message live", () => benL.seen.get(sent.id)?.body === "Leg day tomorrow? 🏋️");
const latency = Date.now() - t0;
const reply = okRes(await api(ben, "POST", `/social/clans/${rats.id}/messages`, { body: "Only if we bet on it\nloser buys smoothies" }), "reply");
await until("Ana to see Ben's reply live", () => anaL.seen.get(reply.id));
assert.equal(anaL.seen.get(reply.id).body, "Only if we bet on it\nloser buys smoothies");
await sleep(400);
assert.equal(catL.events.length, 0, "a member of another clan got this clan's messages");
assert.equal(danL.events.length, 0, "a nonmember got this clan's messages");
ok(`Ana and Ben exchange messages live (first one in ${latency} ms); Cat (other clan) and Dan (no clan) receive nothing`);

// 3. Persistence: a fresh read (as after a refresh) has the conversation.
page = okRes(await api(ben, "GET", `/social/clans/${rats.id}/messages`), "reload");
assert.deepEqual(page.messages.slice(-2).map((m) => [m.authorName, m.body]), [["Ana", "Leg day tomorrow? 🏋️"], ["Ben", "Only if we bet on it\nloser buys smoothies"]]);
ok("the conversation is there after a reload, in order, with names");

// 4. Access over HTTP.
const deny = async (who, method, path, body, status, code) => {
  const r = await api(who, method, path, body);
  assert.deepEqual([r.status, r.error?.code], [status, code], `${who?.name ?? "anonymous"} ${method} ${path}`);
};
await deny(cat, "GET", `/social/clans/${rats.id}/messages`, undefined, 403, "not_clan_member");
// Cat can read her own clan's chat, just not this one.
assert.deepEqual(okRes(await api(cat, "GET", `/social/clans/${owls.id}/messages`), "own clan").messages.map((m) => m.body), ["Cat started the clan."]);
await deny(dan, "GET", `/social/clans/${rats.id}/messages`, undefined, 403, "not_clan_member");
await deny(cat, "POST", `/social/clans/${rats.id}/messages`, { body: "hi" }, 403, "not_clan_member");
await deny(dan, "POST", `/social/clans/${rats.id}/messages`, { body: "hi" }, 403, "not_clan_member");
await deny(null, "GET", `/social/clans/${rats.id}/messages`, undefined, 401, "unauthorized");
await deny(null, "POST", `/social/clans/${rats.id}/messages`, { body: "hi" }, 401, "unauthorized");
await deny(ana, "GET", `/social/clans/not-a-uuid/messages`, undefined, 404, "not_found");
await deny(ana, "POST", `/social/clans/${rats.id}/messages`, { body: "   " }, 400, "invalid_message");
await deny(ana, "POST", `/social/clans/${rats.id}/messages`, { body: "x".repeat(2001) }, 400, "invalid_message");
// The body can't name a sender: extra fields are ignored and the message is Ana's.
const spoof = okRes(await api(ana, "POST", `/social/clans/${rats.id}/messages`, { body: "it's me", userId: ben.id, authorName: "Ben" }), "spoof");
assert.deepEqual([spoof.userId, spoof.authorName], [ana.id, "Ana"]);
ok("other clans, nonmembers and signed-out callers are refused (403/401); empty or oversized messages are 400; senders can't be spoofed");

// 5. Deleting: your own yes, others' no; the change reaches everyone live.
await deny(ben, "DELETE", `/social/clans/${rats.id}/messages/${sent.id}`, undefined, 403, "not_message_author");
await deny(cat, "DELETE", `/social/clans/${rats.id}/messages/${sent.id}`, undefined, 404, "message_not_found");
await deny(ana, "DELETE", `/social/clans/${rats.id}/messages/abc`, undefined, 404, "message_not_found");
const del = okRes(await api(ana, "DELETE", `/social/clans/${rats.id}/messages/${spoof.id}`), "delete");
assert.deepEqual([del.deleted, del.body], [true, ""]);
await until("Ben to see the deletion live", () => benL.seen.get(spoof.id)?.deleted);
ok("authors delete their own messages (others get 403/404), and the deletion shows up live");

// 6. Reconnection: drop every Realtime connection, send while it's down, and check
//    that each client catches up with exactly one copy of each message.
const before = benL.subscribedTimes;
const ids = [];
const resend = randomUUID();
await fetch(`${AUTH}/__test/realtime/drop`, { method: "POST" });
for (const body of ["sent while you were offline", "and another"]) {
  ids.push(okRes(await api(ana, "POST", `/social/clans/${rats.id}/messages`, { body, clientId: body === "and another" ? resend : undefined }), "offline send").id);
}
// A retry of the same send (same clientId) after the drop: same message, no copy.
assert.equal(okRes(await api(ana, "POST", `/social/clans/${rats.id}/messages`, { body: "and another", clientId: resend }), "retry").id, ids[1]);
await until("Ben's client to reconnect", () => benL.subscribedTimes > before, 20000);
await until("Ben to catch up", () => ids.every((id) => benL.seen.has(id)), 5000);
const afterDrop = okRes(await api(ana, "POST", `/social/clans/${rats.id}/messages`, { body: "back online" }), "after").id;
await until("live delivery after reconnecting", () => benL.seen.has(afterDrop));
page = okRes(await api(ben, "GET", `/social/clans/${rats.id}/messages?limit=100`), "all");
const serverIds = page.messages.map((m) => m.id);
assert.equal(new Set(serverIds).size, serverIds.length);
assert.equal(page.messages.filter((m) => m.body === "and another").length, 1);
assert.deepEqual([...benL.seen.keys()].filter((id) => id >= sent.id).sort((a, b) => a - b), serverIds.filter((id) => id >= sent.id));
ok(`after a dropped connection the clients reconnect (${benL.subscribedTimes - before}×) and catch up; retries and replays leave one copy of each message`);

// 7. Paging and unread.
for (let i = 0; i < 9; i++) okRes(await api(ben, "POST", `/social/clans/${rats.id}/messages`, { body: `burst ${i}` }), "burst");
await deny(ben, "POST", `/social/clans/${rats.id}/messages`, { body: "one too many" }, 429, "slow_down");
const first = okRes(await api(ana, "GET", `/social/clans/${rats.id}/messages?limit=5`), "page 1");
const older = okRes(await api(ana, "GET", `/social/clans/${rats.id}/messages?limit=5&before=${first.messages[0].id}`), "page 2");
assert.deepEqual([first.messages.length, first.hasMore, older.messages.length], [5, true, 5]);
assert.ok(older.messages.at(-1).id < first.messages[0].id);
let st = okRes(await api(ana, "GET", "/social/chat"), "status");
assert.deepEqual([st.clanId, st.unread], [rats.id, 9]);
st = okRes(await api(ana, "POST", `/social/clans/${rats.id}/read`, { messageId: st.lastId }), "read");
assert.equal(st.unread, 0);
ok("history pages (5 + 5 older), sending too fast is 429, and unread counts clear when read");

// 8. Leaving revokes access at once, including live delivery; ownership changes are announced.
okRes(await api(ana, "POST", "/social/clans/leave"), "ana leaves");
await deny(ana, "GET", `/social/clans/${rats.id}/messages`, undefined, 403, "not_clan_member");
await deny(ana, "POST", `/social/clans/${rats.id}/messages`, { body: "wait" }, 403, "not_clan_member");
// Dan joins now and sees the history, then says goodbye (Ben just hit the rate limit).
okRes(await api(dan, "POST", "/social/clans/join", { code: rats.code }), "dan joins");
const history = okRes(await api(dan, "GET", `/social/clans/${rats.id}/messages?limit=100`), "dan history").messages.map((m) => m.body);
assert.ok(history.includes("Leg day tomorrow? 🏋️"), "a new member sees earlier messages");
okRes(await api(dan, "POST", `/social/clans/${rats.id}/messages`, { body: "bye Ana" }), "after leave");
const tail = okRes(await api(ben, "GET", `/social/clans/${rats.id}/messages?limit=4`), "tail").messages.map((m) => m.body);
assert.deepEqual(tail.slice(-4), ["Ana left the clan.", "Ben is now the clan owner.", "Dan joined the clan.", "bye Ana"]);
await sleep(500);
assert.equal(anaL.events.filter((e) => e.new?.body === "bye Ana").length, 0, "Ana still received messages after leaving");
ok("after leaving, Ana can't read, send or receive live; the chat says she left and Ben took over; Dan joins and sees the history");

// 9. Existing betting and clan features still work for the same people.
const s = okRes(await api(ben, "POST", "/series", {
  title: "Chat week", plannedBetCount: 1, initialBankroll: 1000, loserCount: 1, stakeMode: "MONEY",
  bets: [{ question: "Will Ana come back?" }], settings: { minContribution: 5, betCreation: "upfront" },
}), "series");
okRes(await api(cat, "POST", "/series/join", { code: s.invite_code }), "join series");
for (const p of [ben, cat]) okRes(await api(p, "POST", `/series/${s.id}/ready`, { ready: true }), "ready");
okRes(await api(ben, "POST", `/series/${s.id}/start`), "start");
const state = okRes(await api(ben, "GET", "/series/state"), "state").series.find((x) => x.id === s.id);
okRes(await api(ben, "POST", `/series/${s.id}/bets/${state.bets[0].id}/wagers`, { outcomeId: state.bets[0].outcomes[0].id, amount: 100 }), "wager");
const social = okRes(await api(ben, "GET", "/social/state"), "social");
assert.equal(social.clan.ownerId, ben.id);
assert.ok(social.clanBoard.some((r) => r.name === "Gym Rats" && r.wagered === 100));
ok("series, wagers, the clan board and ownership keep working alongside chat");

await Promise.all([benL, anaL, catL, danL].map((l) => l.close()));
console.log(`\nAll ${step} checks passed.`);
process.exit(0);
