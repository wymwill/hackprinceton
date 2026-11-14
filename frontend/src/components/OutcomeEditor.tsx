import { useState } from "react";
import { defaultRange, generateCuts, MAX_RANGES, parseNum, rangeLabel, rangeProblem, rangeRule, rangesOf, UNIT_SUGGESTIONS } from "../lib/ranges.ts";
import type { BetDraft, BetKind, RangeDraft } from "../lib/types.ts";

export const MAX_OUTCOMES = 10;
export const MIN_OUTCOMES = 2;

/** A fresh draft: YES/NO by default. */
export const newDraft = (question = ""): BetDraft => ({
  question,
  kind: "binary",
  outcomes: [{ label: "" }, { label: "" }],
  tieRule: "refund",
  range: defaultRange(),
});

/**
 * What's wrong with a draft's outcomes, or null. Mirrors the server's checks
 * (_bs_clean_outcomes in 0009, _bs_clean_ranges in 0010) so the button can explain itself.
 */
export function outcomeProblem(d: BetDraft): string | null {
  if (d.kind === "range") return rangeProblem(d.range);
  if (d.kind !== "multi") return null;
  const labels = d.outcomes.map((o) => o.label.trim().replace(/\s+/g, " "));
  if (labels.length < MIN_OUTCOMES || labels.length > MAX_OUTCOMES) return `Give ${MIN_OUTCOMES} to ${MAX_OUTCOMES} outcomes.`;
  const blank = labels.findIndex((l) => !l);
  if (blank >= 0) return `Name outcome ${blank + 1}.`;
  if (labels.some((l) => l.length > 60)) return "Keep each outcome under 60 characters.";
  const seen = new Set<string>();
  for (const l of labels) {
    if (seen.has(l.toLowerCase())) return `"${l}" is listed twice.`;
    seen.add(l.toLowerCase());
  }
  return null;
}

const KINDS: { kind: BetKind; label: string }[] = [
  { kind: "binary", label: "Yes / No" },
  { kind: "multi", label: "Multiple choice" },
  { kind: "range", label: "Numerical range" },
];

