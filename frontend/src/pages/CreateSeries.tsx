import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSocial } from "../lib/social.tsx";
import { Shell } from "../components/Shell.tsx";
import OutcomeEditor, { newDraft, outcomeProblem } from "../components/OutcomeEditor.tsx";
import { Panel } from "../components/ui.tsx";
import { DEFAULT_SETTINGS } from "../lib/rules.ts";
import { MODE_LABEL, fmt } from "../lib/format.ts";
import { useStore } from "../lib/store.tsx";
import { QUICK_TEMPLATES, quickSettings, templateDrafts, type QuickTemplate } from "../lib/quickGame.ts";
import { newRequestId } from "../lib/submit.ts";
import type { BetDraft, Mode, Settings } from "../lib/types.ts";

type SavedDraft = { name: string; description: string; drafts: BetDraft[]; settings: Settings; quick: boolean; templateId: string | null; punishments: string[] };
const draftKey = (userId: string, clanId: string | null) => `alea:create-draft:v1:${userId}:${clanId ?? "solo"}`;
function readDraft(key: string): SavedDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<SavedDraft>;
    if (typeof d.name !== "string" || typeof d.description !== "string" || !Array.isArray(d.drafts) || !d.settings || typeof d.settings !== "object") return null;
    if (!d.drafts.every((b) => b && typeof b.question === "string" && ["binary", "multi", "range"].includes(b.kind))) return null;
    return { name: d.name, description: d.description, drafts: d.drafts.length ? d.drafts : [newDraft()], settings: { ...DEFAULT_SETTINGS, ...d.settings }, quick: d.quick === true, templateId: typeof d.templateId === "string" ? d.templateId : null, punishments: Array.isArray(d.punishments) ? d.punishments.filter((p): p is string => typeof p === "string") : [] };
  } catch { return null; }
}

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
  const { api, me, toast } = useStore();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const clanId = params.get("clan");
  const key = draftKey(me, clanId);
  const saved = useRef(readDraft(key)).current;
  const [name, setName] = useState(saved?.name ?? "");
  const [description, setDescription] = useState(saved?.description ?? "");
  const [drafts, setDrafts] = useState<BetDraft[]>(saved?.drafts ?? [newDraft()]);
  const [st, setSt] = useState<Settings>(saved?.settings ?? { ...DEFAULT_SETTINGS });
  const [quick, setQuick] = useState(saved?.quick ?? true);
  const [templateId, setTemplateId] = useState<string | null>(saved?.templateId ?? null);
  const [category, setCategory] = useState<QuickTemplate["category"]>(QUICK_TEMPLATES.find((t) => t.id === saved?.templateId)?.category ?? "game");
  const [punishments, setPunishments] = useState<string[]>(saved?.punishments ?? []);
  const [gameQuery, setGameQuery] = useState("");
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSt((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(key, JSON.stringify({ name, description, drafts, settings: st, quick, templateId, punishments } satisfies SavedDraft)); } catch { /* Storage may be unavailable. */ }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [key, name, description, drafts, st, quick, templateId, punishments]);

  const template = QUICK_TEMPLATES.find((t) => t.id === templateId);
  const chooseTemplate = (t: QuickTemplate) => {
    setTemplateId(t.id); setCategory(t.category); setName(t.name); setDescription(t.description);
    setDrafts(templateDrafts(t)); setSt(quickSettings(3)); setPunishments(t.punishments.slice(0, 1));
  };
  const quickAdd = (question = "") => {
    setDrafts((ds) => [...ds, newDraft(question)]);
    setSt((s) => ({ ...s, betCount: Math.max(s.betCount, drafts.length + 1) }));
  };
  const quickRemove = (index: number) => {
    if (drafts.length <= 1) return;
    setDrafts((ds) => ds.filter((_, i) => i !== index));
    setSt((s) => ({ ...s, betCount: Math.max(1, drafts.length - 1) }));
  };

  const needed = st.mode === "pool" ? 2 * st.losers : st.losers + 1;
  const written = drafts.filter((d) => d.question.trim());
  const tooMany = written.length > st.betCount;
  const setDraft = (i: number, d: BetDraft) => setDrafts((ds) => ds.map((x, j) => (j === i ? d : x)));
  // Bets with a question must be valid; empty rows are skipped.
  const draftProblem = written.map((d, i) => (d.question.trim().length < 3 ? `Bet ${i + 1}: write at least 3 characters.` : outcomeProblem(d) && `Bet ${i + 1}: ${outcomeProblem(d)}`)).find(Boolean) || null;

  // /new?clan=ID: start a series with a whole clan. The basics fill in from the clan once it loads,
  // and every member joins the lobby when the series is created.
  const social = useSocial();
  const clan = clanId ? social.data?.clans.find((c) => c.id === clanId) : undefined;
  const filled = useRef(false);
  useEffect(() => {
    if (!clan || filled.current || saved) return;
    filled.current = true;
    const n = clan.members.length;
    setName(`${clan.name} series`.slice(0, 60));
    setDescription(`Bets for ${clan.name}. All ${n} members start in the lobby.`);
    // A shared pool needs twice as many players as losers, so bigger clans can have 2 losers.
    setSt((s) => ({ ...s, losers: n >= 6 ? 2 : 1, mode: "pool", hostPlays: true }));
  }, [clan, saved]);

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
    const requestKey = JSON.stringify(input);
    const prior = loadPendingSeries();
    const requestId = prior?.key === requestKey ? prior.requestId : newRequestId();
    savePendingSeries({ requestId, key: requestKey });
    const r = await api.createSeries(input, requestId);
    inFlight.current = false;
    if (r.kind === "unknown") {
      setPhase("unknown");
      return;
    }
    savePendingSeries(null);
    if (r.kind === "refused") {
      setPhase("idle");
      toast(r.message, "err");
      return;
    }
    const s = r.result;
    if (clan) await api.addClan(s.id, clan.id, `Series created. Everyone in ${clan.name} is in the lobby.`);
    else toast(s.replayed ? "That series was already created. Here it is." : "Series created. Share the invite link to fill the lobby.");
    if (st.mode === "pool" && st.hostPlays) {
      const addedKey = `alea:quick-punishments:${s.id}`;
      let added: string[] = [];
      try {
        const priorAdded: unknown = JSON.parse(localStorage.getItem(addedKey) ?? "[]");
        if (Array.isArray(priorAdded)) added = priorAdded.filter((p): p is string => typeof p === "string");
      } catch { /* Storage may be unavailable. */ }
      for (const p of punishments.slice(0, st.favorsPerPlayer)) {
        if (added.includes(p)) continue;
        if (await api.submitFavor(s.id, p)) {
          added = [...added, p];
          try { localStorage.setItem(addedKey, JSON.stringify(added)); } catch { /* Storage may be unavailable. */ }
        }
      }
    }
    try { localStorage.removeItem(key); } catch { /* Storage may be unavailable. */ }
    setPhase("idle");
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

      <div className="row" style={{ marginBottom: 18 }}>
        <button type="button" className={`btn ${quick ? "primary" : ""}`} onClick={() => setQuick(true)}>Quick game</button>
        <button type="button" className={`btn ${quick ? "" : "primary"}`} onClick={() => setQuick(false)}>Detailed setup</button>
        <span className="hint">Draft saves automatically on this device.</span>
      </div>

      {quick && <div className="grid2 quick-setup">
        <div className="col">
          <Panel label="01 · Pick a starting point">
            <div className="quick-categories">
              <button type="button" className={`quick-tile ${category === "game" ? "on" : ""}`} onClick={() => setCategory("game")}><b>Game night</b><span>Game-specific bets for your group</span></button>
              {QUICK_TEMPLATES.filter((t) => t.category !== "game").map((t) => <button key={t.id} type="button" className={`quick-tile ${templateId === t.id && category === t.category ? "on" : ""}`} onClick={() => chooseTemplate(t)}><b>{t.label}</b><span>{t.description}</span></button>)}
            </div>
            {category === "game" && <div className="stack" style={{ marginTop: 18 }}>
              <label className="field"><span>Choose a game</span><input className="input" value={gameQuery} onChange={(e) => setGameQuery(e.target.value)} placeholder="Search games" aria-label="Search games" /></label>
              <div className="quick-games">
                {QUICK_TEMPLATES.filter((t) => t.category === "game" && t.label.toLowerCase().includes(gameQuery.toLowerCase().trim())).map((t) => <button key={t.id} type="button" className={`quick-game ${templateId === t.id ? "on" : ""}`} onClick={() => chooseTemplate(t)}>{t.label}</button>)}
              </div>
              {QUICK_TEMPLATES.filter((t) => t.category === "game" && t.label.toLowerCase().includes(gameQuery.toLowerCase().trim())).length === 0 && <p className="hint">No match yet. Use Detailed setup to write bets for any game.</p>}
            </div>}
          </Panel>

          {template && template.category === category && <>
            <Panel label="02 · Make it yours">
              <div className="stack">
                <label className="field"><span>Series name</span><input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
                <label className="field"><span>Description</span><input className="input" value={description} maxLength={280} onChange={(e) => setDescription(e.target.value)} /></label>
                <p className="hint">Edit these questions, then create the lobby and share its invite link with your friends or clan. For Keep It Clean, each bet has Person 1–5 as possible answers; agree on who each placeholder means before betting starts.</p>
                {drafts.map((d, i) => <div className="row quick-question" key={i}>
                  <span className="num dim">{String(i + 1).padStart(2, "0")}</span>
                  <input className="input text" value={d.question} maxLength={300} onChange={(e) => setDraft(i, { ...d, question: e.target.value })} aria-label={`Question ${i + 1}`} placeholder="Write a prediction" />
                  <button type="button" className="btn ghost sm" disabled={drafts.length === 1} onClick={() => quickRemove(i)} aria-label={`Remove question ${i + 1}`}>Remove</button>
                </div>)}
                {drafts.length < 10 && <button type="button" className="btn" onClick={() => quickAdd()}>+ Write your own question</button>}
                {template.questions.some((q) => !drafts.some((d) => d.question === q)) && <div className="stack"><span className="cap">More ideas</span><div className="quick-ideas">{template.questions.filter((q) => !drafts.some((d) => d.question === q)).map((q) => <button key={q} type="button" className="btn ghost sm" disabled={drafts.length >= 10} onClick={() => quickAdd(q)}>+ {q}</button>)}</div></div>}
              </div>
            </Panel>
            {st.mode === "pool" && st.hostPlays && <Panel label="03 · Punishments" right={`${punishments.length}/${st.favorsPerPlayer} selected`}>
              <div className="stack"><p className="hint">Choose up to {st.favorsPerPlayer} for your contribution to the shared pool. Friends can add their own and everyone reviews the pool before play.</p>
                <div className="quick-ideas">{template.punishments.map((p) => <button key={p} type="button" className={`btn sm ${punishments.includes(p) ? "primary" : ""}`} onClick={() => setPunishments((xs) => xs.includes(p) ? xs.filter((x) => x !== p) : xs.length < st.favorsPerPlayer ? [...xs, p] : xs)} aria-pressed={punishments.includes(p)}>{punishments.includes(p) ? "✓ " : "+ "}{p}</button>)}</div>
              </div>
            </Panel>}
          </>}
        </div>
        <div className="col quick-summary">
          <Panel label="Ready to invite">
            {template && template.category === category ? <div className="stack">
              <h2>{name || "Your series"}</h2>
              <p className="hint">{written.length} bets · {fmt(st.startingCoins)} starting coins · bottom {st.losers} loses{st.mode === "pool" && st.hostPlays ? ` · ${punishments.length} punishments selected` : ""}</p>
              <p className="hint">Create the lobby, then share its invite link. Friends can review the rules and get ready before play starts.</p>
              {draftProblem && <p className="hint warn">{draftProblem}</p>}
              {phase === "unknown" && <p className="notice" role="alert">We couldn't confirm creation. Retry with the same details to avoid a duplicate series.</p>}
              <button type="button" className="btn primary block" onClick={submit} aria-busy={phase === "creating"} disabled={phase === "creating" || !name.trim() || drafts.some((d) => d.question.trim().length < 3) || tooMany || !!draftProblem}>
                {phase === "creating" ? "Creating…" : phase === "unknown" ? "Retry safely" : "Create series & invite"}
              </button>
              <button type="button" className="btn ghost block" onClick={() => setQuick(false)}>Customize rules →</button>
            </div> : <p className="hint">Choose a template to get an editable series ready in seconds.</p>}
          </Panel>
        </div>
      </div>}

      {!quick && <div className="grid2">
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
      </div>}
      </div>
    </Shell>
  );
}
