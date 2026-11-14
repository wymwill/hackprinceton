// End to end over HTTP: multiple-choice bets through the Next API, against the local
// Supabase stand-in (no real project, no secrets).
//
//   node supabase/tests/local-supabase.mjs                                         # :54399
//   SUPABASE_URL=http://localhost:54399 SUPABASE_PUBLISHABLE_KEY=local npx next dev -p 3210
//   API_URL=http://localhost:3210 npm run test:outcomes-local
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

console.log(`Multiple-choice bets, end to end: API ${API}, auth ${AUTH}`);
const [will, jake, mal, sam] = await Promise.all(["Will", "Jake", "Malachi", "Sam"].map(signUp));

// 1. Create with a four-option bet and a YES/NO bet.
const s = okRes(
  await api(will, "POST", "/series", {
    title: "Midterm season", plannedBetCount: 4, initialBankroll: 1000, loserCount: 1, stakeMode: "MONEY",
    bets: [{ question: "Who will score highest on the midterm?", outcomes: ["Will", "Jake", "Malachi", "Other"] }, { question: "Will the curve help?" }],
    settings: { minContribution: 5, betCreation: "during", withdrawMinutes: 10 },
  }),
  "create"
);
let v = await view(will, s.id);
let [mid, yn] = v.bets;
assert.deepEqual([mid.kind, mid.outcomes.length, yn.kind], ["multi", 4, "binary"]);
ok("POST /series creates a four-option bet and a YES/NO bet");

// 2. Edit the draft: rename, reorder, keep ids.
const before = byLabel(mid);
okRes(await api(will, "PATCH", `/series/${s.id}/bets/${mid.id}`, {
  outcomes: [{ id: before.Malachi, label: "Malachi" }, { id: before.Will, label: "Will W." }, { id: before.Jake, label: "Jake" }, { id: before.Other, label: "Other" }],
  tieRule: "first_listed",
}), "edit draft");
mid = (await view(will, s.id)).bets[0];
assert.deepEqual(mid.outcomes.map((o) => [o.label, o.id]), [["Malachi", before.Malachi], ["Will W.", before.Will], ["Jake", before.Jake], ["Other", before.Other]]);
assert.equal(mid.tieRule, "first_listed");
const notHost = await api(jake, "PATCH", `/series/${s.id}/bets/${mid.id}`, { question: "Hijack?" });
assert.equal(notHost.status, 403);
const dupes = await api(will, "PATCH", `/series/${s.id}/bets/${mid.id}`, { outcomes: [{ label: "A" }, { label: "a" }] });
assert.deepEqual([dupes.status, dupes.error.code], [400, "invalid_outcomes"]);
ok("PATCH renames and reorders draft outcomes with stable ids; non-hosts get 403; duplicates get 400");

// 3. Join, ready, start. Outcomes lock.
for (const p of [jake, mal, sam]) okRes(await api(p, "POST", "/series/join", { code: s.invite_code }), `join ${p.name}`);
for (const p of [will, jake, mal, sam]) okRes(await api(p, "POST", `/series/${s.id}/ready`, { ready: true }), `ready ${p.name}`);
okRes(await api(will, "POST", `/series/${s.id}/start`), "start");
const locked = await api(will, "PATCH", `/series/${s.id}/bets/${mid.id}`, { outcomes: [{ label: "X" }, { label: "Y" }] });
assert.deepEqual([locked.status, locked.error.code], [409, "outcomes_locked"]);
ok("starting opens the bets; editing outcomes afterwards is 409 outcomes_locked");

// 4. Wager on different people by outcome id; YES/NO still takes the old body.
const o = byLabel(mid);
const w = (p, betId, body) => api(p, "POST", `/series/${s.id}/bets/${betId}/wagers`, body);
okRes(await w(jake, mid.id, { outcomeId: o.Jake, amount: 300 }), "jake wagers");
okRes(await w(mal, mid.id, { outcomeId: o.Malachi, amount: 200 }), "mal wagers");
okRes(await w(sam, mid.id, { outcomeId: o["Will W."], amount: 150 }), "sam wagers");
okRes(await w(will, mid.id, { outcomeId: o.Other, amount: 100 }), "will wagers");
okRes(await w(jake, yn.id, { outcome: "YES", amount: 50 }), "legacy YES");
okRes(await w(mal, yn.id, { outcomeId: byLabel(yn).NO, amount: 50 }), "NO by id");
const bad = await w(sam, mid.id, { outcomeId: byLabel(yn).YES, amount: 10 });
assert.deepEqual([bad.status, bad.error.code], [400, "invalid_wager"]);
const sw = await w(jake, mid.id, { outcomeId: o.Malachi, amount: 10 });
assert.equal(sw.error.code, "cannot_switch_sides");
const broke = await w(mal, mid.id, { outcomeId: o.Malachi, amount: 5000 });
assert.equal(broke.error.code, "insufficient_balance");
mid = (await view(sam, s.id)).bets[0];
assert.deepEqual(mid.outcomes.map((x) => [x.label, x.pool]), [["Malachi", 200], ["Will W.", 150], ["Jake", 300], ["Other", 100]]);
ok("wagers by outcome id (and legacy YES) land on the right pools; wrong-bet ids, switching and overspending are refused");

