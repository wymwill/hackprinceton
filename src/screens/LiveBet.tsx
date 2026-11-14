"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Avatar from "@/components/Avatar";
import { liveStatus, useBookie } from "@/components/BookieProvider";
import QuickBetSheet from "@/components/QuickBetSheet";
import Sparkline from "@/components/Sparkline";
import { ago, timeLeft, useNow } from "@/lib/bets/format";

const STATUS = {
  open: { label: "Open", cls: "bg-primary-container/15 text-primary border-primary-container/30" },
  closed: { label: "Closed · needs result", cls: "bg-[#f0a87a]/15 text-[#f6caa8] border-[#f0a87a]/30" },
  settled: { label: "Settled", cls: "bg-tertiary-container/15 text-tertiary border-tertiary-container/30" },
};

/** One bet from the server: who's in, the pool, and the controls for each stage of its life. */
export default function LiveBet() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { state, user, closeBet, settleBet, toast } = useBookie();
  const now = useNow();
  const [sheet, setSheet] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const bet = state?.bets.find((b) => b.id === id);
  if (!state) return <Shell>Loading…</Shell>;
  if (!bet)
    return (
      <Shell>
        <p className="font-headline-sm text-headline-sm text-on-surface">That bet doesn&apos;t exist.</p>
        <Link href="/bets" className="text-primary hover:underline">
          Back to Bets
        </Link>
      </Shell>
    );

  const status = liveStatus(bet, now);
  const me = state.me;
  const isCreator = bet.creatorId === me;
  const mine = bet.entries.find((e) => e.userId === me);
  const creator = user(bet.creatorId);
  const winner = bet.receipt && bet.outcomes.find((o) => o.id === bet.receipt!.outcomeId);

  const settle = async () => {
    if (!result || busy) return;
    setBusy(true);
    const out = await settleBet(bet.id, result);
    setBusy(false);
    if (out) {
      toast(out.alreadySettled ? "Already settled. No points moved twice." : "⚖️ Settled. Points paid out.", "purple");
      router.push(`/receipts/${bet.id}`);
    }
  };

  return (
    <main className="relative pt-16 bg-surface min-h-screen w-full px-gutter-desktop">
      {sheet !== null && <QuickBetSheet bet={bet} initialOutcome={sheet} onClose={() => setSheet(null)} />}
      <div className="flex flex-col gap-space-lg py-space-lg pb-space-xl max-w-5xl">
        <Link href="/bets" className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface w-fit">
          ← All bets
        </Link>

        {/* Header */}
        <section className="rounded-2xl bg-surface-container border border-[#3a3645] p-space-lg flex flex-col gap-space-md">
          <div className="flex flex-wrap items-center gap-2 font-label-sm text-label-sm">
            <span className={`px-2.5 py-0.5 rounded-full border ${STATUS[status].cls}`}>{STATUS[status].label}</span>
            <span className="text-on-surface-variant">
              {bet.category} · posted by {creator?.name ?? "someone"} {ago(bet.createdAt, now)}
            </span>
            <span className="ml-auto text-on-surface-variant">
              {status === "open" ? `Entries close in ${timeLeft(bet.deadline, now)}` : `Entries closed ${ago(bet.deadline, now)}`}
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface leading-tight">
            {bet.emoji} {bet.proposition}
          </h1>
          <div className="flex flex-wrap gap-space-lg font-label-md text-label-md text-on-surface-variant">
            <span>
              <b className="text-on-surface">{bet.pool.toLocaleString()}</b> pts in the pool
            </span>
            <span>
              <b className="text-on-surface">{bet.entries.length}</b> friends in
            </span>
            {bet.dare && (
              <span>
                Loser&apos;s dare: <b className="text-secondary">{bet.dare}</b>
              </span>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-gutter-desktop items-start">
          <div className="flex flex-col gap-space-md min-w-0">
            {/* Outcomes */}
            <section className="rounded-2xl bg-surface-container border border-[#3a3645] p-space-md flex flex-col gap-3">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Outcomes</h2>
              {bet.outcomes.map((o, i) => {
                const won = winner?.id === o.id;
                return (
                  <div
                    key={o.id}
                    className={`relative overflow-clip rounded-xl border p-3 flex items-center gap-3 ${
                      won ? "border-primary-container bg-primary-container/10" : "border-[#3a3645] bg-surface-container-low"
                    }`}
                  >
                    <div className="absolute inset-y-0 left-0 bg-primary-container/10" style={{ width: `${o.chance}%` }} aria-hidden />
                    <span className="relative flex-1 font-label-lg text-label-lg text-on-surface">
                      {won && "🏆 "}
                      {o.label}
                    </span>
                    <span className="relative font-label-sm text-label-sm text-on-surface-variant">
                      {o.pool.toLocaleString()} pts · {o.backers} {o.backers === 1 ? "friend" : "friends"}
                    </span>
                    <span className="relative w-12 text-right font-headline-sm text-headline-sm text-on-surface">{o.chance}%</span>
                    {status === "open" && !mine && (
                      <button
                        onClick={() => setSheet(i)}
                        className="relative px-3 py-1.5 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md"
                      >
                        Join
                      </button>
                    )}
                  </div>
                );
              })}
              {bet.history.length > 1 && (
                <div className="rounded-xl bg-surface-container-low p-3">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    {bet.outcomes[0].label} chance after each entry
                  </span>
                  <Sparkline data={bet.history.map((h) => h[0])} height={80} width={400} />
                </div>
              )}
            </section>

            {/* Who's in */}
            <section className="rounded-2xl bg-surface-container border border-[#3a3645] p-space-md flex flex-col gap-2">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Who&apos;s in</h2>
              {bet.entries.map((e) => {
                const u = user(e.userId);
                const o = bet.outcomes.find((x) => x.id === e.outcomeId)!;
                const p = bet.receipt?.payouts.find((x) => x.userId === e.userId);
                return (
                  <div key={e.id} className="flex items-center gap-3 py-1.5">
                    <Avatar name={u?.name ?? "?"} src={u?.avatar} />
                    <span className="flex-1 font-label-md text-label-md text-on-surface">
                      {u?.name}
                      {e.userId === me && <span className="text-primary"> (you)</span>}
                      <span className="text-on-surface-variant font-normal"> · {ago(e.createdAt, now)}</span>
                    </span>
                    <span className="font-label-md text-label-md text-on-surface-variant">
                      {e.amount.toLocaleString()} on <b className="text-on-surface">{o.label}</b>
                    </span>
                    {p && (
                      <span className={`w-20 text-right font-label-md text-label-md font-bold ${p.net >= 0 ? "text-primary" : "text-[#e9bf86]"}`}>
                        {p.net >= 0 ? "+" : ""}
                        {p.net.toLocaleString()}
                      </span>
                    )}
                  </div>
                );
              })}
            </section>
          </div>

          {/* Action rail */}
          <aside className="flex flex-col gap-space-md lg:sticky lg:top-20">
            {mine && (
              <section className="rounded-2xl bg-surface-container border border-[#3a3645] p-space-md flex flex-col gap-1">
                <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Your pick</span>
                <span className="font-headline-sm text-headline-sm text-on-surface">
                  {mine.amount.toLocaleString()} pts on {bet.outcomes.find((o) => o.id === mine.outcomeId)!.label}
                </span>
              </section>
            )}

            {status === "open" && (
              <section className="rounded-2xl bg-surface-container border border-[#3a3645] p-space-md flex flex-col gap-3">
                {!mine && (
                  <button onClick={() => setSheet(0)} className="py-3 rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm">
                    Join this bet
                  </button>
                )}
                {isCreator ? (
                  <button
                    onClick={async () => (await closeBet(bet.id)) && toast("🔒 Entries closed. Record the result when you know it.", "purple")}
                    className="py-2.5 rounded-xl bg-surface-container-high text-on-surface font-label-lg text-label-lg hover:bg-surface-bright"
                  >
                    Close entries now
                  </button>
                ) : (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Entries close automatically in {timeLeft(bet.deadline, now)}. Then {creator?.name.split(" ")[0]} records the result.
                  </p>
                )}
              </section>
            )}

            {status === "closed" &&
              (isCreator ? (
                <section className="rounded-2xl bg-surface-container border border-[#f0a87a]/30 p-space-md flex flex-col gap-3">
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">⚖️ What happened?</h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">You made this bet, so you record the result. This can&apos;t be undone.</p>
                  {bet.outcomes.map((o) => (
                    <label
                      key={o.id}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer ${
                        result === o.id ? "border-primary-container bg-primary-container/10" : "border-[#3a3645]"
                      }`}
                    >
                      <input type="radio" name="result" checked={result === o.id} onChange={() => setResult(o.id)} className="accent-[#ce4c3b]" />
                      <span className="font-label-lg text-label-lg text-on-surface">{o.label}</span>
                    </label>
                  ))}
                  <button
                    disabled={!result || busy}
                    onClick={settle}
                    className="py-3 rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm disabled:opacity-40"
                  >
                    {busy ? "Settling…" : "Settle and pay out"}
                  </button>
                </section>
              ) : (
                <section className="rounded-2xl bg-surface-container border border-[#3a3645] p-space-md">
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    Entries are closed. Waiting on {creator?.name.split(" ")[0]} to record the result.
                  </p>
                </section>
              ))}

            {status === "settled" && bet.receipt && (
              <section className="rounded-2xl bg-primary-container/10 border border-primary-container/30 p-space-md flex flex-col gap-2">
                <span className="font-label-sm text-label-sm uppercase text-primary">Result</span>
                <span className="font-headline-md text-headline-md text-on-surface">{winner?.label}</span>
                <Link href={`/receipts/${bet.id}`} className="py-2.5 text-center rounded-xl bg-primary-container text-on-primary font-label-lg text-label-lg">
                  See the receipt
                </Link>
              </section>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative pt-16 bg-surface min-h-screen w-full px-gutter-desktop">
      <div className="py-space-lg flex flex-col gap-2 font-body-md text-body-md text-on-surface-variant">{children}</div>
    </main>
  );
}
