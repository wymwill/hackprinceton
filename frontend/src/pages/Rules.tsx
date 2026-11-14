import { Panel, Who } from "../components/ui.tsx";
import { MODE_LABEL, STATUS_LABEL, fmt } from "../lib/format.ts";
import { useStore } from "../lib/store.tsx";
import type { Series } from "@rules/types.ts";

export function RulesList({ s }: { s: Series }) {
  const { name } = useStore();
  const st = s.settings;
  return (
    <div>
      <div className="kv">
        Host <b className="text">{name(s.hostId)}{st.hostPlays ? " (playing)" : " (not playing)"}</b>
      </div>
      <div className="kv">
        Mode <b className="text">{MODE_LABEL[st.mode]}</b>
      </div>
      {st.mode === "money" && (
        <div className="kv">
          Minimum contribution <b>${fmt(st.minContribution)}</b>
        </div>
      )}
      {st.mode === "pool" && (
        <div className="kv">
          Favor pool <b className="text">{st.favorsPerPlayer} per player max · {st.exclusivePool ? "each picked once" : "reusable"}</b>
        </div>
      )}
      <div className="kv">
        Bets <b>{st.betCount}</b>
      </div>
      <div className="kv">
        Starting coins <b>{fmt(st.startingCoins)}</b>
      </div>
      <div className="kv">
        Losers <b className="text">Bottom {st.losers}</b>
      </div>
      <div className="kv">
        Ties <b className="text">{st.tiebreak === "first" ? "First to reach the score" : "Random order drawn at start"}</b>
      </div>
      <div className="kv">
        New bets <b className="text">{st.betCreation === "upfront" ? "All written before start" : "Host can add during series"}</b>
      </div>
      <div className="kv">
        Withdrawals <b className="text">{st.withdrawMinutes ? `First ${st.withdrawMinutes} min after a bet opens` : "Not allowed"}</b>
      </div>
      <div className="rule" />
      <ul className="hint" style={{ paddingLeft: 18, display: "grid", gap: 4 }}>
        <li>Pick YES or NO and wager coins. You can add more coins to your side any time betting is open.</li>
        <li>Winners split the whole pool in proportion to their stakes.</li>
        <li>If everyone is on one side, or the host cancels, everyone gets their coins back.</li>
        <li>The host decides each result, even when they're playing.</li>
        <li>The leaderboard only moves when a bet is resolved.</li>
        {st.mode === "pledge" && <li>The bottom {st.losers} do the favor they pledged.</li>}
        {st.mode === "pool" && <li>1st picks a favor for last place, 2nd for second-to-last, and so on.</li>}
        {st.mode === "money" && <li>The bottom {st.losers} owe the real-money contribution (not processed in this demo).</li>}
      </ul>
    </div>
  );
}

export default function Rules({ s }: { s: Series }) {
  return (
    <>
      <section className="hero">
        <div>
          <span className="pill finished">{STATUS_LABEL[s.status]}</span>
          <h1 style={{ marginTop: 14 }}>Rules &amp; players</h1>
          <p>{s.status === "lobby" ? "These lock when the host starts betting." : "Locked since betting started."}</p>
        </div>
      </section>
      <div className="two-col">
        <Panel label="Rules">
          <RulesList s={s} />
        </Panel>
        <Panel label="Players" right={`${s.members.length}`}>
          <div className="people">
            {s.members.map((m) => (
              <div key={m.userId} className="person">
                <Who id={m.userId} />
                <span className="cap">{m.userId === s.hostId ? "Host" : m.status === "invited" ? "Invited" : "Player"}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
