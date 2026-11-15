import { useState } from "react";
import { BetCard } from "./BetCard.tsx";
import { isParticipant } from "../lib/rules.ts";
import { useStore } from "../lib/store.tsx";
import type { Bet, Series } from "../lib/types.ts";
import { Empty, Panel } from "./ui.tsx";

type Tab = "bet" | "play" | "done";
const TABS: [Tab, string][] = [["bet", "Bet now"], ["play", "In play"], ["done", "Settled"]];

/** The bet cards for one series, grouped by what the viewer can do with them. */
export function SeriesBets({ s }: { s: Series }) {
  const { me } = useStore();
  const [picked, setPicked] = useState<Tab | null>(null);
  const playing = isParticipant(s, me);
  const groups: Record<Tab, Bet[]> = { bet: [], play: [], done: [] };
  for (const bet of s.bets) {
    const mine = bet.wagers.some((w) => w.userId === me);
    if (bet.status === "resolved" || bet.status === "canceled") groups.done.push(bet);
    else if (bet.status === "open" && s.status === "active" && playing && !mine) groups.bet.push(bet);
    else if (bet.status === "open" || bet.status === "closed") groups.play.push(bet);
  }
  const when = (bet: Bet) => bet.settledAt ?? bet.openedAt ?? bet.createdAt;
  groups.bet.sort((a, b) => when(b).localeCompare(when(a)));
  groups.play.sort((a, b) => when(b).localeCompare(when(a)));
  groups.done.sort((a, b) => when(b).localeCompare(when(a)));
  const tab = picked ?? TABS.find(([key]) => groups[key].length)?.[0] ?? "bet";
  return (
    <Panel label="Your bets" right={`${s.bets.length} in this series`}>
      <div className="stack" style={{ gap: 16 }}>
        <div className="tabs" role="tablist" aria-label="Bets in this series">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "on" : ""} onClick={() => setPicked(key)}>
              {label}<b>{groups[key].length}</b>
            </button>
          ))}
        </div>
        {groups[tab].length ? (
          <div className="bgrid">{groups[tab].map((bet) => <BetCard key={bet.id} s={s} bet={bet} />)}</div>
        ) : (
          <Empty title={tab === "bet" ? "Nothing to bet on" : tab === "play" ? "Nothing in play" : "Nothing settled yet"}>
            {tab === "bet" ? "Open bets you can join will appear here." : tab === "play" ? "Bets waiting for a result will appear here." : "Results will appear here once bets settle."}
          </Empty>
        )}
      </div>
    </Panel>
  );
}
