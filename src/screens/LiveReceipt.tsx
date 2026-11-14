"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import Avatar from "@/components/Avatar";
import { useBookie } from "@/components/BookieProvider";

/** Settlement receipt for a server-settled bet: the result, the pool, and every payout. */
export default function LiveReceipt() {
  const { id } = useParams<{ id: string }>();
  const { state, user, toast } = useBookie();
  const bet = state?.bets.find((b) => b.id === id);
  const r = bet?.receipt;

  if (!state || !bet || !r) {
    return (
      <main className="relative pt-16 bg-surface min-h-screen w-full px-gutter-desktop">
        <div className="py-space-lg flex flex-col gap-2 font-body-md text-body-md text-on-surface-variant">
          {!state ? "Loading…" : !bet ? "That bet doesn't exist." : "This bet hasn't been settled yet."}
          {bet && (
            <Link href={`/bets/${bet.id}`} className="text-primary hover:underline">
              Back to the bet
            </Link>
          )}
        </div>
      </main>
    );
  }

  const winner = bet.outcomes.find((o) => o.id === r.outcomeId)!;
  const rows = [...r.payouts].sort((a, b) => b.net - a.net);
  const mine = r.payouts.find((p) => p.userId === state.me);
  const proof = () => {
    const blob = new Blob([JSON.stringify({ bet: { id: bet.id, proposition: bet.proposition, outcomes: bet.outcomes }, receipt: r }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bookie-receipt-${bet.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main className="relative pt-16 bg-surface min-h-screen w-full px-gutter-desktop">
      <div className="flex flex-col gap-space-lg py-space-lg pb-space-xl max-w-3xl mx-auto">
        <section className="rounded-2xl bg-surface-container border border-[#2f384a] p-space-lg flex flex-col gap-space-md items-center text-center">
          <span className="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant">Settlement receipt · {r.id}</span>
          <h1 className="font-headline-md text-headline-md text-on-surface">
            {bet.emoji} {bet.proposition}
          </h1>
          <div className="flex flex-col items-center gap-1">
            <span className="font-label-sm text-label-sm uppercase text-primary">Result</span>
            <span className="font-display-lg text-display-lg text-on-surface">{winner.label}</span>
          </div>
          {mine && (
            <span
              className={`px-4 py-1.5 rounded-full font-label-lg text-label-lg ${
                r.refunded ? "bg-surface-container-high text-on-surface" : mine.net >= 0 ? "bg-primary-container text-on-primary" : "bg-[#fb7185] text-[#3b0a14]"
              }`}
            >
              {r.refunded
                ? "Refunded"
                : mine.net > 0
                  ? `You won ${mine.net.toLocaleString()} pts`
                  : mine.net < 0
                    ? `You lost ${(-mine.net).toLocaleString()} pts`
                    : "Even: you got your stake back"}
            </span>
          )}
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Settled by {user(r.settledBy)?.name} on {new Date(r.settledAt).toLocaleString()}
          </p>
        </section>

        <section className="grid grid-cols-3 gap-space-md">
          {[
            ["Pool", r.pool],
            [`On ${winner.label}`, r.winningPool],
            ["Friends", r.payouts.length],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-surface-container border border-[#2f384a] p-space-md flex flex-col">
              <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">{k}</span>
              <span className="font-headline-md text-headline-md text-on-surface">{Number(v).toLocaleString()}</span>
            </div>
          ))}
        </section>

        {r.refunded && (
          <p className="rounded-xl bg-surface-container-high p-space-md font-body-md text-body-md text-on-surface">
            Nobody backed {winner.label}, so every stake was refunded.
          </p>
        )}

        <section className="rounded-2xl bg-surface-container border border-[#2f384a] p-space-md flex flex-col gap-2">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Payouts</h2>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-space-md gap-y-2 items-center font-label-md text-label-md">
            <span className="text-on-surface-variant font-label-sm text-label-sm uppercase">Friend</span>
            <span className="text-on-surface-variant font-label-sm text-label-sm uppercase text-right">Staked</span>
            <span className="text-on-surface-variant font-label-sm text-label-sm uppercase text-right">Paid</span>
            <span className="text-on-surface-variant font-label-sm text-label-sm uppercase text-right">Net</span>
            {rows.map((p) => {
              const u = user(p.userId);
              const o = bet.outcomes.find((x) => x.id === p.outcomeId)!;
              return (
                <div key={p.userId} className="contents">
                  <span className="flex items-center gap-2 text-on-surface">
                    <Avatar name={u?.name ?? "?"} src={u?.avatar} size={24} />
                    {u?.name}
                    <span className="text-on-surface-variant font-normal">· {o.label}</span>
                  </span>
                  <span className="text-right text-on-surface-variant">{p.staked.toLocaleString()}</span>
                  <span className="text-right text-on-surface">{p.payout.toLocaleString()}</span>
                  <span className={`text-right font-bold ${p.net >= 0 ? "text-primary" : "text-[#fda4af]"}`}>
                    {p.net >= 0 ? "+" : ""}
                    {p.net.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant pt-2">
            Winners split the whole pool in proportion to their stake. Paid out: {r.payouts.reduce((a, p) => a + p.payout, 0).toLocaleString()} of{" "}
            {r.pool.toLocaleString()} pts.
          </p>
        </section>

        <div className="flex flex-wrap gap-space-sm">
          <Link href="/leaderboard" className="px-4 py-2.5 rounded-xl bg-primary-container text-on-primary font-label-lg text-label-lg">
            See the leaderboard
          </Link>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href);
              toast("🔗 Receipt link copied.", "lime");
            }}
            className="px-4 py-2.5 rounded-xl bg-surface-container-high text-on-surface font-label-lg text-label-lg"
          >
            Copy link
          </button>
          <button onClick={proof} className="px-4 py-2.5 rounded-xl bg-surface-container-high text-on-surface font-label-lg text-label-lg">
            Download proof JSON
          </button>
          <Link href={`/bets/${bet.id}`} className="px-4 py-2.5 rounded-xl text-on-surface-variant font-label-lg text-label-lg hover:text-on-surface">
            Back to the bet
          </Link>
        </div>
      </div>
    </main>
  );
}
