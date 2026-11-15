// What the iMessage agent understands and says back (agent/brain.ts), with a fake database.
// Run: npm run test:agent
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parse, respond, openBets, matchOutcome, Refusal } from "../../agent/brain.ts";
import { requestIdFor } from "../../agent/bookie.ts";

const NOW = Date.parse("2026-11-15T18:00:00Z");
const me = { id: "u-me", name: "Will" };
const yn = (id, question, yes, no, extra = {}) => ({
  id, question, status: "open", kind: "binary",
  outcomes: [{ id: `${id}-y`, label: "YES", pool: yes }, { id: `${id}-n`, label: "NO", pool: no }],
  wagers: [], ...extra,
});
const state = () => ({
  linked: true,
  me,
  series: [
    {
      id: "s1", name: "Game night", status: "active",
      members: [{ userId: "u-me", name: "Will", plays: true }, { userId: "u-jake", name: "Jake", plays: true }],
      standings: [
        { userId: "u-jake", rank: 1, coins: 1100, available: 900, atStake: 200 },
        { userId: "u-me", rank: 2, coins: 1000, available: 850, atStake: 150, losing: true },
      ],
      bets: [
        yn("knicks", "Will the Knicks win tonight?", 300, 100, { closesAt: "2026-11-15T20:00:00Z", wagers: [{ userId: "u-me", outcomeId: "knicks-y", amount: 150 }] }),
        {
          id: "kart", question: "Who wins Mario Kart?", status: "open", kind: "multi", closesAt: "2026-11-15T19:00:00Z",
          outcomes: [{ id: "k-will", label: "Will", pool: 0 }, { id: "k-jake", label: "Jake", pool: 50 }, { id: "k-mal", label: "Malachi", pool: 0 }],
          wagers: [],
        },
        yn("old", "Closed already?", 10, 10, { status: "closed" }),
      ],
    },
    { id: "s2", name: "Lobby", status: "lobby", members: [{ userId: "u-me", name: "Will" }], standings: [], bets: [yn("d", "Draft?", 0, 0, { status: "draft" })] },
  ],
});

function fakeBookie(st = state()) {
  const calls = [];
  return {
    calls,
    state: async () => st,
    link: async (code) => { calls.push(["link", code]); if (code !== "ABCD2345") throw new Refusal("That code didn't work."); return { name: "Will" }; },
    unlink: async () => { calls.push(["unlink"]); return true; },
    wager: async (seriesId, betId, outcomeId, amount) => {
      calls.push(["wager", seriesId, betId, outcomeId, amount]);
      if (amount > 850) throw new Refusal("You only have 850 coins free.");
      return { amount, totalStake: amount, available: 850 - amount, replayed: false };
    },
  };
}

describe("reading texts", () => {
  test("commands, with or without Bookie's name, any capitals", () => {
    assert.deepEqual(parse("bets", false), { kind: "bets" });
    assert.deepEqual(parse("Hey Bookie, BOARD!", false), { kind: "board" });
    assert.deepEqual(parse("link abcd2345", false), { kind: "link", code: "ABCD2345" });
    assert.deepEqual(parse("coins", true), { kind: "coins" });
    assert.deepEqual(parse("help", false), { kind: "help" });
  });

  test("wagers in the ways people type them", () => {
    assert.deepEqual(parse("bet 50 on yes #1", false), { kind: "wager", amount: 50, outcome: "yes", pick: 1 });
    assert.deepEqual(parse("put 1,000 coins on Jake", false), { kind: "wager", amount: 1000, outcome: "Jake", pick: undefined });
    assert.deepEqual(parse("50 on no for 2", false), { kind: "wager", amount: 50, outcome: "no", pick: 2 });
    assert.deepEqual(parse("bookie bet all on Malachi in bet 2", true), { kind: "wager", amount: "all", outcome: "Malachi", pick: 2 });
    assert.equal(parse("bet 0 on yes", false).kind, "unknown");
  });

  test("in a group, ordinary chat is ignored unless Bookie is addressed", () => {
    assert.equal(parse("lol that game was wild", true), null);
    assert.deepEqual(parse("bookie what do you think", true), { kind: "unknown", text: "what do you think" });
    assert.deepEqual(parse("lol that game was wild", false), { kind: "unknown", text: "lol that game was wild" });
  });
});

