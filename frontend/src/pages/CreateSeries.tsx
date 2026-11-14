import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell.tsx";
import { Panel } from "../components/ui.tsx";
import { DEFAULT_SETTINGS } from "@rules/engine.ts";
import { MODE_LABEL, fmt } from "../lib/format.ts";
import { useStore } from "../lib/store.tsx";
import type { Id, Mode, Settings } from "@rules/types.ts";

const MODES: { mode: Mode; letter: string; blurb: string }[] = [
  { mode: "money", letter: "A", blurb: "Players chip in real money instead of favors. Shown for the demo; no money moves." },
  { mode: "pledge", letter: "B", blurb: "Each player pledges their own favor up front. The bottom players do their own." },
  { mode: "pool", letter: "C", blurb: "Everyone adds favors to a shared pool. The top players pick favors for the bottom." },
];

function Seg<T extends string | number | boolean>({
  value, options, onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function CreateSeries() {
  const { db, me, api } = useStore();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [invite, setInvite] = useState<Id[]>([]);
  const [st, setSt] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSt((s) => ({ ...s, [k]: v }));

  const friends = db.users.filter((u) => u.id !== me);
  const expected = invite.length + (st.hostPlays ? 1 : 0);
  const needed = st.mode === "pool" ? 2 * st.losers : st.losers + 1;

  const submit = async () => {
    const s = await api.createSeries({ name, description, settings: st, invite }, "Series created. Share the code to fill the lobby.");
    if (s) nav(`/s/${s.id}`);
  };

  return (
    <Shell crumbs={[{ label: "New series" }]}>
      <section className="hero">
        <div>
          <h1>
            New <em>series</em>
          </h1>
          <p>Set the rules once. They lock when betting starts, so everyone plays the same game.</p>
        </div>
      </section>

      <div className="grid2">
        <div className="col">
          <Panel label="01 · Basics">
            <div className="stack">
              <label className="field">
                <span>Series name</span>
                <input className="input text" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Placeholder placeholder" />
              </label>
              <label className="field">
                <span>Description</span>
                <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} placeholder="Placeholder placeholder" />
              </label>
              <div className="two-col">
                <label className="field">
                  <span>Number of bets</span>
                  <input className="input" type="number" min={1} max={50} value={st.betCount} onChange={(e) => set("betCount", Number(e.target.value))} />
                </label>
                <label className="field">
                  <span>Losing players (bottom X)</span>
                  <input className="input" type="number" min={1} max={20} value={st.losers} onChange={(e) => set("losers", Number(e.target.value))} />
                </label>
              </div>
              <label className="field">
                <span>Starting coins per player</span>
                <input className="input" type="number" min={100} max={100000} step={100} value={st.startingCoins} onChange={(e) => set("startingCoins", Number(e.target.value))} />
              </label>
              <div className="field">
                <span>Invite friends</span>
                <div className="row wrap">
                  {friends.map((u) => {
                    const on = invite.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        className={`btn sm ${on ? "primary" : ""}`}
                        onClick={() => setInvite((xs) => (on ? xs.filter((x) => x !== u.id) : [...xs, u.id]))}
                      >
                        {on ? "✓ " : "+ "}
                        {u.name}
                      </button>
                    );
                  })}
                </div>
                <p className="hint">Anyone else can join with the invite code until betting starts.</p>
              </div>
              <label className="check">
                <input type="checkbox" checked={st.hostPlays} onChange={(e) => set("hostPlays", e.target.checked)} />
                <span>I'm playing too. (The host still decides every result.)</span>
              </label>
            </div>
          </Panel>

          <Panel label="02 · Mode">
            <div className="stack">
              <div className="choice-grid">
                {MODES.map((m) => (
                  <button key={m.mode} type="button" className={`choice ${st.mode === m.mode ? "on" : ""}`} onClick={() => set("mode", m.mode)}>
                    <span className="letter">{m.letter}</span>
                    <b>{MODE_LABEL[m.mode]}</b>
                    <p>{m.blurb}</p>
                  </button>
                ))}
              </div>
              {st.mode === "money" && (
                <>
                  <label className="field">
                    <span>Minimum contribution ($)</span>
                    <input className="input" type="number" min={1} value={st.minContribution} onChange={(e) => set("minContribution", Number(e.target.value))} />
                  </label>
                  <p className="notice">
                    <b>Preview only.</b> Real-money payments need legal and payment review, so this demo records the
                    amount and rankings but moves no money.
                  </p>
                </>
              )}
              {st.mode === "pledge" && (
                <p className="hint">In the lobby, every player writes the one favor they'll do if they finish in the bottom {st.losers}.</p>
              )}
              {st.mode === "pool" && (
                <div className="two-col">
                  <label className="field">
                    <span>Favors each player can add</span>
                    <input className="input" type="number" min={1} max={5} value={st.favorsPerPlayer} onChange={(e) => set("favorsPerPlayer", Number(e.target.value))} />
                  </label>
                  <div className="field">
                    <span>Favor pool</span>
                    <Seg
                      value={st.exclusivePool}
                      onChange={(v) => set("exclusivePool", v)}
                      options={[
                        { value: true, label: "Exclusive" },
                        { value: false, label: "Reusable" },
                      ]}
                    />
                  </div>
                  <p className="hint" style={{ gridColumn: "1 / -1" }}>
                    Everyone adds at least one favor. At the end, 1st picks for last place, 2nd for second-to-last, and so
                    on. {st.exclusivePool ? "Each favor can be picked once." : "The same favor can be picked more than once."}
                  </p>
                </div>
              )}
            </div>
          </Panel>

          <Panel label="03 · Advanced rules">
            <div className="stack">
              <div className="field">
                <span>Ties on the leaderboard</span>
                <Seg
                  value={st.tiebreak}
                  onChange={(v) => set("tiebreak", v)}
                  options={[
                    { value: "first", label: "First to reach" },
                    { value: "random", label: "Random" },
                  ]}
                />
                <p className="hint">
                  {st.tiebreak === "first"
                    ? "Whoever reached the tied score first ranks higher. On the same bet, the earlier wager wins."
                    : "Ties are broken by an order drawn at random when betting starts."}
                </p>
              </div>
              <div className="field">
                <span>Writing bets</span>
                <Seg
                  value={st.betCreation}
                  onChange={(v) => set("betCreation", v)}
                  options={[
                    { value: "upfront", label: "All before start" },
                    { value: "during", label: "Add during series" },
                  ]}
                />
                <p className="hint">
                  {st.betCreation === "upfront"
                    ? `All ${st.betCount} bets are written in the lobby, so players see every question before agreeing.`
                    : `You can write bets in the lobby and add the rest while the series runs, up to ${st.betCount}.`}
                </p>
              </div>
              <div className="field">
                <span>Withdrawing a wager</span>
                <Seg
                  value={st.withdrawMinutes}
                  onChange={(v) => set("withdrawMinutes", v)}
                  options={[
                    { value: 0, label: "Never" },
                    { value: 5, label: "5 min" },
                    { value: 15, label: "15 min" },
                    { value: 30, label: "30 min" },
                  ]}
                />
                <p className="hint">
                  {st.withdrawMinutes
                    ? `Players can take a wager back during the first ${st.withdrawMinutes} minutes after a bet opens. That's also the only way to switch sides.`
                    : "Wagers are final. Players can still add more coins to their side."}
                </p>
              </div>
            </div>
          </Panel>
        </div>

        <div className="col" style={{ position: "sticky", top: "calc(var(--top) + 24px)" }}>
          <Panel label="Summary">
            <div className="kv">
              Mode <b className="text">{MODE_LABEL[st.mode]}</b>
            </div>
            <div className="kv">
              Bets <b>{st.betCount}</b>
            </div>
            <div className="kv">
              Starting coins <b>{fmt(st.startingCoins || 0)}</b>
            </div>
            <div className="kv">
              Bottom who lose <b>{st.losers}</b>
            </div>
            <div className="kv">
              Players so far <b>{expected}</b>
            </div>
            <div className="rule" />
            {expected < needed ? (
              <p className="notice">
                <b>Needs {needed}+ players</b> to start
                {st.mode === "pool" ? `, so the top ${st.losers} can pick for the bottom ${st.losers}` : ""}. More can join
                with the code.
              </p>
            ) : (
              <p className="notice ok">
                <b>Enough players</b> invited to start once everyone's ready.
              </p>
            )}
            <div style={{ height: 14 }} />
            <button type="button" className="btn primary block" onClick={submit}>
              Create series
            </button>
          </Panel>
        </div>
      </div>
    </Shell>
  );
}
