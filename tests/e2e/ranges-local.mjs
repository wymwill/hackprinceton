// End to end over HTTP: numerical range bets through the Next API, against the local
// Supabase stand-in (no real project, no secrets). Same setup as outcomes-local.mjs:
//
//   node tests/sql/local-supabase.mjs                                              # :54399
//   SUPABASE_URL=http://localhost:54399 SUPABASE_PUBLISHABLE_KEY=local npx next dev -p 3210
//   API_URL=http://localhost:3210 npm run test:ranges-local
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const API = process.env.API_URL ?? "http://localhost:3210";
const AUTH = process.env.SUPABASE_URL ?? "http://localhost:54399";
if (!/localhost|127\.0\.0\.1/.test(AUTH)) throw new Error("This test signs up throwaway users; point SUPABASE_URL at the local stand-in only.");

let step = 0;
const ok = (msg) => console.log(`  ✓ ${++step}. ${msg}`);

async function signUp(name) {
  const res = await fetch(`${AUTH}/auth/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: "local" },
    body: JSON.stringify({ email: `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@example.com`, password: "local-test-pw", data: { full_name: name } }),
  });
  const s = await res.json();
  assert.ok(s.access_token, `sign up ${name}: ${JSON.stringify(s)}`);
  return { name, id: s.user.id, token: s.access_token };
}
async function api(who, method, path, body) {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${who.token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, result: json.result, error: json.error };
}
const okRes = (r, what) => {
  assert.ok(r.status < 300, `${what}: ${r.status} ${JSON.stringify(r.error)}`);
  return r.result;
};
const view = async (who, id) => okRes(await api(who, "GET", "/series/state"), "state").series.find((s) => s.id === id);
const byLabel = (bet) => Object.fromEntries(bet.outcomes.map((o) => [o.label, o.id]));
const cuts = (points, { openBelow = true, openAbove = true } = {}) => [
  ...(openBelow ? [{ lower: null, upper: points[0] }] : []),
  ...points.slice(0, -1).map((p, i) => ({ lower: p, upper: points[i + 1] })),
  ...(openAbove ? [{ lower: points.at(-1), upper: null }] : []),
];
const TEMP = { question: "What will tomorrow's high temperature be?", kind: "range", unit: "°F", decimals: 0, ranges: cuts([60, 65, 70, 75, 80]) };

console.log(`Range bets, end to end: API ${API}, auth ${AUTH}`);
const [host, a, b, c] = await Promise.all(["Host", "Ava", "Ben", "Cal"].map(signUp));

// 1. Create the six-range temperature market alongside a YES/NO and a multiple-choice bet.
const s = okRes(await api(host, "POST", "/series", {
  title: "Weather week", plannedBetCount: 5, initialBankroll: 1000, loserCount: 1, stakeMode: "MONEY",
  bets: [TEMP, { question: "Will it rain?" }, { question: "Windiest day?", outcomes: ["Mon", "Tue", "Wed"] }],
  settings: { minContribution: 5, betCreation: "during", withdrawMinutes: 10 },
}), "create");
let v = await view(host, s.id);
let [temp, yn, mc] = v.bets;
assert.deepEqual(temp.outcomes.map((o) => o.label), ["Below 60°F", "60–64°F", "65–69°F", "70–74°F", "75–79°F", "80°F or above"]);
assert.deepEqual([temp.kind, temp.unit, temp.decimals, yn.kind, mc.kind], ["range", "°F", 0, "binary", "multi"]);
ok("POST /series creates the six-range temperature market next to YES/NO and multiple-choice bets");

// 2. Validation over HTTP, and draft edits.
const bad = async (ranges, extra = {}) => api(host, "POST", `/series/${s.id}/bets`, { question: "Bad?", kind: "range", unit: "°F", decimals: 0, ranges, ...extra });
for (const [r, why] of [
  [[{ lower: null, upper: 60 }, { lower: 61, upper: null }], /gap/],
  [[{ lower: null, upper: 60 }, { lower: 55, upper: null }], /overlaps/],
  [[{ lower: 10, upper: 20 }, { lower: null, upper: 30 }], /first range can be open/],
  [cuts([60.5, 61]), /decimal/],
]) {
  const res = await bad(r);
  assert.deepEqual([res.status, res.error.code], [400, "invalid_ranges"]);
  assert.match(res.error.message, why);
}
okRes(await api(host, "PATCH", `/series/${s.id}/bets/${temp.id}`, { unit: "°C", decimals: 1 }), "relabel");
assert.equal((await view(host, s.id)).bets[0].outcomes[1].label, "60.0–64.9°C");
okRes(await api(host, "PATCH", `/series/${s.id}/bets/${temp.id}`, { kind: "range", ranges: TEMP.ranges, unit: "°F", decimals: 0 }), "back to °F");
ok("gaps, overlaps, inner open ends and extra decimals are 400 invalid_ranges; draft unit/precision edits relabel the ranges");

// 3. Join, ready, start; ranges lock.
for (const p of [a, b, c]) okRes(await api(p, "POST", "/series/join", { code: s.invite_code }), `join ${p.name}`);
for (const p of [host, a, b, c]) okRes(await api(p, "POST", `/series/${s.id}/ready`, { ready: true }), `ready ${p.name}`);
okRes(await api(host, "POST", `/series/${s.id}/start`), "start");
const locked = await api(host, "PATCH", `/series/${s.id}/bets/${temp.id}`, { unit: "°C" });
assert.deepEqual([locked.status, locked.error.code], [409, "outcomes_locked"]);
ok("after start, editing ranges or units is 409 outcomes_locked");

// 4. Wager on different ranges.
temp = (await view(host, s.id)).bets[0];
const o = byLabel(temp);
const w = (p, body) => api(p, "POST", `/series/${s.id}/bets/${temp.id}/wagers`, body);
okRes(await w(a, { outcomeId: o["70–74°F"], amount: 200 }), "ava");
okRes(await w(b, { outcomeId: o["65–69°F"], amount: 300 }), "ben");
okRes(await w(c, { outcomeId: o["70–74°F"], amount: 100 }), "cal");
okRes(await w(host, { outcomeId: o["80°F or above"], amount: 150 }), "host");
assert.equal((await w(b, { outcomeId: o["70–74°F"], amount: 5 })).error.code, "cannot_switch_sides");
v = await view(a, s.id);
assert.deepEqual(v.bets[0].outcomes.map((x) => x.pool), [0, 0, 300, 300, 0, 150]);
ok("four players wager on three ranges; pool shares are per range; switching ranges is refused");

// 5. Settlement: picking a range by hand is refused; entering 72 picks 70–74°F.
const pick = await api(host, "POST", `/series/${s.id}/bets/${temp.id}/resolve`, { outcomeId: o["65–69°F"] });
assert.deepEqual([pick.status, pick.error.code], [400, "invalid_outcome"]);
const vague = await api(host, "POST", `/series/${s.id}/bets/${temp.id}/resolve`, { value: 72.5 });
assert.equal(vague.error.code, "invalid_result");
const text = await api(host, "POST", `/series/${s.id}/bets/${temp.id}/resolve`, { value: "72" });
assert.equal(text.error.code, "invalid_result");
const r = okRes(await api(host, "POST", `/series/${s.id}/bets/${temp.id}/resolve`, { value: 72 }), "settle 72");
assert.equal(r.outcomeId, o["70–74°F"]);
const pay = Object.fromEntries(r.payouts.map((p) => [p.userId, p.gross]));
// Pool 750, 70–74 side 300: Ava 200 → 500, Cal 100 → 250.
assert.deepEqual([pay[a.id], pay[c.id], pay[b.id], pay[host.id]], [500, 250, 0, 0]);
const again = await api(host, "POST", `/series/${s.id}/bets/${temp.id}/resolve`, { value: 60 });
assert.deepEqual([again.status, again.error.code], [409, "bet_not_open"]);
temp = (await view(host, s.id)).bets[0];
assert.deepEqual([temp.status, temp.resultValue, temp.outcomeId], ["resolved", 72, o["70–74°F"]]);
ok("naming a range or a mis-precise value is refused; { value: 72 } picks 70–74°F and pays 500 / 250; repeats are 409");

// 6. A mid-series range with decimals, negatives and closed ends: outside every range refunds.
const live = okRes(await api(host, "POST", `/series/${s.id}/bets`, {
  question: "Overnight low?", kind: "range", unit: "°C", decimals: 1, ranges: cuts([-10, -5, 0, 2.5], { openBelow: false }),
}), "live range");
let lb = (await view(host, s.id)).bets.find((x) => x.id === live.id);
assert.deepEqual(lb.outcomes.map((x) => x.label), ["-10.0 to -5.1°C", "-5.0 to -0.1°C", "0.0–2.4°C", "2.5°C or above"]);
const lo = byLabel(lb);
okRes(await api(a, "POST", `/series/${s.id}/bets/${live.id}/wagers`, { outcomeId: lo["-5.0 to -0.1°C"], amount: 40 }), "ava low");
okRes(await api(b, "POST", `/series/${s.id}/bets/${live.id}/wagers`, { outcomeId: lo["0.0–2.4°C"], amount: 60 }), "ben low");
const out = okRes(await api(host, "POST", `/series/${s.id}/bets/${live.id}/resolve`, { value: -12.3 }), "outside");
assert.deepEqual([out.refunded, out.outcomeId], [true, null]);
ok("-12.3°C is below every closed range, so everyone's coins come back");

// 7. The other kinds still settle as before.
okRes(await api(a, "POST", `/series/${s.id}/bets/${yn.id}/wagers`, { outcome: "YES", amount: 10 }), "yes");
okRes(await api(b, "POST", `/series/${s.id}/bets/${yn.id}/wagers`, { outcome: "NO", amount: 10 }), "no");
assert.equal((await api(host, "POST", `/series/${s.id}/bets/${yn.id}/resolve`, { value: 1 })).error.code, "invalid_result");
okRes(await api(host, "POST", `/series/${s.id}/bets/${yn.id}/resolve`, { outcome: "YES" }), "yes resolves");
okRes(await api(a, "POST", `/series/${s.id}/bets/${mc.id}/wagers`, { outcomeId: byLabel(mc).Tue, amount: 10 }), "mc a");
okRes(await api(c, "POST", `/series/${s.id}/bets/${mc.id}/wagers`, { outcomeId: byLabel(mc).Wed, amount: 10 }), "mc c");
okRes(await api(host, "POST", `/series/${s.id}/bets/${mc.id}/resolve`, { tiedOutcomeIds: [byLabel(mc).Tue, byLabel(mc).Wed] }), "mc tie");
ok("YES/NO and multiple-choice bets still settle by outcome (and refuse a number)");

// 8. Standings and leaderboard agree; coins are conserved.
v = await view(host, s.id);
const board = okRes(await api(c, "GET", `/series/${s.id}/leaderboard`), "leaderboard");
assert.deepEqual(board.map((x) => x.display_name), v.standings.map((x) => v.members.find((m) => m.userId === x.userId).name));
const coins = Object.fromEntries(v.standings.map((x) => [x.userId, x.coins]));
// Ava: +300 +10 = 1310. Ben: -300 -10 = 690. Cal: +150 = 1150. Host: -150 = 850 (the tie refunded).
assert.deepEqual([coins[a.id], coins[b.id], coins[c.id], coins[host.id]], [1310, 690, 1150, 850]);
ok(`standings and GET /leaderboard agree: ${board.map((x) => `${x.display_name} ${x.balance}`).join(", ")}`);

console.log(`\nAll ${step} checks passed.`);