// 5. Withdraw inside the window, then pick again.
okRes(await api(sam, "POST", `/series/${s.id}/bets/${mid.id}/withdraw`), "withdraw");
okRes(await w(sam, mid.id, { outcomeId: o.Malachi, amount: 100 }), "re-pick");
ok("withdrawing inside the window lets a player pick a different outcome");

// 6. Resolve the midterm: Malachi wins. Pool 700, Malachi side 300 (Malachi 200 + Sam 100).
const r = okRes(await api(will, "POST", `/series/${s.id}/bets/${mid.id}/resolve`, { outcomeId: o.Malachi }), "resolve");
const pay = Object.fromEntries(r.payouts.map((p) => [p.userId, p.gross]));
// 200 × 700 / 300 = 466.67 → 466 (+1 leftover, biggest stake) = 467; 100 × 700 / 300 = 233.33 → 233.
assert.deepEqual([pay[mal.id], pay[sam.id], pay[jake.id], pay[will.id]], [467, 233, 0, 0]);
assert.equal(r.payouts.reduce((a, p) => a + p.gross, 0), 700);
const again = await api(will, "POST", `/series/${s.id}/bets/${mid.id}/resolve`, { outcomeId: o.Jake });
assert.deepEqual([again.status, again.error.code], [409, "bet_not_open"]);
ok("resolving pays 467 / 233 to the Malachi backers (exactly the 700 pool); resolving again is 409");

// 7. Concurrent resolves on the YES/NO bet: exactly one wins.
const racers = await Promise.all([0, 1, 2].map(() => api(will, "POST", `/series/${s.id}/bets/${yn.id}/resolve`, { outcome: "YES" })));
assert.equal(racers.filter((x) => x.status === 200).length, 1);
assert.ok(racers.filter((x) => x.status !== 200).every((x) => x.error.code === "bet_not_open"));
ok("three simultaneous resolves: one succeeds, two get bet_not_open");

// 8. A bet added mid-series opens right away; a tie under first_listed.
const live = okRes(await api(will, "POST", `/series/${s.id}/bets`, { question: "Who finishes the problem set first?", outcomes: ["Sam", "Jake", "Malachi"], tieRule: "first_listed" }), "add live bet");
assert.equal(live.status, "OPEN");
let lb = (await view(will, s.id)).bets.find((b) => b.id === live.id);
const lo = byLabel(lb);
okRes(await w(sam, live.id, { outcomeId: lo.Sam, amount: 60 }), "sam on Sam");
okRes(await w(jake, live.id, { outcomeId: lo.Jake, amount: 90 }), "jake on Jake");
okRes(await w(mal, live.id, { outcomeId: lo.Malachi, amount: 30 }), "mal on Malachi");
const shortTie = await api(will, "POST", `/series/${s.id}/bets/${live.id}/resolve`, { tiedOutcomeIds: [lo.Jake] });
assert.equal(shortTie.error.code, "invalid_outcome");
const t = okRes(await api(will, "POST", `/series/${s.id}/bets/${live.id}/resolve`, { tiedOutcomeIds: [lo.Jake, lo.Sam] }), "tie");
assert.equal(t.outcomeId, lo.Sam);
assert.equal(Object.fromEntries(t.payouts.map((p) => [p.userId, p.gross]))[sam.id], 180);
lb = (await view(will, s.id)).bets.find((b) => b.id === live.id);
assert.deepEqual([lb.outcomeId, [...lb.tiedOutcomeIds].sort()], [lo.Sam, [lo.Jake, lo.Sam].sort()]);
ok("Sam and Jake tie; Sam is listed first, so Sam's 60 takes the 180 pool");

// 9. Standings and the leaderboard route agree.
v = await view(will, s.id);
const board = okRes(await api(mal, "GET", `/series/${s.id}/leaderboard`), "leaderboard");
assert.deepEqual(board.map((b) => b.display_name), v.standings.map((x) => v.members.find((m) => m.userId === x.userId).name));
const coins = Object.fromEntries(v.standings.map((x) => [x.userId, x.coins]));
// Will: -100. Jake: -300 +50 -90. Malachi: +267 -50 -30. Sam: +133 (withdrew 150, re-picked 100) +120.
assert.deepEqual([coins[will.id], coins[jake.id], coins[mal.id], coins[sam.id]], [900, 660, 1187, 1253]);
assert.equal(Object.values(coins).reduce((a, b) => a + b, 0), 4000);
ok(`standings and GET /leaderboard agree: ${board.map((b) => `${b.display_name} ${b.balance}`).join(", ")}; total coins conserved`);

console.log(`\nAll ${step} checks passed.`);
