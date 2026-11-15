import { useState } from "react";
import { Link } from "react-router-dom";
import { SeriesCard, sortSeries } from "../components/SeriesCard.tsx";
import { JoinModal, Shell } from "../components/Shell.tsx";
import { Empty, Panel } from "../components/ui.tsx";
import { fmt } from "../lib/format.ts";
import { balances } from "../lib/rules.ts";
import { useStore } from "../lib/store.tsx";
import { useFirstBetSteps } from "./Tutorial.tsx";

function ActionCards({ onJoin }: { onJoin: () => void }) {
  const steps = useFirstBetSteps(onJoin);
  const done = steps.filter((s) => s.done).length;
  const finished = done === steps.length;
  return (
    <div className="home-actions">
      <Link to="/tutorial" className="panel home-action">
        <span className="home-action-icon" aria-hidden="true">?</span>
        <b>{finished ? "How it works" : "Get help"}</b>
        <span className="dim">
          {finished ? "Every feature explained, plus a practice bet." : `New here? The tutorial walks you through your first bet. ${done} of ${steps.length} steps done.`}
        </span>
        {!finished && (
          <span className="tut-progress" aria-hidden="true">
            <i style={{ width: `${(done / steps.length) * 100}%` }} />
          </span>
        )}
      </Link>
      <Link to="/new" className="panel home-action primary">
        <span className="home-action-icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" focusable="false">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </span>
        <b>Start a quick game</b>
        <span className="dim">Pick a game, edit a few predictions, and invite friends in under a minute.</span>
      </Link>
      <button type="button" className="panel home-action" onClick={onJoin}>
        <span className="home-action-icon" aria-hidden="true">#</span>
        <b>Join with a code</b>
        <span className="dim">Got an invite code or link from a friend? Jump into their series.</span>
      </button>
    </div>
  );
}

export default function Home() {
  const { db, me, meUser } = useStore();
  const [joining, setJoining] = useState(false);
  const join = () => setJoining(true);
  const list = sortSeries(db.series);
  const live = list.filter((s) => s.status === "active");
  const inPlay = live.reduce((n, s) => n + (balances(s).get(me)?.atStake ?? 0), 0);
  const first = meUser.name.split(" ")[0];

  return (
    <Shell>
      <section className="hero">
        <div>
          <h1>
            Hi, <em>{first}</em>
          </h1>
          <p>
            {live.length
              ? `${live.length} live series${inPlay ? ` · ${fmt(inPlay)} coins in play` : ""}. Pick a series to see its bets.`
              : "Bet on questions with friends for virtual coins. Players at the bottom of the leaderboard owe a punishment."}
          </p>
        </div>
      </section>

      <ActionCards onJoin={join} />

      <section className="home-series">
          <div className="row between">
            <h2>Your series</h2>
            <Link to="/series" className="red-t">See all {list.length} →</Link>
          </div>
          {list.length ? <div className="card-grid">
            {list.map((s) => (
              <SeriesCard key={s.id} s={s} />
            ))}
          </div> : <Panel><Empty title="No series yet">Start a quick game or join one with a code.</Empty></Panel>}
        </section>

      {joining && <JoinModal onClose={() => setJoining(false)} />}
    </Shell>
  );
}
