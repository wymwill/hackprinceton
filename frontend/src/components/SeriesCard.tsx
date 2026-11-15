import { Link } from "react-router-dom";
import { balances, isParticipant, participantIds, standings } from "../lib/rules.ts";
import { MODE_LABEL, STATUS_LABEL, fmt, ordinal } from "../lib/format.ts";
import { useStore } from "../lib/store.tsx";
import type { Series } from "../lib/types.ts";
import { Pill } from "./ui.tsx";

/** Live series first, then picking, lobbies, finished; newest first within each. */
export function sortSeries(list: Series[]) {
  const order: Series["status"][] = ["active", "assigning", "lobby", "finished"];
  return [...list].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.createdAt.localeCompare(a.createdAt));
}

export function SeriesCard({ s }: { s: Series }) {
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
