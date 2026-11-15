import { useState } from "react";
import { standings } from "../lib/rules.ts";
import { fmt, signed, toLocalInput } from "../lib/format.ts";
import { useStore } from "../lib/store.tsx";
import type { Bet, BetDraft, Series } from "../lib/types.ts";
import OutcomeEditor, { newDraft, outcomeProblem } from "./OutcomeEditor.tsx";
import { defaultRange, draftFromBet } from "../lib/ranges.ts";
import { Modal, Who } from "./ui.tsx";

/** Ranked by settled coins; the dashed line marks where the bottom X start. */
export function StandingsTable({ s, compact = false }: { s: Series; compact?: boolean }) {
  const { me } = useStore();
  const rows = standings(s);
  const start = s.settings.startingCoins;
  const cut = rows.length - s.settings.losers;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>#</th>
          <th>Player</th>
          <th className="r">Coins</th>
          {!compact && <th className="r">Net</th>}
          {!compact && <th className="r">In play</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.userId} className={`${r.userId === me ? "me" : ""} ${r.losing ? "losing" : ""} ${i === cut && s.status !== "lobby" ? "cutline" : ""}`}>
            <td className="rank">{r.rank}</td>
            <td>
              <Who id={r.userId} suffix={r.losing && !compact ? <span className="pill lose" style={{ marginLeft: 8 }}>Bottom {s.settings.losers}</span> : null} />
            </td>
            <td className="r num bright">{fmt(r.coins)}</td>
            {!compact && <td className={`r num ${r.coins > start ? "up" : r.coins < start ? "down" : "dim"}`}>{signed(r.coins - start)}</td>}
            {!compact && <td className="r num dim">{r.atStake ? fmt(r.atStake) : "–"}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Write a bet, or edit a draft one (`bet`). YES/NO or multiple choice. Drafts can
 * change freely; once betting on a bet opens, its outcomes lock.
 */
export function NewBetModal({ s, bet, onClose }: { s: Series; bet?: Bet; onClose: () => void }) {
  const { api } = useStore();
  const [draft, setDraft] = useState<BetDraft>(() =>
    bet
      ? {
          question: bet.question,
          kind: bet.kind,
          outcomes: bet.kind === "multi" ? bet.outcomes.map((o) => ({ id: o.id, label: o.label })) : [{ label: "" }, { label: "" }],
          tieRule: bet.tieRule,
          range: bet.kind === "range" ? draftFromBet(bet) : defaultRange(),
          closesAt: toLocalInput(bet.closesAt),
        }
      : newDraft()
  );
  const left = s.settings.betCount - s.bets.length;
  const problem = draft.question.trim().length < 3 ? "Write the question (at least 3 characters)." : outcomeProblem(draft);
  const opensNow = !bet && s.status !== "lobby";
  return (
    <Modal kicker={bet ? "Edit draft bet" : s.status === "lobby" ? "Write a bet" : "New bet · opens now"} title={bet ? "Edit bet" : "New bet"} onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (problem) return;
          const ok = bet
            ? await api.updateBet(s.id, bet.id, draft, "Bet updated.")
            : await api.addBet(s.id, draft, s.status === "lobby" ? "Bet written." : "Bet is open.");
          if (ok) onClose();
        }}
      >
        <label className="field">
          <span>Question</span>
          <textarea
            className="input"
            value={draft.question}
            onChange={(e) => setDraft({ ...draft, question: e.target.value })}
            maxLength={300}
            placeholder={
              draft.kind === "range"
                ? "What will tomorrow's high temperature be?"
                : draft.kind === "multi"
                  ? "Who will score highest on the midterm?"
                  : "Will Sam hit the gym 5 times this week?"
            }
            autoFocus
          />
        </label>
        <OutcomeEditor value={draft} onChange={setDraft} idPrefix={bet ? `edit-${bet.id}` : "new-bet"} />
        <p className="hint">
          {bet
            ? "Players see the changes right away. Once betting on this bet opens, its outcomes can't change."
            : `${left} of ${s.settings.betCount} bet${s.settings.betCount === 1 ? "" : "s"} left to write. You decide the result later, even if you're playing.`}
          {opensNow && " This bet opens as soon as you add it, so its outcomes lock immediately."}
        </p>
        <button className="btn primary" disabled={!!problem} title={problem ?? undefined}>
          {bet ? "Save changes" : s.status === "lobby" ? "Add to series" : "Open bet"}
        </button>
      </form>
    </Modal>
  );
}
