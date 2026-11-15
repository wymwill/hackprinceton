import { useEffect, useRef, useState } from "react";
import { request } from "../lib/store.tsx";
import type { GamePlan } from "../../../shared/gamePlan.ts";
import { Panel } from "./ui.tsx";

export function GamePlanner({ onApply }: { onApply: (plan: GamePlan) => void }) {
  const [prompt, setPrompt] = useState("");
  const [players, setPlayers] = useState(4);
  const [questionCount, setQuestionCount] = useState(3);
  const [plan, setPlan] = useState<GamePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const generate = async () => {
    if (controller.current) return;
    const current = new AbortController();
    controller.current = current;
    setBusy(true); setError("");
    try {
      const next = await request<GamePlan>("POST", "/series/plan", { prompt: prompt.trim(), players, questionCount }, current.signal);
      if (!current.signal.aborted) setPlan(next);
    } catch (e) {
      if (!current.signal.aborted) setError(e instanceof Error ? e.message : "Couldn't generate a game. Try again.");
    } finally {
      if (controller.current === current) controller.current = null;
      setBusy(false);
    }
  };
  const valid = prompt.trim().length >= 12 && prompt.trim().length <= 1000 && players >= 2 && players <= 20 && Number.isInteger(players) && questionCount >= 3 && questionCount <= 8;
  const canApply = plan && plan.name.trim().length >= 3 && plan.questions.every((q) => q.trim().length >= 3) && plan.punishments.every((p) => p.trim().length >= 3);
  return <div className="planner-layout">
    <Panel label="AI game planner">
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (valid) void generate(); }}>
        <p className="hint">Describe your group and the game you want. Get a draft you can edit before inviting anyone.</p>
        <label className="field"><span>Your game idea</span><textarea className="input planner-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} minLength={12} maxLength={1000} required disabled={busy} placeholder="A weekend game for four roommates: cooking, movie night, and keeping the apartment clean." /></label>
        <div className="two-col">
          <label className="field"><span>Players</span><input className="input" type="number" min={2} max={20} step={1} value={players} onChange={(e) => setPlayers(Number(e.target.value))} disabled={busy} required /></label>
          <label className="field"><span>Questions</span><select className="input" value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} disabled={busy}>{[3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        </div>
        <div className="row wrap">
          <button type="submit" className="btn primary" disabled={!valid || busy} aria-busy={busy}>{busy ? "Planning your game…" : plan ? "Generate another draft" : "Generate game"}</button>
          {busy && <button type="button" className="btn ghost" onClick={() => controller.current?.abort()}>Cancel</button>}
        </div>
        {busy && <p className="hint" role="status">Picking ideas and checking your draft. This may take up to 45 seconds.</p>}
        {error && <p className="notice" role="alert">{error}</p>}
        <p className="hint">Your idea is sent to our AI provider. No game is created until you review and confirm it.</p>
      </form>
    </Panel>
    {plan ? <Panel label="Review your draft">
      <div className="stack">
        <label className="field"><span>Series name</span><input className="input" maxLength={60} value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} disabled={busy} /></label>
        <label className="field"><span>Description</span><textarea className="input" maxLength={280} value={plan.description} onChange={(e) => setPlan({ ...plan, description: e.target.value })} disabled={busy} /></label>
        <span className="cap">Yes / No predictions</span>
        {plan.questions.map((q, i) => <label className="field" key={i}><span>Question {i + 1}</span><input className="input" maxLength={300} value={q} onChange={(e) => setPlan({ ...plan, questions: plan.questions.map((v, j) => j === i ? e.target.value : v) })} disabled={busy} /></label>)}
        <span className="cap">Punishment ideas</span>
        {plan.punishments.map((p, i) => <label className="field" key={i}><span>Idea {i + 1}</span><input className="input" maxLength={120} value={p} onChange={(e) => setPlan({ ...plan, punishments: plan.punishments.map((v, j) => j === i ? e.target.value : v) })} disabled={busy} /></label>)}
        <p className="hint">Start with 1,000 virtual coins and one loser. The first two punishment ideas become your contributions. Change any rules in the next step.</p>
        <button type="button" className="btn primary" disabled={!canApply || busy} onClick={() => onApply(plan)}>Use this draft →</button>
      </div>
    </Panel> : <div className="planner-empty"><span aria-hidden="true">✦</span><h2>Your next game starts with an idea</h2><p>Tell us the theme, how long you'll play, and what your friends enjoy.</p></div>}
  </div>;
}
