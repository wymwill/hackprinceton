"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase-client";

type Participant = { user_id: string; balance: number; joined_at: string };
type Wager = { id: string; user_id: string; outcome: "YES" | "NO"; amount: number };
type Bet = { id: string; position: number; question: string; status: "PLANNED" | "OPEN" | "LOCKED" | "RESOLVED" | "CANCELLED"; winning_outcome?: string | null; series_wagers: Wager[] };
type Series = { id: string; title: string; description: string; host_user_id: string; status: string; planned_bet_count: number; initial_bankroll: number; loser_count: number; bet_series_participants: Participant[] };
type Favor = { id: string; submitted_by: string; description: string; consented_by: string[] };

const field = "w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-on-surface";
const button = "rounded-lg border border-outline-variant px-3 py-2 text-on-surface hover:bg-surface-container-high disabled:opacity-50";
const primary = "rounded-lg bg-primary-container px-4 py-2 font-semibold text-on-primary disabled:opacity-50";

export default function SeriesDashboard() {
  const [seriesId, setSeriesId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [planned, setPlanned] = useState(5);
  const [bankroll, setBankroll] = useState(1000);
  const [losers, setLosers] = useState(1);
  const [questions, setQuestions] = useState<string[]>(Array(5).fill(""));
  const [series, setSeries] = useState<Series | null>(null);
  const [mySeries, setMySeries] = useState<Pick<Series, "id" | "title" | "status">[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);
  const [favors, setFavors] = useState<Favor[]>([]);
  const [viewerId, setViewerId] = useState("");
  const [stakeByBet, setStakeByBet] = useState<Record<string, string>>({});
  const [draftQuestion, setDraftQuestion] = useState("");
  const [favor, setFavor] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isHost = !!series && series.host_user_id === viewerId;

  async function call(path: string, method = "POST", body?: unknown) {
    const session = await getSupabaseClient()?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) throw Error("Sign in to your account first.");
    const response = await fetch(path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(json.error?.message ?? "Request failed.");
    return json.result;
  }

  async function refreshMySeries() {
    try {
      const list = await call("/api/series", "GET");
      const seen = new Set<string>();
      setMySeries(list.filter((item: Pick<Series, "id" | "status">) => {
        if ((item.status !== "LOBBY" && item.status !== "ACTIVE") || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      }));
    } catch { setMySeries([]); }
  }

  useEffect(() => {
    const auth = getSupabaseClient()?.auth;
    if (!auth) return;
    void auth.getSession().then(({ data }) => { if (data.session) void refreshMySeries(); });
    const { data: { subscription } } = auth.onAuthStateChange((_event, session) => {
      if (session) void refreshMySeries(); else setMySeries([]);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Request failed."); }
    finally { setBusy(false); }
  }

  async function load(id = seriesId.trim()) {
    const [details, betList, favorList, user] = await Promise.all([
      call(`/api/series/${id}`, "GET") as Promise<Series>,
      call(`/api/series/${id}/bets`, "GET") as Promise<Bet[]>,
      call(`/api/series/${id}/favors`, "GET") as Promise<Favor[]>,
      getSupabaseClient()!.auth.getUser(),
    ]);
    setSeries(details); setBets(betList); setFavors(favorList); setSeriesId(id); setViewerId(user.data.user?.id ?? "");
  }

  function setQuestion(index: number, value: string) {
    setQuestions(previous => previous.map((question, i) => i === index ? value : question));
  }

  function changePlanned(value: number) {
    setPlanned(value);
    setQuestions(previous => Array.from({ length: Number.isInteger(value) && value > 0 && value <= 30 ? value : 0 }, (_, i) => previous[i] ?? ""));
  }

  async function create() {
    if (!Number.isSafeInteger(planned) || planned < 1 || planned > 30 || questions.length !== planned || questions.some(q => !q.trim())) throw Error("Enter every planned YES/NO question before creating the lobby.");
    const created = await call("/api/series", "POST", { title, description, plannedBetCount: planned, initialBankroll: bankroll, loserCount: losers, stakeMode: "SHARED_FAVOR_POOL", questions });
    await refreshMySeries();
    await load(created.id);
  }

  const closed = bets.filter(b => b.status === "RESOLVED" || b.status === "CANCELLED").length;

  return <main className="mx-auto max-w-3xl px-5 pb-16 pt-24 text-on-surface">
    <h1 className="mb-2 text-3xl font-bold">Bet Series</h1>
    <p className="mb-8 text-on-surface-variant">Plan every prediction, invite friends, and play with virtual coins. Favors are voluntary.</p>

    <section className="mb-8 rounded-2xl border border-outline-variant bg-surface-container-low p-5">
      <h2 className="mb-3 text-xl font-semibold">Ongoing Bet Series</h2>
      {mySeries.length === 0 ? <p className="text-sm text-on-surface-variant">Sign in to see series you’ve joined.</p> : <ul className="space-y-2">{mySeries.map(item => <li key={item.id}><button className={button} onClick={() => void run(() => load(item.id))}>{item.title} · {item.status}</button></li>)}</ul>}
    </section>

    <section className="mb-8 rounded-2xl border border-outline-variant bg-surface-container-low p-5">
      <h2 className="mb-4 text-xl font-semibold">Create a series</h2>
      <div className="grid gap-3">
        <input className={field} placeholder="Series title" value={title} onChange={event => setTitle(event.target.value)} />
        <textarea className={field} placeholder="Description" value={description} onChange={event => setDescription(event.target.value)} />
        <div className="grid grid-cols-3 gap-2">
          <label className="text-sm">Planned bets<input className={field} type="number" min="1" max="30" value={planned} onChange={event => changePlanned(Number(event.target.value))} /></label>
          <label className="text-sm">Starting coins<input className={field} type="number" min="1" value={bankroll} onChange={event => setBankroll(Number(event.target.value))} /></label>
          <label className="text-sm">Bottom losers<input className={field} type="number" min="1" value={losers} onChange={event => setLosers(Number(event.target.value))} /></label>
        </div>
        <div className="space-y-2"><h3 className="font-semibold">Questions to settle</h3><p className="text-sm text-on-surface-variant">Write all {planned || 0} YES/NO questions now. They will play in this order.</p>
          {questions.map((question, index) => <label key={index} className="flex items-center gap-2"><span className="w-7 text-sm text-on-surface-variant">{index + 1}.</span><input className={field} value={question} maxLength={300} placeholder={`Bet ${index + 1}: Will ...?`} onChange={event => setQuestion(index, event.target.value)} /></label>)}
        </div>
        <button disabled={busy} className={`${primary} w-fit`} onClick={() => void run(create)}>Create lobby</button>
      </div>
    </section>

    <section className="mb-8 rounded-2xl border border-outline-variant bg-surface-container-low p-5">
      <h2 className="mb-3 text-xl font-semibold">Join or open a series</h2>
      <div className="flex gap-2"><input className={`${field} min-w-0 flex-1`} placeholder="Paste series ID" value={seriesId} onChange={event => setSeriesId(event.target.value)} /><button disabled={busy || !seriesId} className={button} onClick={() => void run(() => load())}>Open</button><button disabled={busy || !seriesId} className={button} onClick={() => void run(async () => { await call(`/api/series/${seriesId}/join`); await refreshMySeries(); await load(); })}>Join</button></div>
    </section>

    {error && <p role="alert" className="mb-4 rounded-lg bg-red-950 p-3 text-red-200">{error}</p>}
    {series && <section className="rounded-2xl border border-outline-variant bg-surface-container-low p-5">
      <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-bold">{series.title}</h2><p className="text-sm text-on-surface-variant">{series.status} · {closed}/{series.planned_bet_count} bets closed · {series.initial_bankroll} starting coins · bottom {series.loser_count}</p><p className="mt-1 break-all text-xs text-on-surface-variant">Invite ID: {series.id}</p></div>
        {isHost && series.status === "LOBBY" && <button disabled={busy} className={primary} onClick={() => void run(async () => { await call(`/api/series/${series.id}/start`); await load(); })}>Start series</button>}
      </div>
      <h3 className="mt-5 font-semibold">Roster</h3>
      <ul>{series.bet_series_participants.map(participant => <li className="py-1 text-sm" key={participant.user_id}><span title={participant.user_id}>{participant.user_id === viewerId ? "You" : `Player ${participant.user_id.slice(0, 8)}`}</span> {series.status === "LOBBY" ? "joined" : `· ${participant.balance} coins`}</li>)}</ul>

      {series.status === "LOBBY" && isHost && bets.length < series.planned_bet_count && <div className="mt-5 flex gap-2"><input className={field} placeholder="Add a missing planned question" value={draftQuestion} onChange={event => setDraftQuestion(event.target.value)} /><button className={button} onClick={() => void run(async () => { await call(`/api/series/${series.id}/bets`, "POST", { question: draftQuestion }); setDraftQuestion(""); await load(); })}>Add</button></div>}

      <h3 className="mt-6 font-semibold">Planned bets</h3>
      <div className="mt-2 space-y-3">{bets.map(bet => {
        const mine = bet.series_wagers.filter(wager => wager.user_id === viewerId);
        const selected = mine[0]?.outcome;
        const myStake = mine.reduce((sum, wager) => sum + wager.amount, 0);
        const amount = stakeByBet[bet.id] ?? "";
        return <article key={bet.id} className="rounded-xl border border-outline-variant p-4">
          <div className="flex justify-between gap-2"><strong>{bet.position}. {bet.question}</strong><span className="text-sm text-on-surface-variant">{bet.status}</span></div>
          {bet.status !== "PLANNED" && <><p className="my-2 text-sm text-on-surface-variant">YES pool: {bet.series_wagers.filter(w => w.outcome === "YES").reduce((sum, w) => sum + w.amount, 0)} · NO pool: {bet.series_wagers.filter(w => w.outcome === "NO").reduce((sum, w) => sum + w.amount, 0)}</p>
            {mine.length > 0 && <p className="mb-2 text-sm font-semibold text-primary">Your wager: {myStake} on {selected}</p>}
            {bet.series_wagers.length > 0 && <details className="mb-3 text-sm text-on-surface-variant"><summary className="cursor-pointer">See everyone’s wagers ({bet.series_wagers.length})</summary><ul className="mt-2 space-y-1">{bet.series_wagers.map(wager => <li key={wager.id}>{wager.user_id === viewerId ? "You" : `Player ${wager.user_id.slice(0, 8)}`}: {wager.amount} on {wager.outcome}</li>)}</ul></details>}
          </>}
          {bet.status === "OPEN" && <div className="flex flex-wrap items-end gap-2"><label className="text-sm">Your wager amount<input className={`${field} mt-1 w-32`} type="number" min="1" step="1" inputMode="numeric" value={amount} onChange={event => setStakeByBet(previous => ({ ...previous, [bet.id]: event.target.value }))} /></label>{(["YES", "NO"] as const).map(outcome => <button key={outcome} disabled={busy || !Number.isSafeInteger(Number(amount)) || Number(amount) <= 0 || (!!selected && selected !== outcome)} className={`${selected === outcome ? primary : button} h-10`} onClick={() => void run(async () => { await call(`/api/series/${series.id}/bets/${bet.id}/wagers`, "POST", { outcome, amount: Number(amount) }); setStakeByBet(previous => ({ ...previous, [bet.id]: "" })); await load(); })}>Wager {outcome}</button>)}
            {isHost && <button disabled={busy} className={`${button} h-10`} onClick={() => void run(async () => { await call(`/api/series/${series.id}/bets/${bet.id}/lock`); await load(); })}>Lock betting</button>}</div>}
          {bet.status === "LOCKED" && isHost && <div className="flex gap-2">{(["YES", "NO"] as const).map(outcome => <button key={outcome} disabled={busy} className={primary} onClick={() => void run(async () => { await call(`/api/series/${series.id}/bets/${bet.id}/resolve`, "POST", { outcome }); await load(); })}>Resolve {outcome}</button>)}<button disabled={busy} className={button} onClick={() => void run(async () => { await call(`/api/series/${series.id}/bets/${bet.id}/cancel`); await load(); })}>Cancel/refund</button></div>}
          {bet.status === "RESOLVED" && <p className="mt-2 text-sm text-on-surface-variant">{bet.winning_outcome ? `Resolved ${bet.winning_outcome}. One-sided pools are refunded.` : "Resolved and refunded."}</p>}
        </article>;
      })}</div>

      {series.status === "LOBBY" && <div className="mt-6 border-t border-outline-variant pt-4"><h3 className="font-semibold">Favor proposals (voluntary)</h3><div className="mt-2 flex gap-2"><input className={field} value={favor} onChange={event => setFavor(event.target.value)} placeholder="Propose a favor" /><button className={button} onClick={() => void run(async () => { await call(`/api/series/${series.id}/favors`, "POST", { description: favor }); setFavor(""); await load(); })}>Propose</button></div>{favors.map(proposal => <div className="mt-2 flex items-center justify-between gap-2 text-sm" key={proposal.id}><span>{proposal.description} · {proposal.consented_by.length} consented</span>{proposal.submitted_by !== viewerId && <button className={button} onClick={() => void run(async () => { await call(`/api/series/favors/${proposal.id}/consent`, "POST", { consent: true }); await load(); })}>I agree</button>}</div>)}</div>}
      {series.status === "ACTIVE" && isHost && closed === series.planned_bet_count && <button className={`${button} mt-5`} onClick={() => void run(async () => { await call(`/api/series/${series.id}/complete`); await load(); })}>Complete series</button>}
    </section>}
  </main>;
}
