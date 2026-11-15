// End to end: wagers and new series happen at most once per submission id, through
// the Next API, against the local Supabase stand-in. Uses two app servers on the same
// database to stand in for multiple server instances.
//
//   node supabase/tests/local-supabase.mjs                                                     # :54399
//   SUPABASE_URL=http://localhost:54399 SUPABASE_PUBLISHABLE_KEY=local npx next start -p 3210   # instance A
//   SUPABASE_URL=http://localhost:54399 SUPABASE_PUBLISHABLE_KEY=local npx next start -p 3211   # instance B
//   API_URL=http://localhost:3210 API_URL_2=http://localhost:3211 npm run test:idempotency-local
import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID } from "node:crypto";

const A = process.env.API_URL ?? "http://localhost:3210";
const B = process.env.API_URL_2 ?? A;
const AUTH = process.env.SUPABASE_URL ?? "http://localhost:54399";
for (const u of [A, B, AUTH]) if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(u).hostname)) throw new Error("Local servers only.");

let step = 0;
const ok = (msg) => console.log(`  ✓ ${++step}. ${msg}`);
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
/** Send a request and hang up before reading the answer: the server gets it, the client never hears back. */
function sendAndDrop(base, who, path, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const u = new URL(`${base}/api${path}`);
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), Authorization: `Bearer ${who.token}` } });
    req.on("error", () => resolve());
    req.on("response", (res) => { res.destroy(); resolve(); }); // whatever came back is lost
    req.end(data);
    setTimeout(() => { req.destroy(); resolve(); }, 3000);
  });
}

console.log(`Idempotent submissions: instances ${A} and ${B}, auth ${AUTH}`);
const [ana, ben] = await Promise.all(["Ana", "Ben"].map(signUp));
const seriesBody = (title) => ({
  title, plannedBetCount: 2, initialBankroll: 1000, loserCount: 1, stakeMode: "MONEY",
  settings: { minContribution: 5, betCreation: "upfront" }, bets: [{ question: "Rain?" }, { question: "Snow?" }],
});
const mySeries = async () => okRes(await api(A, ana, "GET", "/series/state"), "state").series.filter((s) => s.hostId === ana.id);

// 1. Series: the same submission sent to both instances at once, then again, creates one series.
const sid = randomUUID();
const before = (await mySeries()).length;
const created = await Promise.all([A, B, A, B].map((base) => api(base, ana, "POST", "/series", { ...seriesBody("Weather week"), requestId: sid })));
for (const r of created) assert.equal(r.status, 201, JSON.stringify(r.error));
assert.equal(new Set(created.map((r) => r.result.id)).size, 1, "every answer names the same series");
assert.equal(created.filter((r) => r.result.replayed === false).length, 1);
assert.equal((await mySeries()).length, before + 1);
ok("4 identical create requests across 2 instances → 1 series; the other 3 get it back with replayed: true");

// 2. Series: the answer is lost, then the retry returns the series that was made.
const lostSid = randomUUID();
await sendAndDrop(B, ana, "/series", { ...seriesBody("Lost answer"), requestId: lostSid });
const retried = okRes(await api(A, ana, "POST", "/series", { ...seriesBody("Lost answer"), requestId: lostSid }), "retry");
assert.equal(retried.replayed, true);
assert.equal((await mySeries()).filter((s) => s.name === "Lost answer").length, 1);
const changed = await api(A, ana, "POST", "/series", { ...seriesBody("Different name"), requestId: lostSid });
assert.deepEqual([changed.status, changed.error.code], [409, "request_id_reused"]);
const second = okRes(await api(A, ana, "POST", "/series", { ...seriesBody("Lost answer"), requestId: randomUUID() }), "second");
assert.notEqual(second.id, retried.id);
ok("lost create answer + retry → the same series; same id with other details → 409; a new id → a second, separate series");

// Start the first series so there's a bet to wager on.
const s = created[0].result;
okRes(await api(A, ben, "POST", "/series/join", { code: s.invite_code }), "join");
for (const u of [ana, ben]) okRes(await api(A, u, "POST", `/series/${s.id}/ready`, { ready: true }), "ready");
okRes(await api(A, ana, "POST", `/series/${s.id}/start`), "start");
const bet = okRes(await api(A, ana, "GET", "/series/state"), "state").series.find((x) => x.id === s.id).bets[0];
const [yes, no] = bet.outcomes.map((o) => o.id);
const W = `/series/${s.id}/bets/${bet.id}/wagers`;
const coins = async (who) => okRes(await api(A, who, "GET", "/series/state"), "state").series.find((x) => x.id === s.id).standings.find((r) => r.userId === who.id).available;
const stakeOf = async (who) => okRes(await api(A, who, "GET", "/series/state"), "state").series.find((x) => x.id === s.id).bets[0].wagers.find((w) => w.userId === who.id)?.amount ?? 0;

