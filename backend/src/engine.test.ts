import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS, RuleError, addBet, balances, cancelBet, chooseFavor, closeBet, createSeries, endSeries,
  joinByCode, joinSeries, kickMember, markFavorDone, placeWager, resolveBet, setReady, settle, standings,
  startBlockers, startSeries, submitFavor, withdrawWager,
} from "./engine.ts";
import type { Db, Settings, Wager } from "./types.ts";

const T0 = Date.parse("2026-11-14T12:00:00Z");
const min = (m: number) => T0 + m * 60_000;
const users = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `u${i + 1}`, name: `P${i + 1}` }));
const fresh = (n = 4): Db => ({ version: 1, users: users(n), series: [] });
const w = (userId: string, side: "yes" | "no", amount: number, at = 0): Wager => ({
  userId, side, amount, firstAt: new Date(min(at)).toISOString(), updatedAt: new Date(min(at)).toISOString(),
});
const throws = (fn: () => unknown, re: RegExp) => assert.throws(fn, (e: unknown) => e instanceof RuleError && re.test(e.message));

/** A started series with players u1..un (u1 hosts and plays), `bets` open bets, ready to wager. */
function running(n: number, settings: Partial<Settings> = {}, bets = 2) {
  const db = fresh(n);
  const s = createSeries(db, "u1", { name: "Test", settings: { ...DEFAULT_SETTINGS, mode: "money", betCount: bets, ...settings } }, T0);
  for (let i = 2; i <= n; i++) joinSeries(db, `u${i}`, s.id, T0);
  for (let i = 1; i <= n; i++) {
    if (s.settings.mode !== "money") submitFavor(db, `u${i}`, s.id, `favor from u${i}`, T0);
  }
  for (let i = 1; i <= n; i++) setReady(db, `u${i}`, s.id, true);
  const ids = Array.from({ length: bets }, (_, i) => addBet(db, "u1", s.id, `Question ${i + 1}?`, T0).id);
  startSeries(db, "u1", s.id, T0, () => 0);
  return { db, s, ids };
}

test("winners split the pool in proportion to their stakes", () => {
  const r = settle([w("a", "yes", 100), w("b", "yes", 300), w("c", "no", 200)], "yes");
  assert.equal(r.refunded, false);
  assert.deepEqual(r.results.map((x) => [x.userId, x.payout, x.net]), [["a", 150, 50], ["b", 450, 150], ["c", 0, -200]]);
});

test("rounding leftovers go to the earlier of equal winning stakes", () => {
  const r = settle([w("a", "yes", 1, 5), w("b", "yes", 1, 1), w("c", "no", 1)], "yes");
  assert.deepEqual(r.results.map((x) => x.payout), [1, 2, 0]);
  assert.equal(r.results.reduce((a, x) => a + x.payout, 0), 3);
});

test("everyone on one side gets their coins back, win or lose", () => {
  for (const outcome of ["yes", "no"] as const) {
    const r = settle([w("a", "yes", 40), w("b", "yes", 60)], outcome);
    assert.equal(r.refunded, true);
    assert.deepEqual(r.results.map((x) => x.net), [0, 0]);
  }
});

test("joining by code, and the host can kick before start but not after", () => {
  const db = fresh(3);
  const s = createSeries(db, "u1", { name: "S", settings: { mode: "money" }, invite: ["u2"] }, T0);
  assert.equal(s.members.find((m) => m.userId === "u2")!.status, "invited");
  joinByCode(db, "u3", s.code.toLowerCase(), T0);
  throws(() => joinByCode(db, "u3", s.code, T0), /already in/);
  throws(() => kickMember(db, "u2", s.id, "u3", T0), /Only the host/);
  kickMember(db, "u1", s.id, "u3", T0);
  assert.equal(s.members.some((m) => m.userId === "u3"), false);
});

test("start is blocked until favors, readiness, player count and upfront bets are in place", () => {
  const db = fresh(4);
  const s = createSeries(db, "u1", { name: "S", settings: { mode: "pool", losers: 2, betCreation: "upfront", betCount: 2 } }, T0);
  joinSeries(db, "u2", s.id, T0);
  joinSeries(db, "u3", s.id, T0);
  assert.match(startBlockers(db, s).join(" "), /at least 4 players/);
  joinSeries(db, "u4", s.id, T0);
  throws(() => setReady(db, "u2", s.id, true), /favor/);
  for (const u of ["u1", "u2", "u3", "u4"]) submitFavor(db, u, s.id, `favor ${u}`, T0);
  for (const u of ["u1", "u2", "u3", "u4"]) setReady(db, u, s.id, true);
  addBet(db, "u1", s.id, "One?", T0);
  assert.deepEqual(startBlockers(db, s), ["Write all 2 bets before starting (1 so far)."]);
  // A new favor in the shared pool resets everyone's agreement.
  submitFavor(db, "u2", s.id, "second favor", T0);
  assert.ok(s.members.every((m) => !m.ready));
});

