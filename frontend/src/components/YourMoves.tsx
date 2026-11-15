import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../lib/store.tsx";
import { todos } from "../lib/todos.ts";
import { Panel } from "./ui.tsx";

/** How many things the signed-in player can do right now (for the sidebar badge). */
export function useMoveCount() {
  const { db, me, name } = useStore();
  return useMemo(() => todos(db.series, me, name).filter((t) => t.kind === "now").length, [db, me, name]);
}

/** "Your moves": everything you can do right now across your series, then what you're waiting on. */
export function MovesPanel() {
  const { db, me, name } = useStore();
  const list = useMemo(() => todos(db.series, me, name), [db, me, name]);
  const now = list.filter((t) => t.kind === "now").length;

  return (
    <Panel label="Your moves" right={now ? `${now} to do` : "All caught up"}>
      {list.length === 0 ? (
        <p className="hint">
          Nothing waiting on you. Start a bet or join one to get going. New here?{" "}
          <Link to="/tutorial" className="red-t">Take the tutorial</Link>.
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
