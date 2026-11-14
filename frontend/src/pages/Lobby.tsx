import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { NewBetModal } from "../components/Standings.tsx";
import { ConfirmButton, Panel, Pill, Who } from "../components/ui.tsx";
import { agreesTo, isParticipant, participantIds } from "../lib/rules.ts";
import { ago } from "../lib/format.ts";
import { useStore } from "../lib/store.tsx";
import type { Favor, Series } from "../lib/types.ts";
import { RulesList } from "./Rules.tsx";

/** Shared pool: who has agreed to this favor, and a toggle for everyone but its author. */
function Agreement({ s, f }: { s: Series; f: Favor }) {
  const { me, api } = useStore();
  const players = participantIds(s);
  const count = players.filter((p) => agreesTo(f, p)).length;
  const mine = f.agreedBy.includes(me);
  const canToggle = isParticipant(s, me) && f.authorId !== me;
  return (
    <span className="row" style={{ gap: 8 }}>
      <span className={`cap ${count === players.length ? "up" : ""}`} title="Players who agreed, counting the author">
        {count}/{players.length} agree
      </span>
      {canToggle && (
        <button
          type="button"
          className={`btn sm ${mine ? "" : "primary"}`}
          onClick={() => api.agreeToFavor(f.id, !mine, mine ? "Agreement taken back. You're not ready." : "You agreed to this favor.")}
        >
          {mine ? "✓ Agreed" : "Agree"}
        </button>
      )}
    </span>
  );
}

