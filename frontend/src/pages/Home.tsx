import { useState } from "react";
import { Link } from "react-router-dom";
import { JoinModal, Shell } from "../components/Shell.tsx";
import { Empty, Panel, Pill } from "../components/ui.tsx";
import { balances, isParticipant, participantIds, standings } from "../lib/rules.ts";
import { MODE_LABEL, STATUS_LABEL, fmt, ordinal } from "../lib/format.ts";
import { useStore } from "../lib/store.tsx";
import type { Series } from "../lib/types.ts";

function SeriesCard({ s }: { s: Series }) {
  const { me, name } = useStore();
  const players = participantIds(s).length;
  const done = s.bets.filter((b) => b.status === "resolved" || b.status === "canceled").length;
  const playing = isParticipant(s, me) && s.status !== "lobby";
  const mine = playing ? standings(s).find((r) => r.userId === me) : undefined;
  const coins = playing ? balances(s).get(me)!.settled : undefined;
  return (
    <Link to={`/s/${s.id}`} className="panel scard">
      <div className="row between">
        <Pill kind={s.status}>{STATUS_LABEL[s.status]}</Pill>
        {s.hostId === me && <Pill kind="host">Host</Pill>}
      </div>
      <h3>{s.name}</h3>
      <p className="desc">{s.description || `Hosted by ${name(s.hostId)}.`}</p>
      <span className="cap">{MODE_LABEL[s.settings.mode]} · bottom {s.settings.losers} lose</span>
      <div className="stats">
        <div className="stat">
          <span className="cap">Players</span>
          <b>{players}</b>
        </div>
        <div className="stat">
          <span className="cap">Bets</span>
          <b>
            {done}/{s.settings.betCount}
          </b>
        </div>
        <div className="stat">
          <span className="cap">{mine ? "You" : "Start"}</span>
          <b>{mine ? `${ordinal(mine.rank)} · ${fmt(coins!)}` : fmt(s.settings.startingCoins)}</b>
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  const { db } = useStore();
  const [joining, setJoining] = useState(false);
  const list = [...db.series];
  const order: Series["status"][] = ["active", "assigning", "lobby", "finished"];
  list.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.createdAt.localeCompare(a.createdAt));

  return (
    <Shell>
      <section className="hero">
        <div>
          <h1>
            Your <em>Bet Series</em>
          </h1>
          <p>
            YES/NO bets with friends, played for virtual coins across a whole series. Whoever ends with the fewest coins
            owes a punishment.
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => setJoining(true)}>
            Join with a code
          </button>
          <Link to="/new" className="btn primary">
            + New series
          </Link>
        </div>
      </section>

      {list.length > 0 ? (
        <div className="card-grid">
          {list.map((s) => (
            <SeriesCard key={s.id} s={s} />
          ))}
        </div>
      ) : (
        <Panel>
          <Empty title="No series yet">Start one and share its invite link, or join a friend's with their code.</Empty>
        </Panel>
      )}

      {joining && <JoinModal onClose={() => setJoining(false)} />}
    </Shell>
  );
}
