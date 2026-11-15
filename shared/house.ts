import type { Bet, Series } from "../frontend/src/lib/types.ts";

export type HouseKind = "bet_placed" | "bet_resolved" | "upset";
export type HouseFlavor = "large" | "contrarian" | "ordinary" | "upset" | "close" | "win" | "refund" | "tie" | "void" | "wrapped" | "fumble";
export type HouseEvent = {
  id: string;
  seriesId: string;
  betId: string;
  kind: HouseKind;
  flavor: HouseFlavor;
  at: string;
  fact: string;
  /** Only numeric/boolean facts and fixed enums go to the model. No user text. */
  signals: { amount?: number; startingBankrollPercent?: number; contrarian?: boolean; pool?: number; winningPoolPercent?: number; players?: number; largestPayout?: number; bets?: number; wins?: number; winRate?: number; net?: number };
};
export type HouseComment = {
  event: Pick<HouseEvent, "id" | "seriesId" | "betId" | "kind" | "at">;
  comment: string;
  source: "openai" | "fallback" | "mock";
  quipId: string;
};

// Model output selects from these lines; it cannot supply facts, markup, insults,
// identity claims or betting instructions. Keep jokes about decisions, not people.
const QUIPS: Record<HouseFlavor, readonly string[]> = {
  large: [
    "Diversification has officially left the chat.",
    "That prediction came with a moving truck for the coins.",
    "A bold position. The scoreboard is paying attention.",
    "The confidence is loud. The result still gets the final word.",
  ],
  contrarian: [
    "The group chat has a majority. Reality has yet to vote.",
    "Taking the scenic route away from consensus.",
    "An independent prediction enters the arena.",
    "Consensus just received a strongly worded disagreement.",
  ],
  ordinary: [
    "A prediction with a receipt. We respect the paperwork.",
    "The coins are in. Now comes the wildly underrated waiting part.",
    "Position taken. Let the contest do the talking.",
    "The scoreboard has been notified of this confidence.",
  ],
  upset: [
    "THE UNDERDOG ACTUALLY WON. Confidence and accuracy are different departments.",
    "The minority report just became the official report.",
    "What a finish. A small corner of the pool takes a very large bow.",
    "The consensus would like to speak to reality's manager.",
  ],
  close: [
    "A split pool, a definite answer. Debate club is adjourned.",
    "The pool was close. The receipts are exact.",
    "A proper contest. Applause for the winning prediction.",
  ],
  win: [
    "The losing predictions have been referred to the Department of Hindsight.",
    "The scoreboard has completed its peer review.",
    "Credit to the winning prediction. That is a well-earned victory lap.",
    "The result has requested a formal apology from the other predictions.",
  ],
  refund: [
    "The coins have returned from their very brief field trip.",
    "No victory lap on a refund. The coins are simply coming home.",
    "A clean return. The scoreboard keeps its composure.",
  ],
  tie: [
    "A photo finish for opinions. The rulebook gets the microphone.",
    "Even the result needed to read the small print.",
    "Honors shared; the agreed rules handle the coins.",
  ],
  void: [
    "Plot twist: the coins were just here for the atmosphere.",
    "This prediction has been canceled, not proven correct.",
    "Wagers returned. On to the next contest.",
  ],
  wrapped: [
    "Your confidence has filed an annual report. The numbers have added footnotes.",
    "A season of bold calls, settled receipts, and absolutely no need to explain that one.",
    "The record is in. The group chat may now begin its peer review.",
    "Every coin has a story. A few of yours are requesting legal representation.",
    "A memorable campaign. The spreadsheet is still processing the plot twists.",
    "The scoreboard remembers. Luckily, it also remembers the comeback.",
  ],
  fumble: [
    "Your coins made a bold exit. Your confidence stayed for questions.",
    "Strong conviction. The result has entered evidence.",
    "The scoreboard filed this under: decisive, if not correct.",
    "A confident investment in the wrong plot.",
    "Today's market is now part of the exhibit on certainty.",
  ],
};

export function houseChoices(event: HouseEvent) {
  return QUIPS[event.flavor].map((text, i) => ({ id: `${event.flavor}-${i}`, text }));
}

/** Stable local one-liner for a verified personal fumble; never needs an API call. */
export function houseFumbleQuip(eventId: string) {
  let hash = 0;
  for (const c of eventId) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  const quips = QUIPS.fumble;
  return quips[hash % quips.length];
}

export function fallbackChoice(event: HouseEvent): string {
  let hash = 0;
  for (const c of event.id) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  const choices = houseChoices(event);
  return choices[hash % choices.length].id;
}

export function houseComment(event: HouseEvent, quipId = fallbackChoice(event), source: HouseComment["source"] = "fallback"): HouseComment {
  const choice = houseChoices(event).find((q) => q.id === quipId);
  const selected = choice ?? houseChoices(event).find((q) => q.id === fallbackChoice(event))!;
  return {
    event: { id: event.id, seriesId: event.seriesId, betId: event.betId, kind: event.kind, at: event.at },
    comment: `${event.fact} ${selected.text}`,
    source: choice ? source : "fallback",
    quipId: selected.id,
  };
}