function Favors({ s }: { s: Series }) {
  const { me, api } = useStore();
  const [text, setText] = useState("");
  const pledge = s.settings.mode === "pledge";
  const playing = isParticipant(s, me);
  const mine = s.favors.filter((f) => f.authorId === me);
  const canAdd = playing && (pledge || mine.length < s.settings.favorsPerPlayer);
  return (
    <Panel label={pledge ? "Pledged favors" : "Favor pool"} right={`${s.favors.length} in`}>
      <div className="stack">
        <p className="hint">
          {pledge
            ? `Pledge the favor you'll do if you finish in the bottom ${s.settings.losers}. Everyone can see every pledge before agreeing.`
            : `Add up to ${s.settings.favorsPerPlayer} favor${s.settings.favorsPerPlayer === 1 ? "" : "s"} (at least 1). The top ${s.settings.losers} pick from this pool for the bottom ${s.settings.losers}, but only favors that player agreed to. Changing the pool resets everyone's "ready".`}
        </p>
        {canAdd && (
          <form
            className="row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await api.submitFavor(s.id, text, pledge ? "Favor pledged." : "Added to the pool.")) setText("");
            }}
          >
            <input className="input text" value={text} onChange={(e) => setText(e.target.value)} maxLength={120} placeholder="Placeholder placeholder" />
            <button className="btn primary" disabled={text.trim().length < 3}>
              {pledge && mine.length ? "Replace" : pledge ? "Pledge" : "Add"}
            </button>
          </form>
        )}
        <div className="people">
          {s.favors.length === 0 && <span className="hint">No favors yet.</span>}
          {s.favors.map((f) => (
            <div key={f.id} className="person">
              <span style={{ minWidth: 0 }}>
                <span className="bright">{f.text}</span>
                <span className="dim"> · {f.authorId === me ? "you" : pledge ? "pledged" : "added"}</span>
              </span>
              <span className="row" style={{ gap: 8 }}>
                {!pledge && <Agreement s={s} f={f} />}
                {f.authorId === me && (
                  <button type="button" className="btn ghost sm" onClick={() => api.removeFavor(s.id, f.id)}>
                    Remove
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function Invite({ s }: { s: Series }) {
  const { toast } = useStore();
  const link = `${window.location.origin}/join/${s.code}`;
  const copy = (value: string, what: string) =>
    navigator.clipboard?.writeText(value).then(
      () => toast(`${what} copied.`),
      () => toast(`Couldn't copy. It's ${value}`, "err")
    );
  return (
    <div style={{ minWidth: 240 }}>
      <span className="cap">Invite code</span>
      <div className="invite" style={{ marginTop: 6 }}>
        <span>{s.code}</span>
        <button type="button" className="btn sm ghost" onClick={() => copy(s.code, "Code")}>
          Copy
        </button>
      </div>
      <button type="button" className="btn sm block" style={{ marginTop: 8 }} onClick={() => copy(link, "Invite link")}>
        Copy invite link
      </button>
    </div>
  );
}

export default function Lobby({ s }: { s: Series }) {
  const { me, api } = useStore();
  const nav = useNavigate();
  const [writing, setWriting] = useState(false);
  const isHost = s.hostId === me;
  const member = s.members.find((m) => m.userId === me);
  const playing = isParticipant(s, me);
  const pool = s.settings.mode === "pool";
  const unagreed = pool ? s.favors.filter((f) => !agreesTo(f, me)).length : 0;

  return (
    <>
      <section className="hero">
        <div>
          <span className="row">
            <Pill kind="lobby">Lobby</Pill>
            {isHost && <Pill kind="host">You host</Pill>}
          </span>
          <h1 style={{ marginTop: 14 }}>{s.name}</h1>
          <p>{s.description || "Players join, read the rules and submit favors. Rules lock when betting starts."}</p>
        </div>
        <Invite s={s} />
      </section>

      <div className="grid2">
        <div className="col">
          <Panel label="Rules" right="Locked at start">
            <RulesList s={s} />
            {playing && member && (
              <>
                <div className="rule" />
                <label className="check">
                  <input
                    type="checkbox"
                    checked={member.ready}
                    onChange={(e) => api.setReady(s.id, e.target.checked, e.target.checked ? "You're ready." : undefined)}
                  />
                  <span>
                    I've read the rules
                    {s.settings.mode === "money"
                      ? ""
                      : pool
                        ? ` and agree to every favor in the pool${unagreed ? ` (this agrees to the ${unagreed} you haven't yet)` : ""}. I'll do the one picked for me if I finish in the bottom ${s.settings.losers}`
                        : ` and will do my pledge if I finish in the bottom ${s.settings.losers}`}
                    . I'm ready.
                  </span>
                </label>
              </>
            )}
          </Panel>

          {s.settings.mode !== "money" && <Favors s={s} />}

          <Panel label="Bets" right={`${s.bets.length}/${s.settings.betCount} written`}>
            <div className="stack">
              <p className="hint">
                {s.settings.betCreation === "upfront"
                  ? "Every bet is written before the series starts."
                  : "The host can write some now and add the rest during the series."}
              </p>
              <div className="people">
                {s.bets.length === 0 && <span className="hint">No bets written yet.</span>}
                {s.bets.map((b, i) => (
                  <div key={b.id} className="person">
                    <span>
                      <span className="num dim">{String(i + 1).padStart(2, "0")} </span>
                      <span className="bright">{b.question}</span>
                    </span>
                    {isHost && (
                      <button type="button" className="btn ghost sm" onClick={() => api.removeDraftBet(s.id, b.id)}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {isHost && s.bets.length < s.settings.betCount && (
                <button type="button" className="btn" onClick={() => setWriting(true)}>
                  + Write a bet
                </button>
              )}
            </div>
          </Panel>
        </div>

        <div className="col">
          <Panel label="Players" right={`${participantIds(s).length} playing`}>
            <div className="people">
              {s.members.map((m) => {
                const host = m.userId === s.hostId;
                const favors = s.favors.filter((f) => f.authorId === m.userId).length;
                return (
                  <div key={m.userId} className="person">
                    <Who id={m.userId} />
                    <span className="row">
                      {host && <span className="pill host">Host</span>}
                      {m.plays ? (
                        <span className={`pill ${m.ready ? "open" : "canceled"}`}>{m.ready ? "Ready" : "Not ready"}</span>
                      ) : (
                        <span className="cap">Not playing</span>
                      )}
                      {pool && m.plays && <span className="cap">{favors} favor{favors === 1 ? "" : "s"}</span>}
                      {isHost && !host && (
                        <ConfirmButton className="btn ghost sm danger" label="Kick" confirm="Sure?" onConfirm={() => api.kick(s.id, m.userId, "Player removed.")} />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            {member && !isHost && (
              <>
                <div className="rule" />
                <ConfirmButton
                  className="btn ghost sm"
                  label="Leave series"
                  confirm="Leave?"
                  onConfirm={async () => {
                    if (await api.leaveSeries(s.id, "You left the series.")) nav("/");
                  }}
                />
              </>
            )}
          </Panel>

          {isHost && (
            <Panel label="Start">
              <div className="stack">
                {s.blockers.length ? (
                  <div className="stack" style={{ gap: 8 }}>
                    {s.blockers.map((b) => (
                      <p key={b} className="notice">
                        {b}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="notice ok">
                    <b>Everyone's ready.</b> Starting gives each player {s.settings.startingCoins.toLocaleString()} coins and
                    locks the rules.
                  </p>
                )}
                <ConfirmButton
                  className="btn block"
                  label="Start betting"
                  confirm="Lock rules and start?"
                  disabled={s.blockers.length > 0}
                  onConfirm={() => api.start(s.id, "Betting is live.")}
                />
              </div>
            </Panel>
          )}

          <Panel label="Activity">
            <div className="tape">
              {s.activity.slice(0, 8).map((a, i) => (
                <div key={i} className="tape-row">
                  <span>{a.text}</span>
                  <span className="when">{ago(a.at)}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {writing && <NewBetModal s={s} onClose={() => setWriting(false)} />}
    </>
  );
}
