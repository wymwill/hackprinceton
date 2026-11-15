import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { OutcomeTag, Pill, PoolBar } from "./ui.tsx";
import { isParticipant, leader, resultText, shares } from "../lib/rules.ts";
import { ago, fmt, signed } from "../lib/format.ts";
import { useStore } from "../lib/store.tsx";
import type { Bet, Series } from "../lib/types.ts";
const STATUS: Record<Bet["status"], string> = {
  draft: "Draft",
  open: "Open",
  closed: "Betting closed",
  resolved: "Resolved",
  canceled: "Canceled",
};

/** `showSeries`: name the series above the question (for lists that mix series, like Home). */
export function BetCard({ s, bet, showSeries = false }: { s: Series; bet: Bet; showSeries?: boolean }) {
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
      <Link className="bcard-link" to={href} aria-label={`Open bet: ${bet.question}`} />
      <div className="head">
        <div className="stack" style={{ gap: 8 }}>
          {showSeries && <span className="cap bcard-series truncate">{s.name}</span>}
          <Pill kind={bet.status}>{STATUS[bet.status]}</Pill>
          <h3>
            <Link to={href}>{bet.question}</Link>
          </h3>
        </div>
        <div className="chance" title="Share of the coins in the pool, not a probability">
          <div className={`v ${p.total ? "" : "empty"}`}>
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
