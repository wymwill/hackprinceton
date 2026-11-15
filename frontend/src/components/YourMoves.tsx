import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../lib/store.tsx";
import { todos } from "../lib/todos.ts";
import { useTour } from "./NavigationTour.tsx";
import { Panel } from "./ui.tsx";

/** "Your moves": everything you can do right now across your series, then what you're waiting on. */
export function MovesPanel() {
  const { start } = useTour();
  const { db, me, name } = useStore();
  const list = useMemo(() => todos(db.series, me, name), [db, me, name]);
  const now = list.filter((t) => t.kind === "now").length;
  return (
    <Panel label="Your moves" right={now ? `${now} to do` : "All caught up"}>
      {list.length === 0 ? (
        <p className="hint">
          Nothing waiting on you. Start a bet or join one to get going. New here?{" "}
          <button type="button" onClick={start} className="tour-text-link">Take the tutorial</button>.
        </p>
      ) : (
        <div className="people">
          {list.map((t) => (
            <Link key={t.key} to={t.to} className={`person move ${t.kind}`}>
              <span style={{ minWidth: 0 }}>
                <b className={t.kind === "now" ? "bright" : "dim"}>{t.text}</b>
                {t.detail && <span className="dim move-detail">{t.detail}</span>}
              </span>
              <span className="row" style={{ gap: 8, flexShrink: 0 }}>
                <span className="cap truncate move-series">{t.seriesName}</span>
                {t.kind === "waiting" ? <span className="pill draft">Waiting</span> : <span className="move-go" aria-hidden="true">→</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}