describe("answering", () => {
  test("bets: only open ones you can play, soonest to close first, with odds and your stake", async () => {
    const list = openBets(state(), NOW);
    assert.deepEqual(list.map((x) => x.bet.id), ["kart", "knicks"]);
    const reply = await respond({ kind: "bets" }, fakeBookie(), { now: NOW });
    assert.match(reply, /1\. Who wins Mario Kart\? \(Game night\)/);
    assert.match(reply, /2\. Will the Knicks win tonight\?/);
    assert.match(reply, /YES 75% · NO 25% · pool 400 · closes in 2h/);
    assert.match(reply, /You: 150 on YES/);
    assert.match(reply, /Reply like: bet 50 on will #1/);
    assert.doesNotMatch(reply, /Closed already|Draft/);
  });

  test("a wager by number places it and says what it could pay", async () => {
    const b = fakeBookie();
    const reply = await respond({ kind: "wager", amount: 100, outcome: "no", pick: 2 }, b, { now: NOW });
    assert.deepEqual(b.calls, [["wager", "s1", "knicks", "knicks-n", 100]]);
    assert.match(reply, /✅ 100 on NO: Will the Knicks win tonight\?/);
    // Pool 400 + 100 = 500, NO side 100 + 100 = 200 → 100 × 500 / 200 = 250.
    assert.match(reply, /about 250/);
    assert.match(reply, /750 coins free in Game night/);
  });

  test("a wager by name finds the one bet with that option", async () => {
    const b = fakeBookie();
    await respond({ kind: "wager", amount: 20, outcome: "jake" }, b, { now: NOW });
    assert.deepEqual(b.calls, [["wager", "s1", "kart", "k-jake", 20]]);
  });

  test("ambiguous or wrong picks get a helpful question, not a wager", async () => {
    const b = fakeBookie();
    assert.match(await respond({ kind: "wager", amount: 20, outcome: "yes" }, b, { now: NOW }), /^Which bet\?/);
    assert.match(await respond({ kind: "wager", amount: 20, outcome: "maybe", pick: 2 }, b, { now: NOW }), /isn't an option on #2\. Pick one of: YES, NO/);
    assert.match(await respond({ kind: "wager", amount: 20, outcome: "yes", pick: 9 }, b, { now: NOW }), /There's no bet #9/);
    assert.deepEqual(b.calls, []);
  });

  test("rule refusals come back as the rule's own words", async () => {
    assert.equal(await respond({ kind: "wager", amount: 5000, outcome: "yes", pick: 2 }, fakeBookie(), { now: NOW }), "You only have 850 coins free.");
    assert.equal(await respond({ kind: "link", code: "WRONG123" }, fakeBookie(), {}), "That code didn't work.");
  });

  test("board and coins", async () => {
    const board = await respond({ kind: "board" }, fakeBookie(), {});
    assert.match(board, /Game night: you're 2nd of 2 \(in the losing spot 😬\)/);
    assert.match(board, /1\. Jake 1,100\n2\. You 1,000 🔻/);
    assert.equal(await respond({ kind: "coins" }, fakeBookie(), {}), "Game night: 850 free, 150 in play");
  });

  test("an unlinked number is told how to link; link and unlink work", async () => {
    const unlinked = fakeBookie({ linked: false });
    assert.match(await respond({ kind: "bets" }, unlinked, { appUrl: "https://bookie.example" }), /Profile → Text Bookie.*link CODE/);
    assert.match(await respond({ kind: "link", code: "ABCD2345" }, fakeBookie(), {}), /You're in, Will!/);
    assert.match(await respond({ kind: "unlink" }, fakeBookie(), {}), /isn't linked to Bookie any more/);
  });

  test("free text goes to the interpreter when there is one, and falls back to a hint", async () => {
    const b = fakeBookie();
    const interpret = async () => ({ kind: "wager", amount: 10, outcome: "yes", pick: 2 });
    assert.match(await respond({ kind: "unknown", text: "ten on the knicks" }, b, { now: NOW, interpret }), /✅ 10 on YES/);
    assert.match(await respond({ kind: "unknown", text: "??" }, b, {}), /Not sure what you mean/);
    const broken = async () => { throw new Error("model down"); };
    assert.match(await respond({ kind: "unknown", text: "??" }, b, { interpret: broken }), /Not sure what you mean/);
  });

  test("YES/NO shorthands and request ids", () => {
    const bet = state().series[0].bets[0];
    assert.equal(matchOutcome(bet, "y").id, "knicks-y");
    assert.equal(matchOutcome(bet, "nah").id, "knicks-n");
    const a = requestIdFor("iMessage:+1555", "msg-1");
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(a, requestIdFor("iMessage:+1555", "msg-1"));
    assert.notEqual(a, requestIdFor("iMessage:+1555", "msg-2"));
  });
});