// 3. Wager: a double tap that reaches both instances at once places one wager.
const wid = randomUUID();
const taps = await Promise.all([A, B, A, B, A].map((base) => api(base, ana, "POST", W, { outcomeId: yes, amount: 200, requestId: wid })));
for (const r of taps) assert.equal(r.status, 201, JSON.stringify(r.error));
assert.equal(new Set(taps.map((r) => r.result.wagerId)).size, 1);
assert.equal(taps.filter((r) => !r.result.replayed).length, 1);
assert.deepEqual([await coins(ana), await stakeOf(ana)], [800, 200]);
const receipt = taps.find((r) => !r.result.replayed).result;
assert.deepEqual([receipt.amount, receipt.previousStake, receipt.totalStake, receipt.addedToExisting, receipt.available], [200, 0, 200, false, 800]);
ok("5 identical wager requests across 2 instances → 1 wager of 200; coins 1000 → 800 once; receipt: new wager, total 200, 800 free");

// 4. Wager: the answer is lost, the retry gets the original receipt and nothing more is taken.
const lostWid = randomUUID();
await sendAndDrop(B, ana, W, { outcomeId: yes, amount: 50, requestId: lostWid });
const afterLost = await coins(ana);
assert.equal(afterLost, 750, "the lost-answer wager did go through");
const retry = okRes(await api(A, ana, "POST", W, { outcomeId: yes, amount: 50, requestId: lostWid }), "retry");
assert.deepEqual([retry.replayed, retry.amount, retry.previousStake, retry.totalStake, retry.addedToExisting, retry.available], [true, 50, 200, 250, true, 750]);
assert.deepEqual([await coins(ana), await stakeOf(ana)], [750, 250]);
ok("lost wager answer + retry → replayed receipt (added 50, total 250, 750 free); coins taken once");

// 5. Same id, different amount: refused, nothing changes.
const reused = await api(A, ana, "POST", W, { outcomeId: yes, amount: 60, requestId: lostWid });
assert.deepEqual([reused.status, reused.error.code], [409, "request_id_reused"]);
assert.deepEqual([await coins(ana), await stakeOf(ana)], [750, 250]);
ok("same id with a different amount → 409 request_id_reused; coins and stake unchanged");

// 6. Separate, intentional submissions still add up.
const add = okRes(await api(B, ana, "POST", W, { outcomeId: yes, amount: 25, requestId: randomUUID() }), "add");
assert.deepEqual([add.addedToExisting, add.previousStake, add.totalStake, add.available], [true, 250, 275, 725]);
ok("a new submission adds on purpose: 250 → 275, 725 free");

// 7. Failures: too much, wrong side, a bad id; none change anything.
const tooMuch = await api(A, ben, "POST", W, { outcomeId: no, amount: 5000, requestId: randomUUID() });
assert.deepEqual([tooMuch.status, tooMuch.error.code], [400, "insufficient_balance"]);
okRes(await api(A, ben, "POST", W, { outcomeId: no, amount: 100, requestId: randomUUID() }), "ben no");
const flip = await api(A, ben, "POST", W, { outcomeId: yes, amount: 10, requestId: randomUUID() });
assert.equal(flip.error.code, "cannot_switch_sides");
const badId = await api(A, ben, "POST", W, { outcomeId: no, amount: 10, requestId: "not-a-uuid" });
assert.deepEqual([badId.status, badId.error.code], [400, "invalid_request"]);
assert.equal(await coins(ben), 900);
ok("insufficient coins, switching sides and a malformed id are refused; Ben's coins stay 900");

// 8. Older callers without a requestId still work (no deduplication for them).
okRes(await api(A, ben, "POST", W, { outcomeId: no, amount: 10 }), "legacy");
assert.equal(await coins(ben), 890);
ok("requests without a requestId behave as before");

console.log(`\nAll ${step} checks passed.`);
