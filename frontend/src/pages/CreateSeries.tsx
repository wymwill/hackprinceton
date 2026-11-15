import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSocial } from "../lib/social.tsx";
import { Shell } from "../components/Shell.tsx";
import OutcomeEditor, { newDraft, outcomeProblem } from "../components/OutcomeEditor.tsx";
import { Panel } from "../components/ui.tsx";
import { DEFAULT_SETTINGS } from "../lib/rules.ts";
import { MODE_LABEL, fmt } from "../lib/format.ts";
import { useStore } from "../lib/store.tsx";
import { newRequestId } from "../lib/submit.ts";
import type { BetDraft, Mode, Settings } from "../lib/types.ts";

const MODES: { mode: Mode; letter: string; blurb: string }[] = [
  { mode: "money", letter: "A", blurb: "Real money. Preview only." },
  { mode: "pledge", letter: "B", blurb: "Each player pledges a punishment." },
  { mode: "pool", letter: "C", blurb: "Winners pick from a shared punishment pool." },
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

/** The series submission waiting for an answer: its id and the exact details sent (kept across a reload). */
type PendingSeries = { requestId: string; key: string };
const PENDING_SERIES = "alea:pending-series";
function loadPendingSeries(): PendingSeries | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(PENDING_SERIES) ?? "null");
    return v && typeof v.requestId === "string" && typeof v.key === "string" ? v : null;
  } catch {
    return null;
  }
}
function savePendingSeries(p: PendingSeries | null) {
  try {
    if (p) sessionStorage.setItem(PENDING_SERIES, JSON.stringify(p));
    else sessionStorage.removeItem(PENDING_SERIES);
  } catch {
    // Storage unavailable: the double-click guard still holds for this visit.
  }
}

