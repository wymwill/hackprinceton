// End to end: scheduled bet closing and opt-in reminders through the Next API, against
// the local Supabase stand-in, on real server time (bets close a few seconds after creation).
// Two app instances stand in for multiple servers. No scheduler runs anywhere in this test.
//
//   node tests/sql/local-supabase.mjs                                                          # :54399
//   SUPABASE_URL=http://localhost:54399 SUPABASE_PUBLISHABLE_KEY=local npx next start -p 3210   # instance A
//   SUPABASE_URL=http://localhost:54399 SUPABASE_PUBLISHABLE_KEY=local npx next start -p 3211   # instance B
//   API_URL=http://localhost:3210 API_URL_2=http://localhost:3211 npm run test:deadlines-local
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const A = process.env.API_URL ?? "http://localhost:3210";
const B = process.env.API_URL_2 ?? A;
const AUTH = process.env.SUPABASE_URL ?? "http://localhost:54399";
for (const u of [A, B, AUTH]) if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(u).hostname)) throw new Error("Local servers only.");

let step = 0;
const ok = (msg) => console.log(`  ✓ ${++step}. ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function signUp(name) {
  const r = await fetch(`${AUTH}/auth/v1/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@example.com`, password: "local-test-pw", data: { full_name: name } }) });
  const s = await r.json();
  assert.ok(s.access_token, JSON.stringify(s));
  return { name, id: s.user.id, token: s.access_token };
}
async function api(base, who, method, path, body) {
  const r = await fetch(`${base}/api${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${who.token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, result: j.result, error: j.error };
}
const okRes = (r, what) => {
  assert.ok(r.status < 300, `${what}: ${r.status} ${JSON.stringify(r.error)}`);
  return r.result;
};
const view = async (who) => okRes(await api(A, who, "GET", "/series/state"), "state");
const betOf = async (who, sid, bid) => (await view(who, sid)).series.find((x) => x.id === sid).bets.find((b) => b.id === bid);
const freeOf = async (who, sid) => (await view(who, sid)).series.find((x) => x.id === sid).standings.find((r) => r.userId === who.id).available;

console.log(`Scheduled closing and reminders: instances ${A} and ${B}, auth ${AUTH}`);
const [host, ann, bob] = await Promise.all(["Host", "Ann", "Bob"].map(signUp));
const s = okRes(await api(A, host, "POST", "/series", {
  title: "Deadline week", plannedBetCount: 8, initialBankroll: 1000, loserCount: 1, stakeMode: "MONEY",
  settings: { minContribution: 5, betCreation: "during", withdrawMinutes: 0 }, requestId: randomUUID(),
}), "create series");
for (const p of [ann, bob]) okRes(await api(A, p, "POST", "/series/join", { code: s.invite_code }), "join");
for (const p of [host, ann, bob]) okRes(await api(A, p, "POST", `/series/${s.id}/ready`, { ready: true }), "ready");
okRes(await api(A, host, "POST", `/series/${s.id}/start`), "start");
const newBet = async (question, closesAt) => okRes(await api(A, host, "POST", `/series/${s.id}/bets`, { question, ...(closesAt === undefined ? {} : { closesAt }) }), `bet ${question}`);
const at = (ms) => new Date(Date.now() + ms).toISOString();

// 1. Validation.
for (const [closesAt, why] of [["2031-05-01T12:00", "no timezone"], [at(-60_000), "in the past"], ["tomorrow", "not a date"]]) {
  const r = await api(A, host, "POST", `/series/${s.id}/bets`, { question: `Bad deadline (${why})?`, closesAt });
  assert.deepEqual([r.status, r.error.code], [400, "invalid_deadline"], why);
}
ok("closing times without a timezone, in the past, or not dates are refused (400 invalid_deadline)");

// 2. Timezones: the same instant written three ways reads back the same.
const instant = new Date(Date.now() + 3 * 86_400_000);
instant.setUTCSeconds(0, 0);
const asOffset = (mins) => {
  const local = new Date(instant.getTime() + mins * 60_000).toISOString().slice(0, 19);
  const sign = mins < 0 ? "-" : "+";
  return `${local}${sign}${String(Math.floor(Math.abs(mins) / 60)).padStart(2, "0")}:${String(Math.abs(mins) % 60).padStart(2, "0")}`;
};
const zones = await Promise.all([asOffset(9 * 60), asOffset(-5 * 60), instant.toISOString()].map((c, i) => newBet(`Zone bet ${i}?`, c)));
for (const z of zones) assert.equal(Date.parse((await betOf(ann, s.id, z.id)).closesAt), instant.getTime());
ok("a closing time written as +09:00, -05:00 or Z is stored and shown as the same instant");

// 3. A bet closes on its own at its deadline, on server time, with wagers racing it from two instances.
const race = await newBet("Will the race be fair?", at(4000));
const outcomes = (await betOf(ann, s.id, race.id)).outcomes;
assert.equal((await betOf(ann, s.id, race.id)).status, "open");
okRes(await api(A, ann, "POST", `/series/${s.id}/bets/${race.id}/wagers`, { outcomeId: outcomes[0].id, amount: 100, requestId: randomUUID() }), "early ann");
// Bob takes the other side early, so the pool isn't one-sided (which would refund at the close).
okRes(await api(A, bob, "POST", `/series/${s.id}/bets/${race.id}/wagers`, { outcomeId: outcomes[1].id, amount: 100, requestId: randomUUID() }), "early bob");
const deadline = Date.parse((await betOf(ann, s.id, race.id)).closesAt);
await sleep(Math.max(0, deadline - Date.now() - 600));
const attempts = [];
for (let i = 0; i < 12; i++) {
  attempts.push(api(i % 2 ? B : A, i % 3 ? bob : ann, "POST", `/series/${s.id}/bets/${race.id}/wagers`, { outcomeId: outcomes[i % 3 ? 1 : 0].id, amount: 5, requestId: randomUUID() }));
  await sleep(100);
}
const results = await Promise.all(attempts);
const accepted = results.filter((r) => r.status === 201).map((r) => r.result);
const refused = results.filter((r) => r.status !== 201);
assert.ok(refused.length > 0, "some attempts came after the deadline");
for (const r of refused) assert.equal(r.error.code, "bet_not_open", JSON.stringify(r.error));
for (const w of accepted) assert.ok(Date.parse(w.placedAt) < deadline, `accepted wager placed at ${w.placedAt}, after the deadline`);
const after = await api(B, bob, "POST", `/series/${s.id}/bets/${race.id}/wagers`, { outcomeId: outcomes[1].id, amount: 5, requestId: randomUUID() });
assert.equal(after.error.code, "bet_not_open");
const closed = await betOf(host, s.id, race.id);
assert.deepEqual([closed.status, Date.parse(closed.closedAt)], ["closed", deadline]);
ok(`12 wagers from 2 instances straddling the deadline: ${accepted.length} accepted (all placed before it), ${refused.length} refused; the bet reads closed as of the deadline, with no host action`);

// 4. Coins: only accepted wagers were taken.
const annPut = 100 + accepted.filter((w) => w.outcome === outcomes[0].label).length * 5;
assert.equal(await freeOf(ann, s.id), 1000 - annPut);
ok(`refused late wagers took nothing: Ann has ${1000 - annPut} free`);

// 5. Manual close before the deadline still works.
const early = await newBet("Close it early?", at(3_600_000));
okRes(await api(A, host, "POST", `/series/${s.id}/bets/${early.id}/lock`), "lock");
assert.equal((await betOf(ann, s.id, early.id)).status, "closed");
ok("the host can still close a bet before its deadline");

// 6. Reminders: off by default; opting in shows each action once; doing it clears it.
assert.deepEqual(okRes(await api(A, bob, "GET", "/notifications"), "n").notifications, []);
const soon = await newBet("Remind me?", at(2 * 3_600_000));
let n = okRes(await api(A, bob, "GET", "/notifications"), "n");
assert.deepEqual(n.notifications, [], "not opted in yet");
n = okRes(await api(A, bob, "PATCH", "/notifications/prefs", { closingBets: true }), "prefs");
const mine = n.notifications.filter((x) => x.refId === soon.id);
assert.equal(mine.length, 1);
for (let i = 0; i < 3; i++) await api(i % 2 ? B : A, bob, "GET", "/notifications");
n = okRes(await api(B, bob, "GET", "/notifications"), "n");
assert.deepEqual(n.notifications.filter((x) => x.refId === soon.id).map((x) => x.id), [mine[0].id], "still exactly one, from either instance");
okRes(await api(A, bob, "POST", "/notifications/read", { ids: [mine[0].id] }), "read");
assert.equal(okRes(await api(A, bob, "GET", "/notifications"), "n").notifications.find((x) => x.id === mine[0].id).read, true);
const soonOutcomes = (await betOf(bob, s.id, soon.id)).outcomes;
okRes(await api(A, bob, "POST", `/series/${s.id}/bets/${soon.id}/wagers`, { outcomeId: soonOutcomes[0].id, amount: 10, requestId: randomUUID() }), "bob bets");
assert.equal(okRes(await api(A, bob, "GET", "/notifications"), "n").notifications.filter((x) => x.refId === soon.id).length, 0);
ok("reminders: none until Bob opts in; then one for the closing bet (same one on every check, from both instances); marked read; gone once he bets");

// 7. The host is reminded to call results for bets that closed at their deadline; settling clears it; opting out stops it.
okRes(await api(A, host, "PATCH", "/notifications/prefs", { unresolvedResults: true }), "host prefs");
n = okRes(await api(A, host, "GET", "/notifications"), "n");
assert.ok(n.notifications.some((x) => x.kind === "unresolved_result" && x.refId === race.id), "the race bet closed by its deadline needs a result");
okRes(await api(A, host, "POST", `/series/${s.id}/bets/${race.id}/resolve`, { outcomeId: outcomes[0].id }), "resolve");
n = okRes(await api(A, host, "GET", "/notifications"), "n");
assert.ok(!n.notifications.some((x) => x.refId === race.id));
okRes(await api(A, host, "PATCH", "/notifications/prefs", { unresolvedResults: false }), "opt out");
assert.deepEqual(okRes(await api(A, host, "GET", "/notifications"), "n").notifications.filter((x) => x.kind === "unresolved_result"), []);
ok("the host is reminded about the bet that closed by its deadline, the reminder clears once it's settled, and opting out removes the rest");

console.log(`\nAll ${step} checks passed.`);
