export const B = 25;
export const PAYOUT = 100;

export type Q = { yes: number; no: number };

function roundedCostIncrease(
  before: Q,
  after: Q,
  side: "yes" | "no",
  contracts: number,
  round: "ceil" | "floor",
): number {
  const other = side === "yes" ? "no" : "yes";
  // Preserve the known integer change when the purchased side remains the max.
  // Subtracting absolute quantities can turn it into slightly more than an integer.
  const linearContracts = before[side] >= before[other]
    ? contracts
    : Math.max(0, contracts - (before[other] - before[side]));
  const linear = PAYOUT * linearContracts;
  const beforeGap = Math.abs(before.yes - before.no) / B;
  const afterGap = Math.abs(after.yes - after.no) / B;
  const smallerGap = Math.min(beforeGap, afterGap);
  const largerGap = Math.max(beforeGap, afterGap);
  // Difference of log-sum-exp tails, retaining small changes with expm1.
  const tailMagnitude = PAYOUT * B * Math.log1p(
    Math.exp(-smallerGap) * -Math.expm1(smallerGap - largerGap)
      / (1 + Math.exp(-largerGap)),
  );
  const tail = afterGap < beforeGap ? tailMagnitude : -tailMagnitude;
  // Keep the integer component separate so a tiny negative tail still floors down.
  const whole = Math.floor(linear);
  return whole + Math[round]((linear - whole) + tail);
}

export function priceYes(q: Q): number {
  return 1 / (1 + Math.exp((q.no - q.yes) / B));
}

export function initialQ(chancePct: number): Q {
  const p = chancePct / 100;
  return { yes: B * Math.log(p / (1 - p)), no: 0 };
}

export function quoteBuy(
  q: Q,
  side: "yes" | "no",
  spend: number,
): { contracts: number; cost: number } {
  const buyCost = (contracts: number) => {
    if (contracts === 0) return 0;
    // At finite odds a positive trade has strictly positive cost, even if its
    // log-sum-exp tail is too small for floating-point numbers to represent.
    return Math.max(1, roundedCostIncrease(q, applyTrade(q, side, contracts), side, contracts, "ceil"));
  };

  let low = 0;
  let high = 100000;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (buyCost(mid) <= spend) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return { contracts: low, cost: buyCost(low) };
}

export function quoteSell(q: Q, side: "yes" | "no", contracts: number): number {
  if (contracts === 0) return 0;
  // A positive sale at finite odds is strictly below the full payout. Preserve
  // that bound when the negative tail underflows to zero.
  return Math.min(
    PAYOUT * contracts - 1,
    roundedCostIncrease(applyTrade(q, side, -contracts), q, side, contracts, "floor"),
  );
}

export function applyTrade(q: Q, side: "yes" | "no", deltaContracts: number): Q {
  return { ...q, [side]: q[side] + deltaContracts };
}