const coins = (n: number) => n.toLocaleString("en-US");
// Untrusted labels stay quoted in plain text, never HTML or a model instruction.
const label = (s: string) => `“${s.replace(/[\p{Cc}\p{Cf}]/gu, "").slice(0, 60)}”`;
const validCoins = (n: number) => Number.isSafeInteger(n) && n >= 0;

/** Latest observable event, from the EXISTING authoritative snapshot. No new ledger.
 * Wagers are aggregated per player: say "now has", never invent the last increment.
 * Starting bankroll is fixed; current balance is not a historical placement balance.
 * Settled results preserve pre-settlement stakes, including withdrawn-wager removal.
 */
export function houseEvent(s: Series, b: Bet): HouseEvent | null {
  if (b.status === "draft") return null;
  const name = (id: string) => label(s.members.find((m) => m.userId === id)?.name ?? "A player");
  const base = { seriesId: s.id, betId: b.id };
  if (b.status === "resolved" || b.status === "canceled") {
    if (!b.settledAt || !Number.isFinite(Date.parse(b.settledAt)) || !b.results) return null;
    const rows = b.results;
    if (rows.some((r) => !validCoins(r.stake) || !validCoins(r.payout))) return null;
    const pool = rows.reduce((n, r) => n + r.stake, 0);
    if (!validCoins(pool)) return null;
    const winner = b.outcomes.find((o) => o.id === b.outcomeId);
    const tied = (b.tiedOutcomeIds ?? []).length > 1;
    const winningStake = rows.filter((r) => r.outcomeId === b.outcomeId).reduce((n, r) => n + r.stake, 0);
    const share = pool ? winningStake / pool : 0;
    const outcomePools = b.outcomes.map((o) => rows.filter((r) => r.outcomeId === o.id).reduce((n, r) => n + r.stake, 0)).sort((a, z) => z - a);
    // A tie, refund, one-sided pool or tiny sample is never called an upset.
    const upset = !b.refunded && !tied && !!winner && rows.length >= 3 && winningStake > 0 && share <= 0.25 && winningStake < outcomePools[0];
    const close = rows.length >= 2 && outcomePools.length >= 2 && outcomePools[1] > 0 && (outcomePools[0] - outcomePools[1]) / pool <= 0.1;
    const largest = [...rows].sort((a, z) => z.payout - a.payout || a.userId.localeCompare(z.userId))[0];
    let flavor: HouseFlavor = upset ? "upset" : close ? "close" : "win";
    let fact: string;
    if (b.status === "canceled") {
      flavor = "void";
      fact = "Bet canceled. Every wager was refunded.";
    } else if (tied) {
      flavor = "tie";
      fact = b.refunded ? "The reported outcomes tied. Every wager was refunded." : `${winner ? label(winner.label) : "The first-listed outcome"} wins the reported tie under the first-listed rule.`;
    } else if (b.refunded) {
      flavor = "refund";
      fact = `${winner ? `Result: ${label(winner.label)}. ` : ""}Every wager was refunded.`;
    } else {
      if (!winner) return null; // Never guess a missing winner.
      fact = `${label(winner.label)} wins${upset ? ` with only ${Math.round(share * 100)}% of the pre-settlement pool` : ""}.`;
      if (largest?.payout) fact += ` ${name(largest.userId)} receives ${coins(largest.payout)} coins (stake included).`;
    }
    return { ...base, id: `${s.id}/${b.id}/resolved/${b.settledAt}`, kind: upset ? "upset" : "bet_resolved", flavor, at: b.settledAt, fact,
      signals: { pool, winningPoolPercent: Math.round(share * 100), players: rows.length, largestPayout: largest?.payout ?? 0 } };
  }
  const latest = [...b.wagers].sort((a, z) => Date.parse(z.updatedAt) - Date.parse(a.updatedAt) || a.userId.localeCompare(z.userId))[0];
  if (!latest || !Number.isFinite(Date.parse(latest.updatedAt)) || !validCoins(latest.amount) || !latest.amount) return null;
  const outcome = b.outcomes.find((o) => o.id === latest.outcomeId);
  if (!outcome || !validCoins(s.settings.startingCoins) || !s.settings.startingCoins) return null;
  const percent = Math.round(100 * latest.amount / s.settings.startingCoins);
  const others = b.wagers.filter((w) => w.userId !== latest.userId);
  const opposition = others.filter((w) => w.outcomeId !== latest.outcomeId).length;
  const strongestOpposition = Math.max(0, ...b.outcomes.filter((o) => o.id !== latest.outcomeId)
    .map((o) => others.filter((w) => w.outcomeId === o.id).length));
  const contrarian = others.length >= 2 && strongestOpposition / others.length >= 0.75;
  const large = latest.amount / s.settings.startingCoins >= 0.5;
  const flavor = large ? "large" : contrarian ? "contrarian" : "ordinary";
  const fact = `${name(latest.userId)} now has ${coins(latest.amount)} coins on ${label(outcome.label)}${large ? ` — ${percent}% of their starting bankroll` : ""}.${contrarian ? ` ${opposition} of ${others.length} other bettors currently back a different outcome.` : ""}`;
  return { ...base, id: `${s.id}/${b.id}/wager/${latest.userId}/${latest.updatedAt}/${latest.amount}`, kind: "bet_placed", flavor, at: latest.updatedAt, fact,
    signals: { amount: latest.amount, startingBankrollPercent: percent, contrarian, players: b.wagers.length } };
}
