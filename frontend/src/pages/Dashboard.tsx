import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { NewBetModal, StandingsTable } from "../components/Standings.tsx";
import { ConfirmButton, Empty, OutcomeTag, Panel, Pill, PoolBar } from "../components/ui.tsx";
import { balances, isParticipant, leader, resultText, shares, standings } from "../lib/rules.ts";
import { ago, fmt, ordinal, signed } from "../lib/format.ts";
import { useStore } from "../lib/store.tsx";
import type { Bet, Series } from "../lib/types.ts";

const STATUS: Record<Bet["status"], string> = {
  draft: "Draft",
  open: "Open",
  closed: "Betting closed",
  resolved: "Resolved",
  canceled: "Canceled",
};

export function BetCard({ s, bet }: { s: Series; bet: Bet }) {
  const { me } = useStore();
  const p = shares(bet);
  const top = leader(bet);
  const binary = bet.kind === "binary";
  const yes = p.list[0];
  const mine = bet.wagers.find((w) => w.userId === me);
  const result = bet.results?.find((r) => r.userId === me);
  const href = `/s/${s.id}/bets/${bet.id}`;
  return (
    <article className="panel bcard">
      <div className="head">
        <div className="stack" style={{ gap: 8 }}>
          <Pill kind={bet.status}>{STATUS[bet.status]}</Pill>
          <h3>
            <Link to={href}>{bet.question}</Link>
          </h3>
        </div>
        <div className="chance" title="Share of the coins in the pool, not a probability">
          <div className="v">
            {!p.total ? "–" : binary ? yes.pct : top!.pct}
            {p.total > 0 && <small>%</small>}
          </div>
          <div className="cap">{!p.total ? (binary ? "no coins yet" : `${bet.outcomes.length} ${bet.kind === "range" ? "ranges" : "options"}`) : binary ? "of pool on yes" : `of pool on ${top!.label}`}</div>
        </div>
      </div>
      <PoolBar bet={bet} />
      {!binary && (
        <ul className="ochips" aria-label="Outcomes and their share of the pool">
          {p.list.map((o) => (
            <li key={o.id} style={{ "--oc": o.color } as CSSProperties}>
              <span className="lbl">{o.label}</span>
              <span className="num">{p.total ? `${o.pct}%` : "–"}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="meta">
        <span>
          Pool <b>{fmt(p.total)}</b>
        </span>
        <span>
          Players <b>{bet.wagers.length}</b>
        </span>
        <span>
          {mine ? (
            <>
              You <b className="num">{fmt(mine.amount)}</b> <OutcomeTag bet={bet} id={mine.outcomeId} />
            </>
          ) : (
            <>
              Opened <b>{bet.openedAt ? ago(bet.openedAt) : "–"}</b>
            </>
          )}
        </span>
      </div>
      {bet.status === "open" && isParticipant(s, me) && binary ? (
        <div className="yn">
          <Link className="y" to={`${href}?outcome=${p.list[0].id}`}>
            Yes <span className="num">{fmt(p.list[0].pool)}</span>
          </Link>
          <Link className="n" to={`${href}?outcome=${p.list[1].id}`}>
            No <span className="num">{fmt(p.list[1].pool)}</span>
          </Link>
        </div>
      ) : bet.status === "open" && isParticipant(s, me) ? (
        <Link to={href} className="settled pick">
          <span>{mine ? "Add to your pick" : bet.kind === "range" ? `Pick one of ${bet.outcomes.length} ranges` : `Pick one of ${bet.outcomes.length}`}</span>
          <span>Bet →</span>
        </Link>
      ) : bet.status === "resolved" ? (
        <div className="settled">
          <span>
            {bet.kind === "range" && bet.resultValue != null ? (
              <>
                Result <b>{resultText(bet)}</b>
                {bet.refunded && <span className="dim"> · refunded</span>}
              </>
            ) : bet.outcomeId ? (
              <>
                Result <OutcomeTag bet={bet} id={bet.outcomeId} />
                {bet.refunded && <span className="dim"> · refunded</span>}
              </>
            ) : bet.tiedOutcomeIds?.length ? (
              `${resultText(bet)} · refunded`
            ) : (
              "One-sided · refunded"
            )}
          </span>
          {result && <b className={`num ${result.net > 0 ? "up" : result.net < 0 ? "down" : "dim"}`}>{signed(result.net)}</b>}
        </div>
      ) : (
        <Link to={href} className="settled">
          <span>{bet.status === "canceled" ? "Canceled · coins returned" : "Waiting for the host's call"}</span>
          <span>View →</span>
        </Link>
      )}
    </article>
  );
}

type Filter = "open" | "closed" | "done";

export default function Dashboard({ s }: { s: Series }) {
  const { me } = useStore();
  const [filter, setFilter] = useState<Filter>("open");
  const [writing, setWriting] = useState(false);
  const { api } = useStore();
  const isHost = s.hostId === me;
  const playing = isParticipant(s, me);
  const bal = playing ? balances(s).get(me)! : undefined;
  const st = playing ? standings(s).find((r) => r.userId === me)! : undefined;
  const groups: Record<Filter, Bet[]> = {
    open: s.bets.filter((b) => b.status === "open"),
    closed: s.bets.filter((b) => b.status === "closed"),
    done: s.bets.filter((b) => b.status === "resolved" || b.status === "canceled"),
  };
  const shown = groups[filter];
  const canWrite = isHost && s.settings.betCreation === "during" && s.bets.length < s.settings.betCount;
  const unsettled = groups.open.length + groups.closed.length;

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
            {groups.done.length} of {s.settings.betCount} bets settled. The bottom {s.settings.losers} when it ends lose.
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
          <div className="tabs" role="tablist">
            {(
              [
                ["open", "Open"],
                ["closed", "Awaiting result"],
                ["done", "Settled"],
              ] as [Filter, string][]
            ).map(([k, label]) => (
              <button key={k} type="button" className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
                {label}
                <b>{groups[k].length}</b>
              </button>
            ))}
          </div>
          {shown.length ? (
            <div className="bgrid">
              {shown.map((b) => (
                <BetCard key={b.id} s={s} bet={b} />
              ))}
            </div>
          ) : (
            <Panel>
              <Empty title={filter === "open" ? "No open bets" : filter === "closed" ? "Nothing waiting" : "Nothing settled yet"}>
                {filter === "open" && canWrite ? "Write the next bet to keep the series moving." : null}
              </Empty>
            </Panel>
          )}
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
                      ? "Every bet is written. Resolve them to finish the series."
                      : "This series locked its bets before it started."}
                  </p>
                )}
                <p className="hint">Open a bet to lock betting, resolve it, or cancel it.</p>
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
          <Panel label="Activity">
            <div className="tape">
              {s.activity.slice(0, 10).map((a, i) => (
                <div key={i} className="tape-row">
                  <span>{a.text}</span>
                  <span className="when">{ago(a.at)}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {writing && <NewBetModal s={s} onClose={() => setWriting(false)} />}
    </>
  );
}
