import { Link } from "react-router-dom";
import { StandingsTable } from "../components/Standings.tsx";
import { OutcomeTag, Panel, Pill, Who } from "../components/ui.tsx";
import { agreesTo, resultText, standings } from "../lib/rules.ts";
import { MODE_LABEL, fmt, ordinal } from "../lib/format.ts";
import { useStore } from "../lib/store.tsx";
import type { Assignment, Series } from "../lib/types.ts";

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

const STATUS_PILL: Record<Assignment["status"], [string, string]> = {
  picking: ["draft", "Picking"],
  pending: ["open", "Assigned"],
  accepted: ["open", "Assigned"],
  declined: ["canceled", "Declined"],
};

/** The assigned punishment is owed immediately; the loser can mark it done. */
function LoserActions({ s, a }: { s: Series; a: Assignment }) {
  const { me, api } = useStore();
  if (a.loserId !== me) return null;
  if ((a.status === "accepted" || a.status === "pending") && !a.done && a.text) {
    return (
      <button type="button" className="btn sm primary" onClick={() => api.favorDone(s.id, "Punishment marked done.")}>
        Mark done
      </button>
    );
  }
  return null;
}

function PoolPicks({ s }: { s: Series }) {
  const { me, api, name } = useStore();
  const list = s.assignments;
  const held = new Set(list.filter((a) => a.status === "pending" || a.status === "accepted").map((a) => a.favorId));
  const nextUp = s.settings.exclusivePool ? list.find((a) => a.status === "picking") : undefined;
  return (
    <Panel label="Punishment picks" right={s.settings.exclusivePool ? "Each punishment once" : "Punishments reusable"}>
      <p className="hint">
        1st picks for last place, 2nd for second-to-last, and so on{s.settings.exclusivePool ? ", in that order" : ""}. Only
        punishments the loser agreed to before the series started can be picked. The choice is owed immediately.
      </p>
      {list.map((a) => {
        const picking = a.status === "picking" || a.status === "declined";
        const myPick = a.chooserId === me && picking;
        const myTurn = myPick && (!nextUp || nextUp.loserId === a.loserId || a.status === "declined");
        const options = s.favors.filter((f) => agreesTo(f, a.loserId));
        const [pill, label] = STATUS_PILL[a.status];
        return (
          <div key={a.id} className="assign">
            <div>
              <span className="cap">Picks</span>
              <div>
                <Who id={a.chooserId!} />
              </div>
            </div>
            <span className="arrow">→</span>
            <div>
              <span className="cap">Owes the punishment</span>
              <div>
                <Who id={a.loserId} />
              </div>
            </div>
            <div style={{ gridColumn: "1 / -1" }} className="stack">
              <span className="row between">
                <span className={`pill ${pill}`}>{a.done ? "Done" : label}</span>
                <LoserActions s={s} a={a} />
              </span>
              {a.text && a.status !== "declined" && (
                <p className="notice ok">
                  {a.loserId === me && <span className="cap">Your assigned punishment</span>}
                  <b>{a.text}</b>
                </p>
              )}
              {a.status === "declined" && <p className="hint">{name(a.loserId)} declined “{a.text}”. {a.chooserId === me ? "Pick another." : `${name(a.chooserId!)} picks again.`}</p>}
              {myPick ? (
                myTurn ? (
                  options.length ? (
                    <div className="favor-chips">
                      {options.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className="favor-chip"
                          disabled={(s.settings.exclusivePool && held.has(f.id)) || (a.status === "declined" && f.id === a.favorId)}
                          onClick={() => api.chooseFavor(s.id, a.loserId, f.id, `Punishment assigned to ${name(a.loserId)}.`)}
                        >
                          {f.text}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="hint">{name(a.loserId)} didn't agree to any punishment in the pool, so there's nothing to pick.</p>
                  )
                ) : (
                  <p className="hint">Waiting for {name(nextUp!.chooserId!)} to pick first.</p>
                )
              ) : (
                a.status === "picking" && <p className="hint">Waiting for {name(a.chooserId!)} to pick.</p>
              )}
            </div>
          </div>
        );
      })}
    </Panel>
  );
}

/** Mode B: the bottom X do the punishment they pledged themselves. */
function OwedPunishments({ s }: { s: Series }) {
  const { me } = useStore();
  return (
    <Panel label="Punishments owed">
      <div className="people">
        {s.assignments.map((a) => (
          <div key={a.id} className="person">
            <span style={{ minWidth: 0 }}>
              <Who id={a.loserId} />
              <div className="bright" style={{ marginTop: 6 }}>
                {a.text ?? "No punishment recorded"}
              </div>
            </span>
            {a.done ? (
              <span className="pill open">Done</span>
            ) : a.loserId === me ? (
              <LoserActions s={s} a={a} />
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
  const list = s.assignments;
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
            <Pill kind={s.status}>{s.status === "assigning" ? "Picking punishments" : "Finished"}</Pill>
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
                  {b.outcomeId && b.status !== "canceled" ? <OutcomeTag bet={b} id={b.outcomeId} /> : <span className="dim">{resultText(b)}</span>}
                </Link>
              ))}
            </div>
          </Panel>
        </div>
        <div className="col">
          {s.settings.mode === "pool" && <PoolPicks s={s} />}
          {s.settings.mode === "pledge" && <OwedPunishments s={s} />}
          {s.settings.mode === "money" && <MoneyOutcome s={s} />}
        </div>
      </div>
    </>
  );
}