/** Unit, precision, a quick generator, the boundaries, open ends, and a preview of every range. */
function RangeEditor({ value, onChange, idPrefix }: { value: RangeDraft; onChange: (r: RangeDraft) => void; idPrefix: string }) {
  const set = (patch: Partial<RangeDraft>) => onChange({ ...value, ...patch });
  const [gen, setGen] = useState({ start: "60", width: "5", count: "4" });
  const problem = rangeProblem(value);
  const ranges = problem ? [] : rangesOf(value);
  const genStart = parseNum(gen.start);
  const genWidth = parseNum(gen.width);
  const genCount = Number(gen.count);
  const genOk = genStart !== null && genWidth !== null && genWidth > 0 && Number.isInteger(genCount) && genCount >= 1 && genCount <= MAX_RANGES;

  return (
    <div className="stack range-editor">
      <div className="two-col">
        <label className="field">
          <span>Unit</span>
          <input className="input text" list={`${idPrefix}-units`} value={value.unit} maxLength={12} placeholder="°F, points, $…" onChange={(e) => set({ unit: e.target.value })} />
          <datalist id={`${idPrefix}-units`}>
            {UNIT_SUGGESTIONS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>Decimal places</span>
          <select className="input" value={value.decimals} onChange={(e) => set({ decimals: Number(e.target.value) })}>
            {[0, 1, 2, 3].map((d) => (
              <option key={d} value={d}>
                {d === 0 ? "Whole numbers" : `${d} (${(0).toFixed(d)})`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="tie-rule">
        <legend className="cap">Quick fill</legend>
        <div className="gen-row">
          <label className="field">
            <span>Start at</span>
            <input className="input" inputMode="decimal" value={gen.start} onChange={(e) => setGen({ ...gen, start: e.target.value })} aria-label="First boundary" />
          </label>
          <label className="field">
            <span>Width</span>
            <input className="input" inputMode="decimal" value={gen.width} onChange={(e) => setGen({ ...gen, width: e.target.value })} aria-label="Range width" />
          </label>
          <label className="field">
            <span>Ranges</span>
            <input className="input" type="number" min={1} max={MAX_RANGES} value={gen.count} onChange={(e) => setGen({ ...gen, count: e.target.value })} aria-label="Number of ranges between boundaries" />
          </label>
          <button
            type="button"
            className="btn sm"
            disabled={!genOk}
            onClick={() => set({ cuts: generateCuts(genStart!, genWidth!, genCount, value.decimals) })}
          >
            Fill
          </button>
        </div>
      </fieldset>

      <div className="stack" style={{ gap: 6 }}>
        <span className="cap">Boundaries, low to high</span>
        <ol className="outcome-rows" aria-label="Boundaries">
          {value.cuts.map((c, i) => (
            <li key={i} className="row">
              <span className="num dim" aria-hidden style={{ width: 22 }}>
                {i + 1}
              </span>
              <input
                id={`${idPrefix}-cut-${i}`}
                className="input"
                inputMode="decimal"
                value={c}
                aria-label={`Boundary ${i + 1}`}
                onChange={(e) => set({ cuts: value.cuts.map((x, j) => (j === i ? e.target.value : x)) })}
              />
              <button
                type="button"
                className="btn ghost sm"
                aria-label={`Remove boundary ${i + 1}`}
                disabled={value.cuts.length <= 1}
                onClick={() => set({ cuts: value.cuts.filter((_, j) => j !== i) })}
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            const last = parseNum(value.cuts[value.cuts.length - 1] ?? "");
            const prev = parseNum(value.cuts[value.cuts.length - 2] ?? "");
            const next = last !== null ? (prev !== null ? last + (last - prev) : last + 1) : 0;
            set({ cuts: [...value.cuts, next.toFixed(value.decimals)] });
            setTimeout(() => document.getElementById(`${idPrefix}-cut-${value.cuts.length}`)?.focus(), 0);
          }}
        >
          + Add boundary
        </button>
        <label className="check">
          <input type="checkbox" checked={value.openBelow} onChange={(e) => set({ openBelow: e.target.checked })} />
          <span>Include a range for anything below the first boundary</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={value.openAbove} onChange={(e) => set({ openAbove: e.target.checked })} />
          <span>Include a range for anything at or above the last boundary</span>
        </label>
      </div>

      {problem ? (
        <p className="hint warn" role="alert">
          {problem}
        </p>
      ) : (
        <div className="range-preview" aria-label="Ranges players will see">
          <span className="cap">
            {ranges.length} ranges · each includes its lower number and stops just before the next
          </span>
          <ol>
            {ranges.map((r, i) => (
              <li key={i}>
                <b>{rangeLabel(r.lower, r.upper, value.unit.trim(), value.decimals)}</b>
                <span className="dim">{rangeRule(r.lower, r.upper, value.unit.trim(), value.decimals)}</span>
              </li>
            ))}
          </ol>
          {(!value.openBelow || !value.openAbove) && (
            <p className="hint">A result outside every range refunds everyone.</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * YES/NO, multiple choice or numerical range, with the details for each. Everything
 * here locks once betting opens.
 */
export default function OutcomeEditor({ value, onChange, idPrefix }: { value: BetDraft; onChange: (d: BetDraft) => void; idPrefix: string }) {
  const set = (patch: Partial<BetDraft>) => onChange({ ...value, ...patch });
  const rows = value.outcomes;
  const setRows = (outcomes: BetDraft["outcomes"]) => set({ outcomes });
  const move = (i: number, by: -1 | 1) => {
    const next = [...rows];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setRows(next);
  };
  const problem = value.kind === "multi" ? outcomeProblem(value) : null;

  return (
    <div className="stack outcome-editor">
      <div className="seg" role="radiogroup" aria-label="Kind of bet">
        {KINDS.map((k) => (
          <button key={k.kind} type="button" role="radio" aria-checked={value.kind === k.kind} className={value.kind === k.kind ? "on" : ""} onClick={() => set({ kind: k.kind })}>
            {k.label}
          </button>
        ))}
      </div>

      {value.kind === "range" && <RangeEditor value={value.range} onChange={(range) => set({ range })} idPrefix={idPrefix} />}

      {value.kind === "multi" && (
        <>
          <ol className="outcome-rows" aria-label="Outcomes">
            {rows.map((o, i) => (
              <li key={o.id ?? `new-${i}`} className="row">
                <span className="num dim" aria-hidden style={{ width: 22 }}>
                  {i + 1}
                </span>
                <input
                  id={`${idPrefix}-outcome-${i}`}
                  className="input text"
                  value={o.label}
                  maxLength={60}
                  placeholder={i === rows.length - 1 && rows.length > 2 ? "Other" : `Option ${i + 1}`}
                  aria-label={`Outcome ${i + 1}`}
                  onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
                />
                <button type="button" className="btn ghost sm" aria-label={`Move outcome ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button type="button" className="btn ghost sm" aria-label={`Move outcome ${i + 1} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  aria-label={`Remove outcome ${i + 1}`}
                  disabled={rows.length <= MIN_OUTCOMES}
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>
          {rows.length < MAX_OUTCOMES && (
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                setRows([...rows, { label: "" }]);
                setTimeout(() => document.getElementById(`${idPrefix}-outcome-${rows.length}`)?.focus(), 0);
              }}
            >
              + Add outcome
            </button>
          )}
          <fieldset className="tie-rule">
            <legend className="cap">If it's a tie</legend>
            <label className="check">
              <input type="radio" name={`${idPrefix}-tie`} checked={value.tieRule === "refund"} onChange={() => set({ tieRule: "refund" })} />
              <span>Everyone gets their coins back</span>
            </label>
            <label className="check">
              <input type="radio" name={`${idPrefix}-tie`} checked={value.tieRule === "first_listed"} onChange={() => set({ tieRule: "first_listed" })} />
              <span>The outcome listed first wins</span>
            </label>
          </fieldset>
          <p className={problem ? "hint warn" : "hint"} role={problem ? "alert" : undefined}>
            {problem ?? `${rows.length} of up to ${MAX_OUTCOMES} outcomes. They lock once betting opens.`}
          </p>
        </>
      )}
    </div>
  );
}
