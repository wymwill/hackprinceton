import { Link } from "react-router-dom";
import { StandingsTable } from "../components/Standings.tsx";
import { Panel, Pill, Who } from "../components/ui.tsx";
import { chooseFavor, markFavorDone, standings } from "../lib/engine.ts";
import { MODE_LABEL, fmt, ordinal } from "../lib/format.ts";
import { useStore } from "../lib/store.tsx";
import type { Series } from "../lib/types.ts";

function Podium({ s }: { s: Series }) {
  const rows = standings(s).slice(0, 3);
  // Show 2nd, 1st, 3rd so first place sits in the middle.
  const order = [rows[1], rows[0], rows[2]].filter(Boolean);
  return (
    <div className="podium">
      {order.map((r) => (
        <div key={r.userId} className={`panel spot ${r.rank === 1 ? "first" : ""}`}>
          <div className="place">{ordinal(r.rank)}</div>
          <b>
            <Who id={r.userId} />
          </b>
          <div className="num dim" style={{ marginTop: 6 }}>
            {fmt(r.coins)} coins
          </div>
        </div>
      ))}
    </div>
  );
}

function PoolPicks({ s }: { s: Series }) {
  const { me, run, name } = useStore();
  const list = s.assignments ?? [];
  const taken = new Set(list.map((a) => a.favorId).filter(Boolean));
  const nextUp = s.settings.exclusivePool ? list.find((a) => !a.favorId) : undefined;
  return (
    <Panel label="Favor picks" right={s.settings.exclusivePool ? "Each favor once" : "Favors reusable"}>
      <p className="hint">1st picks for last place, 2nd for second-to-last, and so on{s.settings.exclusivePool ? ", in that order" : ""}.</p>
      {list.map((a) => {
        const mineToPick = a.chooserId === me && !a.favorId;
        const myTurn = mineToPick && (!nextUp || nextUp.loserId === a.loserId);
        return (
          <div key={a.loserId} className="assign">
            <div>
              <span className="cap">Picks</span>
              <div>
                <Who id={a.chooserId!} />
              </div>
            </div>
            <span className="arrow">→</span>
            <div>
              <span className="cap">Owes the favor</span>
              <div>
                <Who id={a.loserId} />
              </div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              {a.favorId ? (
                <p className="notice ok">
                  <b>{a.text}</b> {a.done ? "· done" : ""}
                </p>
              ) : mineToPick ? (
                myTurn ? (
                  <div className="favor-chips">
                    {s.favors.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className="favor-chip"
                        disabled={s.settings.exclusivePool && taken.has(f.id)}
                        onClick={() => run((d, m, t) => chooseFavor(d, m, s.id, a.loserId, f.id, t), `Picked for ${name(a.loserId)}.`)}
                      >
                        {f.text}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="hint">Waiting for {name(nextUp!.chooserId!)} to pick first.</p>
                )
              ) : (
                <p className="hint">Waiting for {name(a.chooserId!)} to pick.</p>
              )}
            </div>
          </div>
        );
      })}
    </Panel>
  );
}

function OwedFavors({ s }: { s: Series }) {
  const { me, run } = useStore();
  const list = s.assignments ?? [];
  return (
    <Panel label="Favors owed">
      <div className="people">
        {list.map((a) => (
          <div key={a.loserId} className="person">
            <span style={{ minWidth: 0 }}>
              <Who id={a.loserId} />
              <div className="bright" style={{ marginTop: 6 }}>
                {a.text ?? "No favor recorded"}
              </div>
            </span>
            {a.done ? (
              <span className="pill open">Done</span>
            ) : a.loserId === me && a.text ? (
              <button type="button" className="btn sm primary" onClick={() => run((d, m, t) => markFavorDone(d, m, s.id, t), "Favor marked done.")}>
                Mark done
              </button>
            ) : (
              <span className="pill draft">Owed</span>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function MoneyOutcome({ s }: { s: Series }) {
  const list = s.assignments ?? [];
  return (
    <Panel label="Real money" right="Preview">
      <p className="notice">
        <b>No money moves in this demo.</b> Payment rules and processing still need team and legal review.
      </p>
      <div style={{ height: 12 }} />
      <div className="people">
        {list.map((a) => (
          <div key={a.loserId} className="person">
            <Who id={a.loserId} />
            <span className="num">owes ${fmt(s.settings.minContribution)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default function Results({ s }: { s: Series }) {
  const resolved = s.bets.filter((b) => b.status === "resolved").length;
  return (
    <>
      <section className="hero">
        <div>
          <span className="row">
            <Pill kind={s.status}>{s.status === "assigning" ? "Picking favors" : "Finished"}</Pill>
            <span className="cap">{MODE_LABEL[s.settings.mode]}</span>
          </span>
          <h1 style={{ marginTop: 14 }}>
            {s.name} <em>results</em>
          </h1>
          <p>
            {resolved} bet{resolved === 1 ? "" : "s"} resolved. The bottom {s.settings.losers} lost the series.
          </p>
        </div>
      </section>

      <Podium s={s} />

      <div className="grid2">
        <div className="col">
          <Panel label="Final standings">
            <StandingsTable s={s} />
          </Panel>
          <Panel label="Bets">
            <div className="people">
              {s.bets.map((b, i) => (
                <Link key={b.id} to={`/s/${s.id}/bets/${b.id}`} className="person">
                  <span>
                    <span className="num dim">{String(i + 1).padStart(2, "0")} </span>
                    <span className="bright">{b.question}</span>
                  </span>
                  <span className={b.outcome === "yes" ? "yes-t" : b.outcome === "no" ? "no-t" : "dim"}>
                    {b.status === "canceled" ? "Canceled" : b.outcome?.toUpperCase()}
                  </span>
                </Link>
              ))}
            </div>
          </Panel>
        </div>
        <div className="col">
          {s.settings.mode === "pool" && <PoolPicks s={s} />}
          {s.settings.mode !== "money" && s.status === "finished" && <OwedFavors s={s} />}
          {s.settings.mode === "money" && <MoneyOutcome s={s} />}
        </div>
      </div>
    </>
  );
}
