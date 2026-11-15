import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SeriesCard, sortSeries } from "../components/SeriesCard.tsx";
import { JoinModal, Shell } from "../components/Shell.tsx";
import { Empty, Panel } from "../components/ui.tsx";
import { MovesPanel } from "../components/YourMoves.tsx";
import { fmt } from "../lib/format.ts";
import { balances, isParticipant } from "../lib/rules.ts";
import { useStore } from "../lib/store.tsx";
import type { Bet, Series } from "../lib/types.ts";
import { BetCard } from "../components/BetCard.tsx";
import { useTour } from "../components/NavigationTour.tsx";
import { useCredits } from "../lib/credits.ts";

type Item = { s: Series; bet: Bet };

/** Open predictions the player can still join, newest first. */
function useOpenBets() {
  const { db, me } = useStore();
  return useMemo(() => {
    const bets: Item[] = [];
    for (const s of db.series) {
      if (s.status !== "active" || !isParticipant(s, me)) continue;
      for (const bet of s.bets) {
        if (bet.status === "open" && !bet.wagers.some((w) => w.userId === me)) bets.push({ s, bet });
      }
    }
    return bets.sort((a, b) => (b.bet.openedAt ?? b.bet.createdAt).localeCompare(a.bet.openedAt ?? a.bet.createdAt));
  }, [db, me]);
}

function ActionCards({ onJoin }: { onJoin: () => void }) {
  const { start } = useTour();
  const { data } = useCredits();
  const finished = !!data?.tutorialDoneAt;
  return (
    <div className="home-actions">
      <button type="button" onClick={start} className="panel home-action">
        <span className="home-action-icon" aria-hidden="true">?</span>
        <b>{finished ? "How it works" : "Get help"}</b>
        <span className="dim">
          {finished ? "Replay the quick navigation tour whenever you need a hand." : "Take a quick tour of Bookie and earn 200 credits. Explore at your own pace."}
        </span>
      </button>
      <Link to="/new" className="panel home-action primary">
        <span className="home-action-icon" aria-hidden="true">+</span>
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
  const openBets = useOpenBets();
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
              ? `${live.length} live series${inPlay ? ` · ${fmt(inPlay)} coins in play` : ""}. Here's everything you're betting on.`
              : "Bet on questions with friends for virtual coins. Players at the bottom of the leaderboard owe a punishment."}
          </p>
        </div>
      </section>

      <ActionCards onJoin={join} />

      <div className="grid2 home-main">
        <div className="col">
          <Panel label="Bet now" right={`${openBets.length} open`} bodyClass="pbody home-bets">
            {openBets.length ? <>
              <div className="home-bet-list">
                {openBets.slice(0, 3).map(({ s, bet }) => <BetCard key={bet.id} s={s} bet={bet} showSeries />)}
              </div>
              {openBets.length > 3 && <p className="hint home-bets-footer">Showing 3 of {openBets.length} open bets. <Link to="/series" className="red-t">Browse your series →</Link></p>}
            </> : <Empty title="All caught up">New predictions will appear here when a host opens betting.</Empty>}
          </Panel>
        </div>
        <div className="col">
          <MovesPanel />
        </div>
      </div>

      {list.length > 0 && (
        <section className="home-series">
          <div className="row between">
            <h2>Your series</h2>
            <Link to="/series" className="red-t">See all {list.length} →</Link>
          </div>
          <div className="card-grid">
            {list.map((s) => (
              <SeriesCard key={s.id} s={s} />
            ))}
          </div>
        </section>
      )}

      {joining && <JoinModal onClose={() => setJoining(false)} />}
    </Shell>
  );
}
