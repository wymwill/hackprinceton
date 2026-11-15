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
import { BetCard } from "./Dashboard.tsx";
import { useFirstBetSteps } from "./Tutorial.tsx";

type Tab = "bet" | "play" | "done";
type Item = { s: Series; bet: Bet };

/** Every bet across your series, sorted into what you can bet on, what you have riding, and what just settled. */
function useMyBets() {
  const { db, me } = useStore();
  return useMemo(() => {
    const out: Record<Tab, Item[]> = { bet: [], play: [], done: [] };
    for (const s of db.series) {
      if (s.status === "lobby") continue;
      const playing = isParticipant(s, me);
      for (const bet of s.bets) {
        const mine = bet.wagers.some((w) => w.userId === me);
        if (bet.status === "open" && playing && !mine && s.status === "active") out.bet.push({ s, bet });
        else if ((bet.status === "open" || bet.status === "closed") && (mine || s.hostId === me)) out.play.push({ s, bet });
        else if (bet.status === "resolved" || bet.status === "canceled") out.done.push({ s, bet });
      }
    }
    const when = (i: Item) => i.bet.settledAt ?? i.bet.openedAt ?? i.bet.createdAt;
    out.bet.sort((a, b) => when(b).localeCompare(when(a)));
    out.play.sort((a, b) => (a.bet.status === b.bet.status ? when(b).localeCompare(when(a)) : a.bet.status === "closed" ? -1 : 1));
    out.done.sort((a, b) => when(b).localeCompare(when(a)));
    out.done = out.done.slice(0, 12);
    return out;
  }, [db, me]);
}

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

const TABS: [Tab, string][] = [
  ["bet", "Bet now"],
  ["play", "In play"],
  ["done", "Settled"],
];

function YourBets({ onJoin }: { onJoin: () => void }) {
  const groups = useMyBets();
  const [picked, setPicked] = useState<Tab | null>(null);
  // Until someone picks a tab, show the first one that has something in it.
  const tab = picked ?? TABS.find(([k]) => groups[k].length)?.[0] ?? "bet";
  const shown = groups[tab];
  const empty: Record<Tab, string> = {
    bet: "No open bets waiting for you. When a host opens one, it shows up here.",
    play: "You don't have coins riding on anything right now.",
    done: "No results yet. Settled bets show up here with what you won or lost.",
  };
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="tabs" role="tablist" aria-label="Your bets">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setPicked(k)}>
            {label}
            <b>{groups[k].length}</b>
          </button>
        ))}
      </div>
      {shown.length ? (
        <div className="bgrid">
          {shown.map(({ s, bet }) => (
            <BetCard key={bet.id} s={s} bet={bet} showSeries />
          ))}
        </div>
      ) : (
        <Panel>
          <Empty title={tab === "bet" ? "Nothing to bet on" : tab === "play" ? "Nothing in play" : "Nothing settled yet"}>
            {empty[tab]}{" "}
            {groups.bet.length + groups.play.length + groups.done.length === 0 && (
              <span className="row" style={{ justifyContent: "center", marginTop: 12 }}>
                <Link to="/new" className="btn sm primary">Start a bet</Link>
                <button type="button" className="btn sm" onClick={onJoin}>Join with a code</button>
              </span>
            )}
          </Empty>
        </Panel>
      )}
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
              ? `${live.length} live series${inPlay ? ` · ${fmt(inPlay)} coins in play` : ""}. Here's everything you're betting on.`
              : "Bet on YES/NO questions with friends for virtual coins. Whoever ends a series with the fewest coins owes a punishment."}
          </p>
        </div>
      </section>

      <ActionCards onJoin={join} />

      <div className="grid2 home-main">
        <div className="col">
          <Panel label="Your bets" right={`${live.length} live series`} bodyClass="pbody home-bets">
            <YourBets onJoin={join} />
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
            {list.slice(0, 3).map((s) => (
              <SeriesCard key={s.id} s={s} />
            ))}
          </div>
        </section>
      )}

      {joining && <JoinModal onClose={() => setJoining(false)} />}
    </Shell>
  );
}
