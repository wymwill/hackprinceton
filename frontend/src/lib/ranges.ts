/**
 * Numerical range bets, on the client. The server (migration 0010) is the source
 * of truth: it checks the ranges, writes their labels and picks the winning range.
 * These helpers mirror it so the editor and the settle form can preview the result.
 *
 * Every range is lower-inclusive and upper-exclusive: lower ≤ x < upper. Null = open.
 */
import type { Bet, Outcome, RangeDraft } from "./types.ts";

export const MAX_RANGES = 10;
export const UNIT_SUGGESTIONS = ["°F", "°C", "points", "$", "%", "in", "mi", "min", "lbs"];
const CURRENCY = new Set(["$", "€", "£", "¥"]);
const LIMIT = 1_000_000_000;

/** The temperature example: below 60, 60–64, 65–69, 70–74, 75–79, 80 or above. */
export const defaultRange = (): RangeDraft => ({ unit: "°F", decimals: 0, cuts: ["60", "65", "70", "75", "80"], openBelow: true, openAbove: true });

export const fmtNum = (v: number, decimals: number) => v.toFixed(decimals);

/** "72°F", "$4.50", "12 points", "-3.5°C". */
export function withUnit(text: string, unit: string) {
  if (!unit) return text;
  if (CURRENCY.has(unit)) return text.startsWith("-") ? `-${unit}${text.slice(1)}` : `${unit}${text}`;
  return /^\p{L}/u.test(unit) ? `${text} ${unit}` : `${text}${unit}`;
}
export const fmtValue = (v: number, unit: string, decimals: number) => withUnit(fmtNum(v, decimals), unit);

/** Same as the server's _bs_range_label: [60, 65) at 0 places is "60–64°F". */
export function rangeLabel(lower: number | null, upper: number | null, unit: string, decimals: number) {
  const step = 10 ** -decimals;
  if (lower === null && upper !== null) return `Below ${fmtValue(upper, unit, decimals)}`;
  if (upper === null && lower !== null) return `${fmtValue(lower, unit, decimals)} or above`;
  if (lower === null || upper === null) return "Any value";
  const top = Math.round((upper - step) * 10 ** decimals) / 10 ** decimals;
  if (top === lower) return fmtValue(lower, unit, decimals);
  const from = CURRENCY.has(unit) ? fmtValue(lower, unit, decimals) : fmtNum(lower, decimals);
  return `${from}${lower < 0 || top < 0 ? " to " : "–"}${fmtValue(top, unit, decimals)}`;
}

/** The exact rule, so nobody has to guess which end is included: "60 ≤ x < 65". */
export function rangeRule(lower: number | null, upper: number | null, unit: string, decimals: number) {
  const f = (v: number) => fmtValue(v, unit, decimals);
  if (lower === null && upper !== null) return `under ${f(upper)}`;
  if (upper === null && lower !== null) return `${f(lower)} or more`;
  return `${f(lower!)} up to, not including, ${f(upper!)}`;
}

/** Parse a boundary the host typed. Null when it isn't a plain number. */
export function parseNum(s: string): number | null {
  const t = s.trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}
const places = (s: string) => (s.trim().split(".")[1] ?? "").length;

/** The ranges a draft describes: the gaps between its boundaries, plus the open ends it asks for. */
export function rangesOf(d: RangeDraft) {
  const cuts = d.cuts.map(parseNum) as number[];
  const out: { lower: number | null; upper: number | null }[] = [];
  if (d.openBelow && cuts.length) out.push({ lower: null, upper: cuts[0] });
  for (let i = 0; i < cuts.length - 1; i++) out.push({ lower: cuts[i], upper: cuts[i + 1] });
  if (d.openAbove && cuts.length) out.push({ lower: cuts[cuts.length - 1], upper: null });
  return out;
}

/** What's wrong with a range draft, or null. Mirrors _bs_clean_ranges. */
export function rangeProblem(d: RangeDraft): string | null {
  if (d.unit.trim().length > 12) return "Keep the unit to 12 characters.";
  if (!Number.isInteger(d.decimals) || d.decimals < 0 || d.decimals > 3) return "Decimal places must be 0 to 3.";
  for (let i = 0; i < d.cuts.length; i++) {
    const v = parseNum(d.cuts[i]);
    if (v === null) return `Boundary ${i + 1} must be a number.`;
    if (Math.abs(v) > LIMIT) return `Boundary ${i + 1} is too large.`;
    if (places(d.cuts[i]) > d.decimals) return `Boundary ${i + 1} has more than ${d.decimals} decimal place${d.decimals === 1 ? "" : "s"}.`;
    if (i > 0 && v <= parseNum(d.cuts[i - 1])!) return `Boundary ${i + 1} must be bigger than boundary ${i}.`;
  }
  const n = rangesOf(d).length;
  if (n < 2 || n > MAX_RANGES) return `That makes ${n} range${n === 1 ? "" : "s"}; use 2 to ${MAX_RANGES}.`;
  return null;
}

/** Boundaries start, start+width, … giving `count` closed ranges between them. */
export function generateCuts(start: number, width: number, count: number, decimals: number) {
  return Array.from({ length: count + 1 }, (_, i) => fmtNum(start + i * width, decimals));
}

/** The range a value falls in (lower ≤ value < upper), or undefined if it's outside them all. */
export function rangeFor(bet: Bet, value: number): Outcome | undefined {
  return bet.outcomes.find((o) => (o.lower == null || o.lower <= value) && (o.upper == null || value < o.upper));
}

/** A range draft from an existing range bet (for editing). */
export function draftFromBet(bet: Bet): RangeDraft {
  const os = bet.outcomes;
  const cuts = [...new Set(os.flatMap((o) => [o.lower, o.upper]).filter((v): v is number => v != null))].sort((a, b) => a - b);
  return {
    unit: bet.unit ?? "",
    decimals: bet.decimals ?? 0,
    cuts: cuts.map((v) => fmtNum(v, bet.decimals ?? 0)),
    openBelow: os[0]?.lower == null,
    openAbove: os[os.length - 1]?.upper == null,
  };
}
