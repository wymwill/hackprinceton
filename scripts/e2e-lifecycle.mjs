#!/usr/bin/env node
/**
 * End-to-end check of the bet lifecycle against a running Bookie server.
 *
 *   BOOKIE_DATA_FILE=/tmp/bookie-test.json npm run dev   # in one terminal
 *   npm run test:e2e                                     # in another
 *
 * Uses a cookie per friend, so it exercises the same API the screens use.
 */
import assert from "node:assert/strict";

const BASE = process.env.BOOKIE_URL ?? "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let step = 0;
const ok = (msg) => console.log(`  ✓ ${++step}. ${msg}`);

async function call(as, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", Cookie: `bookie_user=${as}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}
const state = async (as = "alex") => (await call(as, "GET", "/api/state")).json;
const balances = async () => Object.fromEntries((await state()).users.map((u) => [u.id, u.balance]));
const total = (b) => Object.values(b).reduce((a, x) => a + x, 0);
const inFuture = (ms) => new Date(Date.now() + ms).toISOString();

console.log(`Bookie lifecycle e2e against ${BASE}`);
const start = await balances();
const pointsInPlay = async () => {
  const s = await state();
  return total(Object.fromEntries(s.users.map((u) => [u.id, u.balance]))) + s.users.reduce((a, u) => a + u.atRisk, 0);
};
const conserved = await pointsInPlay();

// Create
const created = await call("alex", "POST", "/api/bets", {
  proposition: "E2E: Will the demo work first try?",
  outcomes: ["Yes", "No"],
  deadline: inFuture(60 * 60_000),
  stake: 100,
  pick: 0,
  category: "Projects",
});
assert.equal(created.status, 201, JSON.stringify(created.json));
const bet = created.json.result;
let view = (await state("sam")).bets.find((b) => b.id === bet.id);
assert.ok(view, "new bet visible to other friends");
assert.equal(view.groupId, "gym-arc");
assert.equal(view.status, "open");
assert.equal((await balances()).alex, start.alex - 100);
ok("creating a bet adds it to the group feed and takes the creator's stake");

// Bad input
assert.equal((await call("alex", "POST", "/api/bets", { proposition: "x", outcomes: ["A"], deadline: inFuture(1000), stake: 1 })).status, 400);
assert.equal((await call("alex", "POST", "/api/bets", { proposition: "Past", outcomes: ["A", "B"], deadline: inFuture(-1000), stake: 1 })).status, 400);
ok("invalid bets are rejected");

// Join (multiple users)
for (const [who, outcomeId, amount] of [["sam", "o2", 200], ["priya", "o1", 50], ["elena", "o2", 30]]) {
  const r = await call(who, "POST", `/api/bets/${bet.id}/entries`, { outcomeId, amount });
  assert.equal(r.status, 201, `${who}: ${JSON.stringify(r.json)}`);
}
view = (await state()).bets.find((b) => b.id === bet.id);
assert.equal(view.entries.length, 4);
assert.equal(view.pool, 380);
ok("multiple friends can join the same bet");

// Overspending and duplicates
const jakeBal = (await balances()).jake;
const over = await call("jake", "POST", `/api/bets/${bet.id}/entries`, { outcomeId: "o1", amount: jakeBal + 1 });
assert.equal(over.status, 409);
assert.equal(over.json.error.code, "insufficient_points");
assert.equal((await call("jake", "POST", `/api/bets/${bet.id}/entries`, { outcomeId: "o1", amount: -5 })).status, 400);
assert.equal((await call("sam", "POST", `/api/bets/${bet.id}/entries`, { outcomeId: "o1", amount: 10 })).json.error.code, "already_joined");
assert.equal((await balances()).jake, jakeBal);
ok("overspending, negative stakes, and double joins are rejected");

// Concurrent overspend: two simultaneous joins that each fit the balance but together don't
const sideBet = (n) =>
  call("marcus", "POST", "/api/bets", { proposition: `E2E: overspend race ${n}`, outcomes: ["A", "B"], deadline: inFuture(3_600_000), stake: 1, pick: 0 });
const [side1, side2] = [await sideBet(1), await sideBet(2)];
const big = Math.floor(jakeBal * 0.6);
const race = await Promise.all([
  call("jake", "POST", `/api/bets/${side1.json.result.id}/entries`, { outcomeId: "o1", amount: big }),
  call("jake", "POST", `/api/bets/${side2.json.result.id}/entries`, { outcomeId: "o1", amount: big }),
]);
assert.deepEqual(race.map((r) => r.status).sort(), [201, 409], JSON.stringify(race.map((r) => r.json.error)));
assert.equal((await balances()).jake, jakeBal - big);
ok("two simultaneous joins can't overspend: one succeeds, one is rejected");

// Settle guards before close
assert.equal((await call("sam", "POST", `/api/bets/${bet.id}/settle`, { outcomeId: "o1" })).status, 403);
assert.equal((await call("alex", "POST", `/api/bets/${bet.id}/settle`, { outcomeId: "o1" })).json.error.code, "bet_open");
ok("only the creator can settle, and only after entries close");

// Automatic close at deadline
const quick = await call("priya", "POST", "/api/bets", {
  proposition: "E2E: closes in 2 seconds", outcomes: ["A", "B", "C"], deadline: inFuture(2000), stake: 10, pick: 2,
});
assert.equal(quick.status, 201);
assert.equal((await call("marcus", "POST", `/api/bets/${quick.json.result.id}/entries`, { outcomeId: "o1", amount: 20 })).status, 201);
await sleep(2500);
const late = await call("sam", "POST", `/api/bets/${quick.json.result.id}/entries`, { outcomeId: "o1", amount: 5 });
assert.equal(late.status, 409);
assert.equal(late.json.error.code, "bet_closed");
assert.equal((await state()).bets.find((b) => b.id === quick.json.result.id).status, "closed");
ok("bets close automatically at their deadline and reject new entries");

// Manual close
assert.equal((await call("sam", "POST", `/api/bets/${bet.id}/close`)).status, 403);
assert.equal((await call("alex", "POST", `/api/bets/${bet.id}/close`)).status, 200);
assert.equal((await call("marcus", "POST", `/api/bets/${bet.id}/entries`, { outcomeId: "o1", amount: 5 })).json.error.code, "bet_closed");
ok("the creator can close entries early");

// Settle: pool 380, Yes side = alex 100 + priya 50 = 150
const before = await balances();
const settled = await call("alex", "POST", `/api/bets/${bet.id}/settle`, { outcomeId: "o1" });
assert.equal(settled.status, 200, JSON.stringify(settled.json));
const receipt = settled.json.result.receipt;
assert.equal(settled.json.result.alreadySettled, false);
assert.equal(receipt.pool, 380);
assert.equal(receipt.winningPool, 150);
assert.equal(receipt.payouts.reduce((a, p) => a + p.payout, 0), 380, "payouts add up to the pool");
const after = await balances();
// 100/150 * 380 = 253.33 -> 253 (+1 remainder, biggest stake) = 254 ; 50/150 * 380 = 126.67 -> 126
assert.equal(after.alex - before.alex, 254);
assert.equal(after.priya - before.priya, 126);
assert.equal(after.sam, before.sam);
assert.equal(after.elena, before.elena);
ok("settling pays winners from the pool: alex +254, priya +126, losers 0");

// Idempotent settlement
const again = await call("alex", "POST", `/api/bets/${bet.id}/settle`, { outcomeId: "o1" });
assert.equal(again.status, 200);
assert.equal(again.json.result.alreadySettled, true);
assert.equal(again.json.result.receipt.id, receipt.id);
const flip = await call("alex", "POST", `/api/bets/${bet.id}/settle`, { outcomeId: "o2" });
assert.equal(flip.status, 409);
assert.deepEqual(await balances(), after);
ok("repeating the settlement returns the same receipt and moves no points");

// Concurrent settlement burst
const burst = await Promise.all(
  Array.from({ length: 8 }, () => call("priya", "POST", `/api/bets/${quick.json.result.id}/settle`, { outcomeId: "o1" }))
);
assert.ok(burst.every((r) => r.status === 200));
assert.equal(burst.filter((r) => !r.json.result.alreadySettled).length, 1, "exactly one request paid out");
const qs = (await state()).bets.find((b) => b.id === quick.json.result.id);
assert.equal(qs.receipt.payouts.find((p) => p.userId === "marcus").payout, 30);
ok("8 simultaneous settle requests pay out exactly once");

// Receipts and leaderboard
const s = await state();
const settledBet = s.bets.find((b) => b.id === bet.id);
assert.equal(settledBet.status, "settled");
assert.equal(settledBet.receipt.id, receipt.id);
const alex = s.users.find((u) => u.id === "alex");
assert.ok(alex.stats.settled >= 1 && alex.stats.wins >= 1);
const ranked = [...s.users].sort((a, b) => b.balance - a.balance).map((u) => u.id);
assert.ok(ranked.indexOf("alex") >= 0);
ok(`receipt and leaderboard stats reflect results (alex: ${alex.balance} pts, ${alex.stats.wins}-${alex.stats.losses})`);

// Conservation: no points created or destroyed
assert.equal(await pointsInPlay(), conserved, "free + at-risk points are conserved");
ok("total points across all friends are conserved");

// Persistence (same server): a fresh read sees everything
const fresh = await state();
assert.equal(fresh.bets.find((b) => b.id === bet.id).receipt.id, receipt.id);
ok("state survives a fresh request ");

console.log(`\nAll ${step} checks passed. Settled bet: ${BASE}/bets/${bet.id}`);
