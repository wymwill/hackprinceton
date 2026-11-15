import { useState } from "react";
import { Link } from "react-router-dom";
import { SeriesCard, sortSeries } from "../components/SeriesCard.tsx";
import { JoinModal, Shell } from "../components/Shell.tsx";
import { Empty, Panel } from "../components/ui.tsx";
import { useStore } from "../lib/store.tsx";

/** /series: every series you're in. */
export default function AllSeries() {
  const { db } = useStore();
  const [joining, setJoining] = useState(false);
  const list = sortSeries(db.series);
  return (
    <Shell crumbs={[{ label: "All series" }]}>
      <section className="hero">
        <div>
          <h1>
            All <em>series</em>
          </h1>
          <p>Every series you host or play in. Open one for its bets, leaderboard and rules.</p>
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
          <Empty title="No series yet">
            Start one and share its invite link, or join a friend's with their code.{" "}
            <Link to="/tutorial" className="red-t">New here? Take the tutorial.</Link>
          </Empty>
        </Panel>
      )}
      {joining && <JoinModal onClose={() => setJoining(false)} />}
    </Shell>
  );
}
