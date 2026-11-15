import { useState } from "react";
import { Link } from "react-router-dom";
import { NewBetModal, StandingsTable } from "../components/Standings.tsx";
import { SeriesBets } from "../components/SeriesBets.tsx";
import { ConfirmButton, DisclosurePanel, Panel, Pill } from "../components/ui.tsx";
import { balances, isParticipant, standings } from "../lib/rules.ts";
import { ago, fmt, ordinal, punishmentCopy } from "../lib/format.ts";
import { useStore } from "../lib/store.tsx";
import type { Series } from "../lib/types.ts";

export default function Dashboard({ s }: { s: Series }) {
  const { me } = useStore();
  const [writing, setWriting] = useState(false);
  const { api } = useStore();
  const isHost = s.hostId === me;
  const playing = isParticipant(s, me);
  const bal = playing ? balances(s).get(me)! : undefined;
  const st = playing ? standings(s).find((r) => r.userId === me)! : undefined;
  const settled = s.bets.filter((b) => b.status === "resolved" || b.status === "canceled").length;
  const canWrite = isHost && s.settings.betCreation === "during" && s.bets.length < s.settings.betCount;
  const unsettled = s.bets.filter((b) => b.status === "open" || b.status === "closed").length;

  return (
    <>
      <section className="hero">
        <div>
          <span className="row">
            <Pill kind="active">Live</Pill>
            {isHost && <Pill kind="host">You host</Pill>}
          </span>
          <h1 style={{ marginTop: 14 }}>{s.name}</h1>
          <p>
            {settled} of {s.settings.betCount} bets settled. Bottom {s.settings.losers} lose.
          </p>
        </div>
        {bal && st && (
          <div className="row" style={{ gap: 28 }}>
            <div>
              <span className="cap">Your coins</span>
              <div className="big-num">{fmt(bal.available)}</div>
              <span className="cap">{bal.atStake ? `+${fmt(bal.atStake)} in play` : "nothing in play"}</span>
            </div>
            <div>
              <span className="cap">Rank</span>
              <div className={`big-num ${st.losing ? "down" : ""}`}>{ordinal(st.rank)}</div>
              <span className="cap">{st.losing ? "in the losing zone" : `of ${standings(s).length}`}</span>
            </div>
          </div>
        )}
      </section>

      <div className="grid2">
        <div className="col">
          <SeriesBets s={s} />
        </div>

        <div className="col">
          {isHost && (
            <Panel label="Host controls">
              <div className="stack">
                <div className="kv">
                  Bets written <b>{s.bets.length}/{s.settings.betCount}</b>
                </div>
                {canWrite ? (
                  <button type="button" className="btn primary" onClick={() => setWriting(true)}>
                    + New bet
                  </button>
                ) : (
                  <p className="hint">
                    {s.bets.length >= s.settings.betCount
                      ? "All bets are written. Settle them to finish."
                      : "Bets were set before the series started."}
                  </p>
                )}
                <p className="hint">Open a bet to manage it.</p>
                <ConfirmButton
                  className="btn"
                  label="End series now"
                  confirm="End and rank everyone?"
                  disabled={unsettled > 0}
                  onConfirm={() => api.completeSeries(s.id, "Series over.")}
                />
                {unsettled > 0 && <p className="hint">Resolve or cancel {unsettled} open bet{unsettled === 1 ? "" : "s"} before ending early.</p>}
              </div>
            </Panel>
          )}
          <Panel label="Leaderboard" right={<Link to={`/s/${s.id}/leaderboard`}>Full →</Link>}>
            <StandingsTable s={s} compact />
          </Panel>

        </div>
      </div>

          <DisclosurePanel label={`Activity · ${s.activity.length}`} className="activity-panel">
            <div className="tape" tabIndex={0} role="region" aria-label="Series activity">
              {s.activity.map((a, i) => (
                <div key={i} className="tape-row">
                  <span>{punishmentCopy(a.text)}</span>
                  <span className="when">{ago(a.at)}</span>
                </div>
              ))}
            </div>
          </DisclosurePanel>

      {writing && <NewBetModal s={s} onClose={() => setWriting(false)} />}
    </>
  );
}
