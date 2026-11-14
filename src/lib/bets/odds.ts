import type { BetView, Fact, OddsEstimate, Outcome } from "./types";

/**
 * The AI Bookie's statistical baseline. Pure and shared by the server (stored
 * estimates) and the client (live preview in the create form).
 *
 * Everything here is computed from settled bets in the database. Each fact
 * lists the bet ids it came from, so any number shown to a user can be traced
 * back to real records. When no history applies, the estimate says so and
 * starts from an even split rather than inventing a track record.
 */

/** One settled bet, reduced to what the odds model needs. */
export type SettledRecord = {
  betId: string;
  category: string;
  subjectId?: string;
  outcomes: string[];
  winningIndex: number;
  settledAt: string;
  refunded: boolean;
};

export type BaselineInput = {
  outcomes: Outcome[];
  category: string;
  subjectId?: string;
  subjectName?: string;
  history: SettledRecord[];
};

export type Baseline = Pick<OddsEstimate, "probabilities" | "range" | "uncertainty" | "explanation" | "facts" | "citedFactIds">;

/** How many of a subject's most recent bets count toward their record. */
export const RECENT = 10;
/** Weight of the prior, in "pretend" bets. */
const PRIOR_WEIGHT = 2;
/** Category base rates only kick in with at least this many bets. */
const MIN_CATEGORY = 3;

/** True for the Yes/No shape where outcome 0 means "it happens". */
export const isYesNo = (labels: string[]) => labels.length === 2 && /^yes$/i.test(labels[0].trim()) && /^no$/i.test(labels[1].trim());

const pct = (p: number) => Math.round(p * 100);
const firstName = (name?: string) => name?.split(" ")[0] ?? "they";

export function baselineEstimate(input: BaselineInput): Baseline {
  const { outcomes, category, subjectId, subjectName } = input;
  const usable = input.history.filter((r) => !r.refunded && isYesNo(r.outcomes)).sort((a, b) => b.settledAt.localeCompare(a.settledAt));
  const facts: Fact[] = [];

  if (!isYesNo(outcomes.map((o) => o.label))) {
    const even = 1 / outcomes.length;
    return {
      probabilities: outcomes.map((o) => ({ outcomeId: o.id, p: even })),
      uncertainty: "high",
      explanation:
        "No stored history applies to these outcomes, so the Bookie starts with an even split. Treat this as a placeholder, not a prediction.",
      facts,
      citedFactIds: [],
    };
  }

  // Prior: how often "Yes" has won in this category across the group.
  const inCategory = usable.filter((r) => r.category === category);
  let prior = 0.5;
  if (inCategory.length >= MIN_CATEGORY) {
    const yes = inCategory.filter((r) => r.winningIndex === 0).length;
    prior = (yes + 1) / (inCategory.length + 2);
    facts.push({
      id: "f_category",
      text: `Across ${inCategory.length} settled ${category} bets, Yes won ${yes}.`,
      betIds: inCategory.map((r) => r.betId),
    });
  }

  // Subject's own recent record.
  const name = firstName(subjectName);
  const theirs = subjectId ? usable.filter((r) => r.subjectId === subjectId).slice(0, RECENT) : [];
  const hits = theirs.filter((r) => r.winningIndex === 0).length;
  if (subjectId) {
    facts.push(
      theirs.length
        ? {
            id: "f_subject",
            text: `${name} came through on ${hits} of the last ${theirs.length} settled bets where ${name} was on the hook.`,
            betIds: theirs.map((r) => r.betId),
          }
        : { id: "f_subject", text: `No settled bets have had ${name} on the hook yet.`, betIds: [] }
    );
    const sameCat = theirs.filter((r) => r.category === category);
    if (sameCat.length && sameCat.length !== theirs.length) {
      facts.push({
        id: "f_subject_category",
        text: `In ${category}: ${sameCat.filter((r) => r.winningIndex === 0).length} of ${sameCat.length}.`,
        betIds: sameCat.map((r) => r.betId),
      });
    }
  }

  const n = theirs.length;
  const p = (hits + PRIOR_WEIGHT * prior) / (n + PRIOR_WEIGHT);
  const sd = Math.sqrt((p * (1 - p)) / (n + PRIOR_WEIGHT + 1));
  const range: [number, number] = [pct(Math.max(0, p - 1.645 * sd)), pct(Math.min(1, p + 1.645 * sd))];
  const uncertainty = n >= 8 ? "low" : n >= 4 ? "medium" : "high";

  const basis = n
    ? `Based on ${name}'s ${n} settled ${n === 1 ? "bet" : "bets"}${inCategory.length >= MIN_CATEGORY ? ` and the group's ${category} record` : ""}.`
    : subjectId
      ? `${name} has no settled bets yet, so this ${inCategory.length >= MIN_CATEGORY ? `uses the group's ${category} record` : "starts at an even 50%"}.`
      : inCategory.length >= MIN_CATEGORY
        ? `No one is on the hook, so this uses the group's ${category} record.`
        : "No one is on the hook and there's little history, so this starts at an even 50%.";
  const caveat = uncertainty === "high" ? " Very little data: expect this to move." : uncertainty === "medium" ? " Some data, still a wide range." : "";

  return {
    probabilities: [
      { outcomeId: outcomes[0].id, p },
      { outcomeId: outcomes[1].id, p: 1 - p },
    ],
    range,
    uncertainty,
    explanation: `${pct(p)}% estimated chance of Yes (likely ${range[0]}–${range[1]}%). ${basis}${caveat}`,
    facts,
    citedFactIds: facts.map((f) => f.id),
  };
}

/** The same records, built from the bets the client already has (for the live preview). */
export function recordsFromViews(bets: BetView[]): SettledRecord[] {
  return bets.flatMap((b) =>
    b.receipt
      ? [
          {
            betId: b.id,
            category: b.category,
            subjectId: b.subjectId,
            outcomes: b.outcomes.map((o) => o.label),
            winningIndex: b.outcomes.findIndex((o) => o.id === b.receipt!.outcomeId),
            settledAt: b.receipt.settledAt,
            refunded: b.receipt.refunded,
          },
        ]
      : []
  );
}
