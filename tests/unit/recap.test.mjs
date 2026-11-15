// Series recap and rematch helpers (frontend/src/lib/recap.ts), on hand-built series.
// Run: npm run test:recap
import test from "node:test";
import assert from "node:assert/strict";
import { recap, rematchName, rematchInvitees, pct } from "../../frontend/src/lib/recap.ts";

const T = (min) => new Date(Date.UTC(2026, 10, 14, 12, min)).toISOString();
let n = 0;
/** A YES/NO bet. pools: [{ user, side: 0|1, amount, at? }]; result: index of the winner, "refund", "cancel", "tie". */
function bet({ question = `Bet ${++n}?`, wagers = [], result = 0, closedAt = T(30), settledAt = T(40), position = n }) {
  const outcomes = [{ id: `y${n}`, label: "YES", position: 1, pool: 0 }, { id: `n${n}`, label: "NO", position: 2, pool: 0 }];
  const ws = wagers.map((w) => ({ userId: w.user, outcomeId: outcomes[w.side].id, side: outcomes[w.side].label.toLowerCase(), amount: w.amount, firstAt: w.at ?? T(5), updatedAt: w.updated ?? w.at ?? T(5) }));
  for (const w of ws) outcomes.find((o) => o.id === w.outcomeId).pool += w.amount;
  const total = ws.reduce((a, w) => a + w.amount, 0);
  const winner = typeof result === "number" ? outcomes[result] : null;
  const onWin = winner ? ws.filter((w) => w.outcomeId === winner.id).reduce((a, w) => a + w.amount, 0) : 0;
  return {
    id: `b${n}`, question, position, kind: "binary", tieRule: "refund", outcomes, wagers: ws, closedAt, settledAt, createdAt: T(0),
    status: result === "cancel" ? "canceled" : "resolved",
    outcomeId: winner?.id ?? null,
    tiedOutcomeIds: result === "tie" ? outcomes.map((o) => o.id) : null,
    refunded: result === "refund" || result === "cancel",
    results: ws.map((w) => {
      const payout = winner && w.outcomeId === winner.id ? Math.floor((w.amount * total) / onWin) : result === "refund" || result === "cancel" ? w.amount : 0;
      return { userId: w.userId, outcomeId: w.outcomeId, stake: w.amount, payout, net: payout - w.amount, firstAt: w.firstAt };
    }),
  };
}
function series({ bets = [], standings, startingCoins = 1000, members }) {
  return {
    id: "s1", name: "Gym month", description: "", code: "ABC123", hostId: "ana", status: "finished",
    settings: { startingCoins, betCount: bets.length, losers: 1, mode: "money", minContribution: 5, favorsPerPlayer: 1, exclusivePool: true, tiebreak: "first", betCreation: "upfront", withdrawMinutes: 0, hostPlays: true },
    members: members ?? standings.map((r) => ({ userId: r.userId, name: r.userId.toUpperCase(), plays: true, status: "joined", ready: false, joinedAt: T(0) })),
    bets, standings, favors: [], assignments: [], activity: [], blockers: [], createdAt: T(0),
  };
}
const st = (...list) => list.map(([userId, coins], i) => ({ userId, rank: i + 1, coins, atStake: 0, available: coins, reachedSeq: 0, losing: i === list.length - 1 }));

test("standings: ranks, final coins and net from the stored standings; ties are flagged", () => {
  const r = recap(series({ standings: st(["ana", 1300], ["ben", 1300], ["cat", 400]) }));
  assert.deepEqual(r.standings.map((x) => [x.userId, x.rank, x.coins, x.net, x.losing]), [["ana", 1, 1300, 300, false], ["ben", 2, 1300, 300, false], ["cat", 3, 400, -600, true]]);
  assert.deepEqual(r.standings[0].tiedWith, ["ben"]);
  assert.deepEqual([r.winnerId, r.winnerOnTiebreak], ["ana", true]);
});

test("a series with no settled bets has standings but no upset or best call", () => {
  const r = recap(series({ bets: [bet({ wagers: [{ user: "ana", side: 0, amount: 100 }, { user: "ben", side: 1, amount: 100 }], result: "cancel" })], standings: st(["ana", 1000], ["ben", 1000]) }));
  assert.deepEqual([r.settled, r.voided, r.upset, r.bestCall], [0, 1, null, null]);
  assert.equal(recap(series({ bets: [], standings: [] })).winnerId, null);
});