export default function CreateSeries() {
  const { api, toast } = useStore();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [drafts, setDrafts] = useState<BetDraft[]>([newDraft()]);
  const [st, setSt] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSt((s) => ({ ...s, [k]: v }));

  const needed = st.mode === "pool" ? 2 * st.losers : st.losers + 1;
  const written = drafts.filter((d) => d.question.trim());
  const tooMany = written.length > st.betCount;
  const setDraft = (i: number, d: BetDraft) => setDrafts((ds) => ds.map((x, j) => (j === i ? d : x)));
  // Bets with a question must be valid; empty rows are skipped.
  const draftProblem = written.map((d, i) => (d.question.trim().length < 3 ? `Bet ${i + 1}: write at least 3 characters.` : outcomeProblem(d) && `Bet ${i + 1}: ${outcomeProblem(d)}`)).find(Boolean) || null;

  // /new?clan=ID: start a series with a whole clan. The basics fill in from the clan once it loads,
  // and every member joins the lobby when the series is created.
  const [params] = useSearchParams();
  const clanId = params.get("clan");
  const social = useSocial();
  const clan = clanId ? social.data?.clans.find((c) => c.id === clanId) : undefined;
  const filled = useRef(false);
  useEffect(() => {
    if (!clan || filled.current) return;
    filled.current = true;
    const n = clan.members.length;
    setName(`${clan.name} series`.slice(0, 60));
    setDescription(`Bets for ${clan.name}. All ${n} members start in the lobby.`);
    // A shared pool needs twice as many players as losers, so bigger clans can have 2 losers.
    setSt((s) => ({ ...s, losers: n >= 6 ? 2 : 1, mode: "pool", hostPlays: true }));
  }, [clan]);

  // Creating happens at most once per submission id. Submitting the same details again (a double
  // click, or a retry after no answer, even after a reload) reuses the id, so the server returns the
  // series it already made instead of making another. Different details are a different series.
  const inFlight = useRef(false);
  const [phase, setPhase] = useState<"idle" | "creating" | "unknown">("idle");
  const submit = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase("creating");
    const input = { name, description, settings: st, bets: written };
    const key = JSON.stringify(input);
    const prior = loadPendingSeries();
    const requestId = prior?.key === key ? prior.requestId : newRequestId();
    savePendingSeries({ requestId, key });
    const r = await api.createSeries(input, requestId);
    inFlight.current = false;
    if (r.kind === "unknown") {
      setPhase("unknown");
      return;
    }
    savePendingSeries(null);
    setPhase("idle");
    if (r.kind === "refused") {
      toast(r.message, "err");
      return;
    }
    const s = r.result;
    if (clan) await api.addClan(s.id, clan.id, `Series created. Everyone in ${clan.name} is in the lobby.`);
    else toast(s.replayed ? "That series was already created. Here it is." : "Series created. Share the invite link to fill the lobby.");
    nav(`/s/${s.id}`);
  };

  return (
    <Shell crumbs={[{ label: "New series" }]}>
      <div className="create">
      <section className="hero">
        <div>
          <h1>
            New <em>series</em>
          </h1>
          <p>Rules lock when betting starts.</p>
        </div>
      </section>

      {clanId && (
        <p className={`notice ${clan ? "ok" : ""}`} style={{ marginBottom: 20 }}>
          {clan ? (
            <>
              <b>With {clan.name}:</b> {clan.members.map((m) => m.name).join(", ")} will be in the lobby as soon as you
              create it. The basics are filled in for you; change anything you like, write the bets, then create.
            </>
          ) : social.data ? (
            <>
              <b>That clan wasn't found.</b> You may have left it. You can still create a series and share its invite link.
            </>
          ) : (
            "Loading your clan…"
          )}
        </p>
      )}

      <div className="grid2">
        <div className="col">
          <Panel label="01 · Basics">
            <div className="stack">
              <label className="field">
                <span>Series name</span>
                <input className="input text" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Gym month" />
              </label>
              <label className="field">
                <span>Description</span>
                <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} placeholder="Optional" />
              </label>
              <div className="two-col">
                <label className="field">
                  <span>Number of bets</span>
                  <input className="input" type="number" min={1} max={50} value={st.betCount} onChange={(e) => set("betCount", Number(e.target.value))} />
                </label>
                <label className="field">
                  <span>Losers</span>
                  <input className="input" type="number" min={1} max={20} value={st.losers} onChange={(e) => set("losers", Number(e.target.value))} />
                </label>
              </div>
              <label className="field">
                <span>Starting coins</span>
                <input className="input" type="number" min={100} max={100000} step={100} value={st.startingCoins} onChange={(e) => set("startingCoins", Number(e.target.value))} />
              </label>
              <label className="check">
                <input type="checkbox" checked={st.hostPlays} onChange={(e) => set("hostPlays", e.target.checked)} />
                <span>I'm playing too</span>
              </label>
            </div>
          </Panel>

          <Panel label="02 · Bets" right={`${written.length}/${st.betCount} written`}>
            <div className="stack">
              <p className="hint">Write them now or in the lobby.</p>
              {drafts.map((d, i) => (
                <div key={i} className="draft-bet stack">
                  <div className="row">
                    <span className="num dim" style={{ width: 22 }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <input
                      className="input text"
                      value={d.question}
                      onChange={(e) => setDraft(i, { ...d, question: e.target.value })}
                      maxLength={300}
                      placeholder={
                        d.kind === "range"
                          ? "What will tomorrow's high temperature be?"
                          : d.kind === "multi"
                            ? "Who will score highest on the midterm?"
                            : "Will Sam hit the gym 5 times this week?"
                      }
                      aria-label={`Bet ${i + 1}`}
                    />
                    {drafts.length > 1 && (
                      <button type="button" className="btn ghost sm" onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}>
                        Remove
                      </button>
                    )}
                  </div>
                  <OutcomeEditor value={d} onChange={(next) => setDraft(i, next)} idPrefix={`create-${i}`} />
                </div>
              ))}
              {drafts.length < st.betCount && (
                <button type="button" className="btn" onClick={() => setDrafts((ds) => [...ds, newDraft()])}>
                  + Another bet
                </button>
              )}
              {draftProblem && <p className="hint warn">{draftProblem}</p>}
              {tooMany && <p className="notice">This series has {st.betCount} bets. Remove {written.length - st.betCount} question{written.length - st.betCount === 1 ? "" : "s"}.</p>}
            </div>
          </Panel>

          <Panel label="03 · Mode">
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
                    <b>Preview only.</b> No money moves.
                  </p>
                </>
              )}
              {st.mode === "pledge" && (
                <p className="hint">Each player writes their punishment in the lobby.</p>
              )}
              {st.mode === "pool" && (
                <div className="two-col">
                  <label className="field">
                    <span>Punishments per player</span>
                    <input className="input" type="number" min={1} max={5} value={st.favorsPerPlayer} onChange={(e) => set("favorsPerPlayer", Number(e.target.value))} />
                  </label>
                  <div className="field">
                    <span>Punishment pool</span>
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
                    1st picks for last, 2nd for second-to-last. {st.exclusivePool ? "Each punishment is used once." : "Punishments can repeat."}
                  </p>
                </div>
              )}
            </div>
          </Panel>

          <Panel label="04 · Advanced rules">
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
                    ? "Whoever got there first ranks higher."
                    : "A random order is drawn at the start."}
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
                    ? "Players see every question before starting."
                    : `Add more while it runs, up to ${st.betCount}.`}
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
                    ? `Wagers can be taken back for ${st.withdrawMinutes} min.`
                    : "Wagers are final."}
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
              Questions written <b>{written.length}</b>
            </div>
            <div className="rule" />
            <p className="notice">
              <b>Needs {needed}+ players</b>
              {st.hostPlays ? ", counting you" : ""}.
            </p>
            <div style={{ height: 14 }} />
            {phase === "unknown" && (
              <p className="notice" role="alert" style={{ marginBottom: 10 }}>
                <b>We couldn't confirm the series was created.</b> Retrying with the same details is safe: it can't create
                a second one. If you change the details first, that's a new series.
              </p>
            )}
            <button
              type="button"
              className="btn primary block"
              onClick={submit}
              aria-busy={phase === "creating"}
              disabled={phase === "creating" || !name.trim() || tooMany || !!draftProblem}
              title={draftProblem ?? undefined}
            >
              {phase === "creating" ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Creating…
                </>
              ) : phase === "unknown" ? (
                "Retry safely"
              ) : (
                "Create series"
              )}
            </button>
          </Panel>
        </div>
      </div>
      </div>
    </Shell>
  );
}
