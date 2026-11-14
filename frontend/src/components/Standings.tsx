import { useState } from "react";
import { standings } from "@rules/engine.ts";
import { fmt, signed } from "../lib/format.ts";
import { useStore } from "../lib/store.tsx";
import type { Series } from "@rules/types.ts";
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

export function NewBetModal({ s, onClose }: { s: Series; onClose: () => void }) {
  const { api } = useStore();
  const [q, setQ] = useState("");
  const left = s.settings.betCount - s.bets.length;
  return (
    <Modal kicker={s.status === "lobby" ? "Write a bet" : "New bet · opens now"} title="YES or NO?" onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await api.addBet(s.id, q, s.status === "lobby" ? "Bet written." : "Bet is open.")) onClose();
        }}
      >
        <label className="field">
          <span>Question</span>
          <textarea className="input" value={q} onChange={(e) => setQ(e.target.value)} maxLength={140} placeholder="Placeholder placeholder?" autoFocus />
        </label>
        <p className="hint">
          {left} of {s.settings.betCount} bet{s.settings.betCount === 1 ? "" : "s"} left to write. You decide the result
          later, even if you're playing.
        </p>
        <button className="btn primary" disabled={q.trim().length < 3}>
          {s.status === "lobby" ? "Add to series" : "Open bet"}
        </button>
      </form>
    </Modal>
  );
}
