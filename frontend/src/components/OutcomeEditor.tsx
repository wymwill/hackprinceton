import type { BetDraft } from "../lib/types.ts";

export const MAX_OUTCOMES = 10;
export const MIN_OUTCOMES = 2;

/** A fresh draft: YES/NO by default. */
export const newDraft = (question = ""): BetDraft => ({ question, kind: "binary", outcomes: [{ label: "" }, { label: "" }], tieRule: "refund" });

/**
 * What's wrong with a draft's outcomes, or null. Mirrors the server's checks
 * (_bs_clean_outcomes in migration 0009) so the button can explain itself.
 */
export function outcomeProblem(d: BetDraft): string | null {
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

/**
 * YES/NO or multiple choice, and for multiple choice: the outcomes (add, rename,
 * reorder, remove) and what happens on a tie. Outcomes lock once betting opens.
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
  const problem = outcomeProblem(value);

  return (
    <div className="stack outcome-editor">
      <div className="seg" role="radiogroup" aria-label="Kind of bet">
        <button type="button" role="radio" aria-checked={value.kind === "binary"} className={value.kind === "binary" ? "on" : ""} onClick={() => set({ kind: "binary" })}>
          Yes / No
        </button>
        <button type="button" role="radio" aria-checked={value.kind === "multi"} className={value.kind === "multi" ? "on" : ""} onClick={() => set({ kind: "multi" })}>
          Multiple choice
        </button>
      </div>

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
                // Put the cursor in the new row.
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
