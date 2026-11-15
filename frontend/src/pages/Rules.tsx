import { Panel, Who } from "../components/ui.tsx";
import { MODE_LABEL, STATUS_LABEL, fmt } from "../lib/format.ts";
import { useStore } from "../lib/store.tsx";
import type { Series } from "../lib/types.ts";

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
          Punishment pool <b className="text">{st.favorsPerPlayer} per player max · {st.exclusivePool ? "each picked once" : "reusable"}</b>
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
        Ties <b className="text">{st.tiebreak === "first" ? "First to reach that score" : "Random order drawn at start"}</b>
      </div>
      <div className="kv">
        New bets <b className="text">{st.betCreation === "upfront" ? "Set before starting" : "Host can add bets"}</b>
      </div>
      <div className="kv">
        Withdrawals <b className="text">{st.withdrawMinutes ? `First ${st.withdrawMinutes} min after a bet opens` : "Not allowed"}</b>
      </div>
      <div className="rule" />
      <ul className="rules-summary">
        <li>Pick an outcome and bet coins. Add more while betting is open; you can't switch picks.</li>
        <li>Winners share the pool based on how much they bet.</li>
        <li>Everyone gets their coins back if the bet is canceled, all bets are on one outcome, or nobody backed the winner.</li>
        <li>The host confirms results, even when playing. Rankings update after each result.</li>
        {s.bets.some((b) => b.kind === "range") && <li>For ranges, the lower number counts; the upper number doesn't. The measured result decides the winner.</li>}
        {st.mode === "pledge" && <li>The bottom {st.losers} do their pledged punishment.</li>}
        {st.mode === "pool" && <>
          <li>Agree to the pool before starting. “I'm ready” agrees to all punishments.</li>
          <li>1st picks for last place, 2nd for second-to-last. Only agreed punishments can be picked; picks are owed immediately.</li>
        </>}
        {st.mode === "money" && <li>The bottom {st.losers} owe the contribution. Payments happen outside the app.</li>}
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
                <span className="cap">{m.userId === s.hostId ? (m.plays ? "Host · playing" : "Host · not playing") : "Player"}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
