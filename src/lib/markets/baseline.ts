import type { BookieEstimate, Fact } from "./types";

/**
 * The Bookie's history-based baseline. Pure, and used both as the no-AI
 * fallback and as the starting point the model is asked to adjust.
 *
 * Every number comes from settled markets, and each fact lists the market ids
 * it was computed from, so anything shown can be traced back to real records.
 */

export type SettledRecord = {
  marketId: string;
  category: string;
  subjectId?: string;
  /** True when Yes won. Void markets are left out. */
  yes: boolean;
  settledAt: string;
};

export type BaselineInput = {
  category: string;
  subjectId?: string;
  subjectName?: string;
  history: SettledRecord[];
};

export type Baseline = Pick<BookieEstimate, "chance" | "range" | "uncertainty" | "explanation" | "facts">;

const RECENT = 10;
const PRIOR_WEIGHT = 2;
const MIN_CATEGORY = 3;

const pct = (p: number) => Math.round(p * 100);
const clamp = (n: number) => Math.min(95, Math.max(5, n));

export function baselineEstimate({ category, subjectId, subjectName, history }: BaselineInput): Baseline {
  const usable = [...history].sort((a, b) => b.settledAt.localeCompare(a.settledAt));
  const facts: Fact[] = [];
  const name = subjectName?.split(" ")[0] ?? "they";

  const inCategory = usable.filter((r) => r.category === category);
  let prior = 0.5;
  if (inCategory.length >= MIN_CATEGORY) {
    const yes = inCategory.filter((r) => r.yes).length;
    prior = (yes + 1) / (inCategory.length + 2);
    facts.push({ id: "f_category", text: `Across ${inCategory.length} settled ${category} markets, Yes won ${yes}.`, marketIds: inCategory.map((r) => r.marketId) });
  }

  const theirs = subjectId ? usable.filter((r) => r.subjectId === subjectId).slice(0, RECENT) : [];
  const hits = theirs.filter((r) => r.yes).length;
  if (subjectId) {
    facts.push(
      theirs.length
        ? { id: "f_subject", text: `${name} came through on ${hits} of the last ${theirs.length} markets about ${name}.`, marketIds: theirs.map((r) => r.marketId) }
        : { id: "f_subject", text: `No settled markets have been about ${name} yet.`, marketIds: [] }
    );
    const sameCat = theirs.filter((r) => r.category === category);
    if (sameCat.length && sameCat.length !== theirs.length) {
      facts.push({ id: "f_subject_category", text: `In ${category}: ${sameCat.filter((r) => r.yes).length} of ${sameCat.length}.`, marketIds: sameCat.map((r) => r.marketId) });
    }
  }

  const n = theirs.length;
  const p = (hits + PRIOR_WEIGHT * prior) / (n + PRIOR_WEIGHT);
  const sd = Math.sqrt((p * (1 - p)) / (n + PRIOR_WEIGHT + 1));
  const chance = clamp(pct(p));
  const range: [number, number] = [Math.max(1, pct(p - 1.645 * sd)), Math.min(99, pct(p + 1.645 * sd))];
  const uncertainty = n >= 6 ? "low" : n >= 3 ? "medium" : "high";

  const basis = n
    ? `${name} is ${hits} for ${n} on markets like this.`
    : subjectId
      ? `${name} has no track record yet, so this is a guess.`
      : inCategory.length >= MIN_CATEGORY
        ? `Based on the group's ${category} record.`
        : "Not much history, so this starts near even.";

  return { chance, range, uncertainty, explanation: basis, facts };
}
