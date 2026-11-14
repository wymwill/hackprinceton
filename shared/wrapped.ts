import type { Bet, Series } from "../frontend/src/lib/types.ts";

export type WrappedArchetype = { id: string; title: string; subtitle: string; description: string; color: string; reason: string };
export type WrappedMoment = { seriesId: string; betId: string; series: string; question: string; outcome: string; stake: number; payout: number; net: number; date: string };
export type WrappedSummary = {
  year: number; demo: boolean; name: string; totalBets: number; totalWagered: number; markets: number;
  eligible: number; wins: number; winRate: number | null; net: number; bestStreak: number; worstStreak: number;
  archetype: WrappedArchetype; best: WrappedMoment | null; worst: WrappedMoment | null;
  social: { nemesis: { name: string; beaten: number; shared: number } | null; rideOrDie: { name: string; aligned: number; shared: number } | null; opposite: { name: string; disagreed: number; shared: number } | null };
  timeline: { date: string; net: number; cumulative: number; label: string }[];
};

const archetypes = {
  fresh: { id: "fresh", title: "THE FRESH ACCOUNT", subtitle: "A blank page. A suspiciously clean record.", description: "The book is still open on what kind of bettor you are.", color: "mint" },
  unbeaten: { id: "unbeaten", title: "THE UNDEFEATED LEGEND", subtitle: "The sample size is finally respectable.", description: "Every eligible settled prediction landed your way. The House has checked twice.", color: "gold" },
  comeback: { id: "comeback", title: "THE COMEBACK KID", subtitle: "A plot twist with receipts.", description: "Your settled record hit a real low, then climbed back. The comeback is in the numbers.", color: "coral" },
  sniper: { id: "sniper", title: "THE SNIPER", subtitle: "Fewer bets. More receipts.", description: "You picked your spots and hit at a rate the rest of the table should respect.", color: "violet" },
  whale: { id: "whale", title: "THE WHALE", subtitle: "Small wagers were apparently unavailable.", description: "You repeatedly put a large share of a series bankroll behind your calls.", color: "blue" },
  cautious: { id: "cautious", title: "THE CAUTIOUS ACCOUNTANT", subtitle: "The coins have a financial adviser.", description: "Your usual stake stayed small beside the starting bankroll. Sensible. Suspiciously sensible.", color: "mint" },
  optimist: { id: "optimist", title: "THE DELUSIONAL OPTIMIST", subtitle: "Hope remains an unlimited resource.", description: "Your conviction ran ahead of your eligible win rate. The next call is always the one.", color: "coral" },
  chaos: { id: "chaos", title: "THE CHAOS MERCHANT", subtitle: "Nobody could have predicted this. Including you.", description: "The record swings, the stakes show up, and certainty remains undefeated.", color: "orange" },
  steady: { id: "steady", title: "THE STEADY HAND", subtitle: "Quietly making the numbers behave.", description: "No single habit dominates your record. A rare display of measured decision-making.", color: "violet" },
} as const;

type Record = { series: Series; bet: Bet; stake: number; payout: number; net: number; outcomeId: string | null; date: string; resolved: boolean; eligible: boolean; tied: boolean; refunded: boolean };
const safeAmount = (n: number) => Number.isSafeInteger(n) && n >= 0;