test("biggest upset: the smallest winning share of the coins at close; refunded, tied and unanimous bets don't count", () => {
  const close = bet({ question: "Close one?", wagers: [{ user: "ana", side: 0, amount: 450 }, { user: "ben", side: 1, amount: 550 }] });
  const shock = bet({ question: "Shock?", wagers: [{ user: "ana", side: 0, amount: 100 }, { user: "ben", side: 1, amount: 400 }, { user: "cat", side: 1, amount: 500 }] });
  const refunded = bet({ question: "Refunded?", wagers: [{ user: "ana", side: 0, amount: 1 }, { user: "ben", side: 1, amount: 999 }], result: "refund" });
  const tie = bet({ question: "Tied?", wagers: [{ user: "ana", side: 0, amount: 1 }, { user: "ben", side: 1, amount: 999 }], result: "tie" });
  const unanimous = bet({ question: "Everyone agreed?", wagers: [{ user: "ana", side: 0, amount: 100 }, { user: "ben", side: 0, amount: 100 }] });
  const r = recap(series({ bets: [close, shock, refunded, tie, unanimous], standings: st(["ana", 1500], ["ben", 900], ["cat", 600]) }));
  assert.equal(r.upset.question, "Shock?");
  assert.equal(r.upset.outcome, "YES");
  assert.equal(r.upset.share, 0.1);
  assert.equal(pct(r.upset.share), "10%");
  assert.equal(r.upset.alsoAsSurprising, 0);
  assert.equal(r.settled, 2);
  // The refund and the tie (settled under the refund rule, so no winner) are both voided.
  assert.equal(r.voided, 2);
});

test("equally surprising upsets: the bigger pool is shown, and the others are counted", () => {
  const a = bet({ question: "Small pool?", wagers: [{ user: "ana", side: 0, amount: 20 }, { user: "ben", side: 1, amount: 80 }] });
  const b = bet({ question: "Big pool?", wagers: [{ user: "ana", side: 0, amount: 200 }, { user: "ben", side: 1, amount: 800 }] });
  const r = recap(series({ bets: [a, b], standings: st(["ana", 1600], ["ben", 400]) }));
  assert.deepEqual([r.upset.question, r.upset.alsoAsSurprising], ["Big pool?", 1]);
});

test("best call: the winning pick on the smallest minority side; ties go to profit, then the earlier bet", () => {
  // Ana and Cat both won on a 20% side; Cat staked more, so profited more.
  const minority = bet({ question: "Minority?", wagers: [{ user: "ana", side: 0, amount: 50, at: T(1) }, { user: "cat", side: 0, amount: 150, at: T(3) }, { user: "ben", side: 1, amount: 800 }] });
  // Ben won on a 60% side: a majority call never counts.
  const majority = bet({ question: "Majority?", wagers: [{ user: "ben", side: 0, amount: 600 }, { user: "ana", side: 1, amount: 400 }] });
  const r = recap(series({ bets: [minority, majority], standings: st(["cat", 1600], ["ana", 1000], ["ben", 400]) }));
  assert.deepEqual([r.bestCall.userId, r.bestCall.question, r.bestCall.share, r.bestCall.stake, r.bestCall.payout], ["cat", "Minority?", 0.2, 150, 750]);
  assert.deepEqual(r.bestCall.sharedWith, []);

  // Exactly equal calls (same share, same profit): the earlier bet is shown, the other is named.
  const even = bet({ question: "Even?", wagers: [{ user: "ana", side: 0, amount: 100, at: T(2) }, { user: "cat", side: 0, amount: 100, at: T(1) }, { user: "ben", side: 1, amount: 800 }] });
  const r2 = recap(series({ bets: [even], standings: st(["cat", 1400], ["ana", 1400], ["ben", 200]) }));
  assert.deepEqual([r2.bestCall.userId, r2.bestCall.sharedWith], ["cat", ["ana"]]);
});

test("no best call when every winner was on the majority side; a wager timestamped after close is never credited", () => {
  const majority = bet({ wagers: [{ user: "ana", side: 0, amount: 700 }, { user: "ben", side: 1, amount: 300 }] });
  assert.equal(recap(series({ bets: [majority], standings: st(["ana", 1300], ["ben", 700]) })).bestCall, null);

  // A record claiming Cat's minority wager was last changed after betting closed: not credited.
  const late = bet({ question: "Late?", closedAt: T(30), wagers: [{ user: "cat", side: 0, amount: 100, at: T(1), updated: T(35) }, { user: "ana", side: 0, amount: 100, at: T(2) }, { user: "ben", side: 1, amount: 800 }] });
  const r = recap(series({ bets: [late], standings: st(["ana", 1800], ["cat", 1000], ["ben", 200]) }));
  assert.equal(r.bestCall.userId, "ana");
  assert.ok(!r.bestCall.sharedWith.includes("cat"));
});

test("rematch names and invitation list", () => {
  assert.equal(rematchName("Gym month"), "Gym month · Rematch");
  assert.equal(rematchName("Gym month · Rematch"), "Gym month · Rematch 2");
  assert.equal(rematchName("Gym month · Rematch 2"), "Gym month · Rematch 3");
  assert.ok(rematchName("x".repeat(60)).length <= 60);
  const s = series({ standings: st(["ana", 1000], ["ben", 1000]), members: [{ userId: "ana", name: "Ana", plays: true }, { userId: "ben", name: "Ben", plays: true }, { userId: "host", name: "Host", plays: false }] });
  assert.deepEqual(rematchInvitees(s, "ana").map((m) => m.name), ["Ben", "Host"]);
});
