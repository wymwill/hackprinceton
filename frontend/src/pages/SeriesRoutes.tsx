import { Link, useParams } from "react-router-dom";
import { Shell } from "../components/Shell.tsx";
import { StandingsTable } from "../components/Standings.tsx";
import { Empty, Panel } from "../components/ui.tsx";
import { useStore } from "../lib/store.tsx";
import type { Series } from "@rules/types.ts";
import BetPage from "./BetPage.tsx";
import Dashboard from "./Dashboard.tsx";
import Lobby from "./Lobby.tsx";
import Results from "./Results.tsx";
import Rules from "./Rules.tsx";

function useSeries() {
  const { db } = useStore();
  const { id } = useParams();
  return db.series.find((s) => s.id === id);
}

function Missing() {
  return (
    <Shell>
      <Panel>
        <Empty title="Series not found">
          It may have been reset. <Link to="/" className="red-t">Back to your series</Link>
        </Empty>
      </Panel>
    </Shell>
  );
}

const crumb = (s: Series) => ({ label: s.name, to: `/s/${s.id}` });

/** /s/:id shows whichever screen fits where the series is: lobby, dashboard or results. */
export function SeriesHome() {
  const s = useSeries();
  if (!s) return <Missing />;
  return (
    <Shell crumbs={[{ label: s.name }]}>
      {s.status === "lobby" ? <Lobby s={s} /> : s.status === "active" ? <Dashboard s={s} /> : <Results s={s} />}
    </Shell>
  );
}

export function SeriesBet() {
  const s = useSeries();
  const { betId } = useParams();
  const bet = s?.bets.find((b) => b.id === betId);
  if (!s) return <Missing />;
  return (
    <Shell crumbs={[crumb(s), { label: bet ? "Bet" : "Not found" }]}>
      {bet && bet.status !== "draft" ? (
        <BetPage key={bet.id} s={s} bet={bet} />
      ) : (
        <Panel>
          <Empty title={bet ? "Not open yet" : "Bet not found"}>
            {bet ? "This bet opens when the host starts the series." : null}
          </Empty>
        </Panel>
      )}
    </Shell>
  );
}

export function SeriesLeaderboard() {
  const s = useSeries();
  if (!s) return <Missing />;
  return (
    <Shell crumbs={[crumb(s), { label: "Leaderboard" }]}>
      <section className="hero">
        <div>
          <h1>Leaderboard</h1>
          <p>
            Ranked by coins after each resolved bet; open wagers don't count until they settle. Ties go to{" "}
            {s.settings.tiebreak === "first" ? "whoever reached the score first" : "an order drawn at random at the start"}.
            Below the dashed line is the bottom {s.settings.losers}.
          </p>
        </div>
      </section>
      <Panel label="Standings">
        <StandingsTable s={s} />
      </Panel>
    </Shell>
  );
}

export function SeriesRules() {
  const s = useSeries();
  if (!s) return <Missing />;
  return (
    <Shell crumbs={[crumb(s), { label: "Rules" }]}>
      <Rules s={s} />
    </Shell>
  );
}