function deriveArchetype(records: Record[], eligible: Record[], bets: number, winRate: number | null, totalWagered: number, timeline: WrappedSummary["timeline"]): WrappedArchetype {
  const riskRatios = records.map((r) => r.stake / Math.max(1, r.series.settings.startingCoins)).filter(Number.isFinite);
  const bigRatio = riskRatios.length ? riskRatios.filter((x) => x >= 0.5).length / riskRatios.length : 0;
  const avgRatio = riskRatios.length ? riskRatios.reduce((a, x) => a + x, 0) / riskRatios.length : 0;
  const peakLoss = timeline.reduce((min, x) => Math.min(min, x.cumulative), 0);
  const end = timeline.at(-1)?.cumulative ?? 0;
  if (bets === 0) return { ...archetypes.fresh, reason: "No personal wagers are recorded for this period." };
  if (eligible.length >= 8 && eligible.every((r) => r.net > 0)) return { ...archetypes.unbeaten, reason: `${eligible.length} of ${eligible.length} eligible settled bets were profitable.` };
  if (timeline.length >= 5 && peakLoss <= -100 && end >= peakLoss + 100 && end > 0) return { ...archetypes.comeback, reason: `Your record recovered ${end - peakLoss} coins from its low point.` };
  if (bets >= 8 && bets <= 20 && eligible.length >= 8 && (winRate ?? 0) >= 0.75) return { ...archetypes.sniper, reason: `${Math.round((winRate ?? 0) * 100)}% wins across ${eligible.length} eligible settled bets.` };
  if (bets >= 4 && bigRatio >= 0.5) return { ...archetypes.whale, reason: `${Math.round(bigRatio * 100)}% of your recorded wagers were at least half a series starting bankroll.` };
  if (bets >= 5 && avgRatio <= 0.1) return { ...archetypes.cautious, reason: `Your average wager was ${Math.round(avgRatio * 100)}% of a series starting bankroll.` };
  if (eligible.length >= 5 && (winRate ?? 1) < 0.35 && avgRatio >= 0.2) return { ...archetypes.optimist, reason: `${Math.round((winRate ?? 0) * 100)}% wins with an average stake of ${Math.round(avgRatio * 100)}% of starting bankroll.` };
  if (eligible.length >= 5 && totalWagered > 0) return { ...archetypes.chaos, reason: `${eligible.length} eligible results and ${Math.round(avgRatio * 100)}% average bankroll risk per bet.` };
  return { ...archetypes.steady, reason: `${bets} recorded wagers; more settled history will reveal stronger patterns.` };
}

/** Build a private, read-only recap from only the authenticated player's existing series snapshot. */
export function getWrappedSummary(seriesList: Series[], userId: string, name: string, year: number, demo = false): WrappedSummary {
  const start = Date.UTC(year, 0, 1), end = Date.UTC(year + 1, 0, 1);
  const records: Record[] = [];
  for (const series of seriesList) for (const bet of series.bets) {
    if (bet.status === "draft") continue;
    const result = bet.results?.find((r) => r.userId === userId);
    const wager = bet.wagers.find((w) => w.userId === userId);
    if (!result && !wager) continue;
    const stake = result?.stake ?? wager?.amount ?? 0;
    const payout = result?.payout ?? 0;
    const net = result?.net ?? 0;
    if (!safeAmount(stake) || !safeAmount(payout) || !Number.isSafeInteger(net)) continue;
    // Resolved records belong to their settlement year. Never substitute the wager
    // date for a missing settlement timestamp; that would invent the reporting period.
    const date = bet.status === "resolved" ? bet.settledAt : wager?.updatedAt ?? wager?.firstAt;
    const time = date ? Date.parse(date) : Number.NaN;
    if (!Number.isFinite(time) || time < start || time >= end) continue;
    const tied = (bet.tiedOutcomeIds?.length ?? 0) > 1;
    const resolved = !!result && bet.status === "resolved";
    records.push({ series, bet, stake, payout, net, outcomeId: result?.outcomeId ?? wager?.outcomeId ?? null, date: date!, resolved, tied, refunded: bet.refunded || bet.status === "canceled", eligible: resolved && !bet.refunded && !tied && !!result?.outcomeId });
  }
  // A stable key protects totals if an inconsistent API snapshot repeats a market.
  const unique = [...new Map(records.map((r) => [`${r.series.id}/${r.bet.id}`, r])).values()];
  const eligible = unique.filter((r) => r.eligible);
  const wins = eligible.filter((r) => r.net > 0).length;
  const totalWagered = unique.reduce((n, r) => n + r.stake, 0);
  const net = unique.filter((r) => r.resolved).reduce((n, r) => n + r.net, 0);
  const settled = unique.filter((r) => r.resolved && !r.refunded && Number.isFinite(Date.parse(r.date))).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  let bestStreak = 0, worstStreak = 0, run = 0, sign = 0;
  for (const r of settled.filter((r) => !r.tied)) {
    const next = r.net > 0 ? 1 : r.net < 0 ? -1 : 0;
    if (!next) { run = 0; sign = 0; continue; }
    run = next === sign ? run + 1 : 1; sign = next;
    if (next > 0) bestStreak = Math.max(bestStreak, run); else worstStreak = Math.max(worstStreak, run);
  }
  let cumulative = 0;
  const timeline = settled.map((r) => {
    cumulative += r.net;
    return { date: r.date, net: r.net, cumulative, label: r.bet.question };
  });
  const moment = (r?: Record): WrappedMoment | null => r ? ({ seriesId: r.series.id, betId: r.bet.id, series: r.series.name, question: r.bet.question, outcome: r.bet.outcomes.find((o) => o.id === r.outcomeId)?.label ?? "Recorded outcome", stake: r.stake, payout: r.payout, net: r.net, date: r.date }) : null;
  const best = moment(eligible.filter((r) => r.net > 0).sort((a, b) => b.net - a.net || b.payout - a.payout)[0]);
  const worst = moment(eligible.filter((r) => r.net < 0).sort((a, b) => a.net - b.net || b.stake - a.stake)[0]);
  const comparisons = new Map<string, { name: string; shared: number; beaten: number; aligned: number; disagreed: number }>();
  for (const own of eligible) for (const other of own.bet.results ?? []) {
    if (other.userId === userId || !Number.isSafeInteger(other.net) || !other.outcomeId) continue;
    const member = own.series.members.find((m) => m.userId === other.userId);
    if (!member) continue;
    const c = comparisons.get(other.userId) ?? { name: member.name, shared: 0, beaten: 0, aligned: 0, disagreed: 0 };
    c.shared++;
    if (other.net > own.net) c.beaten++;
    if (other.outcomeId === own.outcomeId) c.aligned++; else c.disagreed++;
    comparisons.set(other.userId, c);
  }
  const peers = [...comparisons.values()].filter((c) => c.shared >= 5);
  const nemesis = [...peers].sort((a, b) => b.beaten - a.beaten || b.shared - a.shared)[0];
  const ride = [...peers].sort((a, b) => b.aligned - a.aligned || b.shared - a.shared)[0];
  const opposite = [...peers].sort((a, b) => b.disagreed - a.disagreed || b.shared - a.shared)[0];
  const winRate = eligible.length ? wins / eligible.length : null;
  const archetype = deriveArchetype(unique, eligible, unique.length, winRate, totalWagered, timeline);
  return {
    year, demo, name, totalBets: unique.length, totalWagered, markets: unique.length, eligible: eligible.length, wins,
    winRate, net, bestStreak, worstStreak, archetype, best, worst,
    social: {
      nemesis: nemesis ? { name: nemesis.name, beaten: nemesis.beaten, shared: nemesis.shared } : null,
      rideOrDie: ride ? { name: ride.name, aligned: ride.aligned, shared: ride.shared } : null,
      opposite: opposite ? { name: opposite.name, disagreed: opposite.disagreed, shared: opposite.shared } : null,
    }, timeline,
  };
}

