import assert from "node:assert/strict";
import test from "node:test";
import { applyTrade, initialQ, priceYes, quoteBuy, quoteSell } from "./lmsr.ts";

test("initial quantities reproduce the starting chance", () => {
  assert.equal(priceYes(initialQ(50)), 0.5);
  assert.equal(Math.round(priceYes(initialQ(80)) * 100), 80);
});

test("buys use whole contracts and round cost up", () => {
  assert.deepEqual(quoteBuy(initialQ(50), "yes", 49), { contracts: 0, cost: 0 });
  assert.deepEqual(quoteBuy(initialQ(50), "yes", 51), { contracts: 1, cost: 51 });
});

test("selling a purchase returns at most its cost", () => {
  for (const side of ["yes", "no"] as const) {
    const q = initialQ(50);
    const purchase = quoteBuy(q, side, 1000);
    const after = applyTrade(q, side, purchase.contracts);
    assert.ok(quoteSell(after, side, purchase.contracts) <= purchase.cost);
  }
});

test("buying YES raises the YES price", () => {
  const q = initialQ(50);
  const purchase = quoteBuy(q, "yes", 1000);
  assert.ok(priceYes(applyTrade(q, "yes", purchase.contracts)) > priceYes(q));
});

test("a 10000-token YES purchase stays within the house loss bound", () => {
  const { contracts, cost } = quoteBuy(initialQ(50), "yes", 10000);
  assert.ok(contracts * 100 - cost <= 1733);
});

test("a positive purchase cannot be free at extreme prices", () => {
  assert.deepEqual(quoteBuy({ yes: 1000, no: 0 }, "no", 0), { contracts: 0, cost: 0 });
  assert.deepEqual(quoteBuy({ yes: 0, no: 1000 }, "yes", 0), { contracts: 0, cost: 0 });
});

test("selling a near-certain contract pays less than its full payout", () => {
  assert.equal(quoteSell({ yes: 1000, no: 0 }, "yes", 1), 99);
  assert.equal(quoteSell({ yes: 0, no: 1000 }, "no", 1), 99);
});

test("near-certain buys preserve the exact integer linear cost", () => {
  const yesQ = applyTrade(initialQ(9), "yes", 1000);
  const noQ = { yes: yesQ.no, no: yesQ.yes };
  assert.deepEqual(quoteBuy(yesQ, "yes", 8200), { contracts: 82, cost: 8200 });
  assert.deepEqual(quoteBuy(noQ, "no", 8200), { contracts: 82, cost: 8200 });
});