test("starting drops unanswered invites, opens bets and hands out coins", () => {
  const db = fresh(3);
  const s = createSeries(db, "u1", { name: "S", settings: { mode: "money", betCount: 1 }, invite: ["u3"] }, T0);
  joinSeries(db, "u2", s.id, T0);
  setReady(db, "u1", s.id, true);
  setReady(db, "u2", s.id, true);
  addBet(db, "u1", s.id, "Q1?", T0);
  startSeries(db, "u1", s.id, T0);
  assert.equal(s.status, "active");
  assert.equal(s.members.length, 2);
  assert.equal(s.bets[0].status, "open");
  assert.equal(balances(s).get("u2")!.available, 1000);
  throws(() => submitFavor(db, "u2", s.id, "late favor", T0), /locked|real money/);
});

test("wagers: add more on your side, can't switch, can't overspend, withdraw only in the window", () => {
  const { db, s, ids } = running(3, { withdrawMinutes: 15 });
  const [b] = ids;
  placeWager(db, "u2", s.id, b, "yes", 100, min(1));
  placeWager(db, "u2", s.id, b, "yes", 50, min(2));
  assert.equal(s.bets[0].wagers[0].amount, 150);
  throws(() => placeWager(db, "u2", s.id, b, "no", 10, min(3)), /You're on YES/);
  throws(() => placeWager(db, "u2", s.id, b, "yes", 851, min(3)), /only have 850/);
  withdrawWager(db, "u2", s.id, b, min(14));
  assert.equal(balances(s).get("u2")!.available, 1000);
  placeWager(db, "u2", s.id, b, "no", 10, min(14.5));
  throws(() => withdrawWager(db, "u2", s.id, b, min(15)), /window has passed/);
});

test("the host resolves even when playing; results update balances; closed bets take no wagers", () => {
  const { db, s, ids } = running(3);
  placeWager(db, "u1", s.id, ids[0], "yes", 100, min(1));
  placeWager(db, "u2", s.id, ids[0], "no", 300, min(1));
  closeBet(db, "u1", s.id, ids[0], min(2));
  throws(() => placeWager(db, "u3", s.id, ids[0], "yes", 10, min(3)), /closed/);
  throws(() => resolveBet(db, "u2", s.id, ids[0], "yes", min(4)), /Only the host/);
  resolveBet(db, "u1", s.id, ids[0], "yes", min(4));
  const bal = balances(s);
  assert.equal(bal.get("u1")!.settled, 1300);
  assert.equal(bal.get("u2")!.settled, 700);
});

test("canceling a bet returns every coin", () => {
  const { db, s, ids } = running(3);
  placeWager(db, "u2", s.id, ids[0], "no", 300, min(1));
  cancelBet(db, "u1", s.id, ids[0], min(2));
  assert.equal(balances(s).get("u2")!.available, 1000);
});

test("tiebreak 'first': whoever reached the tied score first ranks higher", () => {
  const { db, s, ids } = running(3, {}, 2);
  // u2 wins 100 on bet 1, u3 wins 100 on bet 2: both end at 1,100.
  placeWager(db, "u2", s.id, ids[0], "yes", 100, min(1));
  placeWager(db, "u1", s.id, ids[0], "no", 100, min(1));
  resolveBet(db, "u1", s.id, ids[0], "yes", min(2));
  placeWager(db, "u3", s.id, ids[1], "yes", 100, min(3));
  placeWager(db, "u1", s.id, ids[1], "no", 100, min(3));
  resolveBet(db, "u1", s.id, ids[1], "yes", min(4));
  const t = standings(s);
  assert.deepEqual(t.map((r) => [r.userId, r.coins]), [["u2", 1100], ["u3", 1100], ["u1", 800]]);
});

test("tiebreak 'first': on the same bet, the earlier wager ranks higher", () => {
  const { db, s, ids } = running(3, {}, 1);
  placeWager(db, "u3", s.id, ids[0], "yes", 100, min(1));
  placeWager(db, "u2", s.id, ids[0], "yes", 100, min(2));
  placeWager(db, "u1", s.id, ids[0], "no", 200, min(3));
  resolveBet(db, "u1", s.id, ids[0], "yes", min(4));
  assert.deepEqual(s.finalOrder, ["u3", "u2", "u1"]);
});

test("tiebreak 'random' uses the order drawn at the start", () => {
  const { s } = running(3, { tiebreak: "random" }, 1);
  assert.deepEqual(standings(s).map((r) => r.userId), s.randomOrder);
});

test("the series ends by itself once every bet is resolved or canceled", () => {
  const { db, s, ids } = running(3, {}, 2);
  resolveBet(db, "u1", s.id, ids[0], "yes", min(1));
  assert.equal(s.status, "active");
  cancelBet(db, "u1", s.id, ids[1], min(2));
  assert.equal(s.status, "finished");
});

test("the host can add bets during the series only when allowed, up to the bet count", () => {
  const a = running(2, { betCreation: "during", betCount: 2 }, 1);
  addBet(a.db, "u1", a.s.id, "Added later?", min(1));
  assert.equal(a.s.bets[1].status, "open");
  throws(() => addBet(a.db, "u1", a.s.id, "One too many?", min(2)), /all written/);
  const db = fresh(2);
  const s = createSeries(db, "u1", { name: "S", settings: { mode: "money", betCreation: "upfront", betCount: 1 } }, T0);
  joinSeries(db, "u2", s.id, T0);
  setReady(db, "u1", s.id, true);
  setReady(db, "u2", s.id, true);
  addBet(db, "u1", s.id, "Only one?", T0);
  startSeries(db, "u1", s.id, T0);
  assert.equal(s.bets.length, 1);
});

test("self-pledged favors: the bottom X do their own pledge", () => {
  const { db, s, ids } = running(3, { mode: "pledge", losers: 1 }, 1);
  placeWager(db, "u3", s.id, ids[0], "no", 500, min(1));
  placeWager(db, "u2", s.id, ids[0], "yes", 100, min(1));
  resolveBet(db, "u1", s.id, ids[0], "yes", min(2));
  assert.equal(s.status, "finished");
  assert.deepEqual(s.assignments, [{ loserId: "u3", favorId: s.favors.find((f) => f.authorId === "u3")!.id, text: "favor from u3", done: false }]);
  markFavorDone(db, "u3", s.id, min(3));
  assert.equal(s.assignments![0].done, true);
});

test("shared pool: rank 1 picks for last, in order, and an exclusive favor is picked once", () => {
  const { db, s, ids } = running(4, { mode: "pool", losers: 2, exclusivePool: true }, 1);
  placeWager(db, "u1", s.id, ids[0], "yes", 300, min(1));
  placeWager(db, "u2", s.id, ids[0], "yes", 100, min(2));
  placeWager(db, "u3", s.id, ids[0], "no", 100, min(3));
  placeWager(db, "u4", s.id, ids[0], "no", 300, min(4));
  resolveBet(db, "u1", s.id, ids[0], "yes", min(5));
  assert.deepEqual(s.finalOrder, ["u1", "u2", "u3", "u4"]);
  assert.equal(s.status, "assigning");
  assert.deepEqual(s.assignments!.map((a) => [a.chooserId, a.loserId]), [["u1", "u4"], ["u2", "u3"]]);
  const pick = s.favors[0].id;
  throws(() => chooseFavor(db, "u2", s.id, "u3", pick, min(6)), /picks first/);
  throws(() => chooseFavor(db, "u2", s.id, "u4", pick, min(6)), /picks this favor/);
  chooseFavor(db, "u1", s.id, "u4", pick, min(6));
  throws(() => chooseFavor(db, "u2", s.id, "u3", pick, min(7)), /already picked that favor/);
  chooseFavor(db, "u2", s.id, "u3", s.favors[1].id, min(7));
  assert.equal(s.status, "finished");
});

test("shared pool, nonexclusive: the same favor can be picked twice", () => {
  const { db, s, ids } = running(4, { mode: "pool", losers: 2, exclusivePool: false }, 1);
  cancelBet(db, "u1", s.id, ids[0], min(1)); // nothing resolved, so join order decides; the series ends
  const pick = s.favors[0].id;
  chooseFavor(db, "u2", s.id, "u3", pick, min(2));
  chooseFavor(db, "u1", s.id, "u4", pick, min(3));
  assert.equal(s.status, "finished");
});

test("ending early needs every bet settled first", () => {
  const { db, s } = running(2, {}, 1);
  throws(() => endSeries(db, "u1", s.id, min(1)), /open bets/);
});