export function demoWrappedSummary(year: number): WrappedSummary {
  const summary = getWrappedSummary([], "demo", "Piggopie", year, true);
  const demoTimeline = [-100, -80, -60, 50, 70, 80, 300].reduce<{ date: string; net: number; cumulative: number; label: string }[]>((rows, net, i) => {
    const cumulative = (rows.at(-1)?.cumulative ?? 0) + net;
    rows.push({ date: new Date(Date.UTC(year, i + 1, 5)).toISOString(), net, cumulative, label: `Demo market ${i + 1}` });
    return rows;
  }, []);
  return { ...summary, demo: true, totalBets: 18, markets: 18, totalWagered: 12450, eligible: 15, wins: 9, winRate: 0.6, net: 260, bestStreak: 4, worstStreak: 3,
    archetype: { ...archetypes.comeback, reason: "Demo record: a 240-coin slide followed by a 260-coin net recovery." },
    best: { seriesId: "demo", betId: "demo-best", series: "Demo series", question: "Will the underdog take it?", outcome: "YES", stake: 180, payout: 620, net: 440, date: new Date(Date.UTC(year, 5, 18)).toISOString() },
    worst: { seriesId: "demo", betId: "demo-worst", series: "Demo series", question: "Will the favorite cruise to victory?", outcome: "NO", stake: 850, payout: 0, net: -850, date: new Date(Date.UTC(year, 2, 12)).toISOString() },
    social: { nemesis: { name: "Will", beaten: 7, shared: 9 }, rideOrDie: { name: "Ana", aligned: 8, shared: 10 }, opposite: { name: "Will", disagreed: 8, shared: 10 } }, timeline: demoTimeline };
}
