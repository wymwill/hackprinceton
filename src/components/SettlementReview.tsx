"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BetView, ReviewIssue } from "@/lib/bets/types";
import { useBookie } from "./BookieProvider";
import BookieMark, { SourceChip } from "./market/BookieMark";

const ISSUE_LABEL: Record<ReviewIssue["type"], string> = {
  missing: "Missing",
  contradictory: "Contradictory",
  inconclusive: "Inconclusive",
  unverifiable: "Can't verify",
  self_interested: "Self-interested",
};

/**
 * Settlement for a closed bet. Anyone in the bet can ask the AI Bookie to review
 * the evidence; only the creator can confirm, reject, or settle by hand.
 */
export default function SettlementReview({ bet }: { bet: BetView }) {
  const router = useRouter();
  const { state, user, reviewBet, decide, settleBet, toast } = useBookie();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [manual, setManual] = useState<string | null>(null);

  const me = state?.me;
  const isCreator = bet.creatorId === me;
  const involved = isCreator || bet.entries.some((e) => e.userId === me);
  const review = bet.reviews.at(-1);
  const stale = review && bet.evidence.some((e) => !review.evidenceSeen.includes(e.id));
  const label = (id?: string) => bet.outcomes.find((o) => o.id === id)?.label;
  /** "Priya's statement" instead of a raw evidence id. */
  const evName = (id: string) => {
    const ev = bet.evidence.find((e) => e.id === id);
    if (!ev) return id;
    const kind = ev.kind === "text" ? "statement" : ev.kind;
    return `${user(ev.userId)?.name.split(" ")[0] ?? "Someone"}'s ${kind}`;
  };

  const run = async <T,>(key: string, fn: () => Promise<T>) => {
    setBusy(key);
    const out = await fn();
    setBusy(null);
    return out;
  };

  const finish = (alreadySettled: boolean) => {
    toast(alreadySettled ? "Already settled. No points moved twice." : "⚖️ Settled. Points paid out.", "purple");
    router.push(`/receipts/${bet.id}`);
  };

  return (
    <section className="rounded-2xl bg-surface-container ring-1 ring-[#f0a87a]/30 p-4 flex flex-col gap-3">
      <h2 className="font-headline-sm text-headline-sm text-on-surface">⚖️ What happened?</h2>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        Entries are closed. Add evidence in the Evidence tab, ask the AI Bookie to review it, then {isCreator ? "you make" : "the creator makes"} the call.
      </p>

      {involved && (
        <button
          disabled={!!busy}
          onClick={() => run("review", () => reviewBet(bet.id)).then((r) => r && toast("🤖 Review ready.", "purple"))}
          className="py-2.5 rounded-xl bg-tertiary-container/20 text-tertiary font-label-lg text-label-lg disabled:opacity-50"
        >
          {busy === "review" ? "The Bookie is reviewing…" : review ? "Review the evidence again" : "Ask the AI Bookie to review the evidence"}
        </button>
      )}

      {review && (
        <div className={`flex flex-col gap-2 p-3 rounded-xl border ${review.status === "recommended" ? "border-tertiary-container/40 bg-tertiary-container/10" : "border-[#f0a87a]/40 bg-[#f0a87a]/10"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <BookieMark size="xs" />
            <SourceChip
              label={
                review.source === "claude"
                  ? `Claude · ${review.model}`
                  : review.source === "test-stub"
                    ? "Test stub"
                    : state?.ai.mode === "claude"
                      ? "AI unavailable · rules summary"
                      : "AI offline · rules summary"
              }
              tone={review.source === "claude" ? "ai" : "warn"}
            />
            {review.status === "recommended" ? (
              <span className="font-headline-sm text-headline-sm text-tertiary">
                Recommends {label(review.outcomeId)} · {Math.round((review.confidence ?? 0) * 100)}%
              </span>
            ) : (
              <span className="font-label-lg text-label-lg text-[#f6caa8]">🚩 Needs a human decision</span>
            )}
          </div>
          <p className="font-body-md text-body-md text-on-surface">{review.explanation}</p>
          {review.evidenceUsed.length > 0 && (
            <ul className="flex flex-col gap-0.5 font-body-sm text-body-sm text-on-surface-variant">
              {review.evidenceUsed.map((u) => (
                <li key={u.evidenceId}>
                  <span className="text-on-surface" title={u.evidenceId}>
                    {evName(u.evidenceId)}
                  </span>
                  : {u.how}
                </li>
              ))}
            </ul>
          )}
          {review.issues.length > 0 && (
            <ul className="flex flex-col gap-1">
              {review.issues.map((i, n) => (
                <li key={n} className="font-body-sm text-body-sm text-on-surface">
                  <span className="px-1.5 py-0.5 mr-1.5 rounded bg-[#f0a87a]/20 text-[#f6caa8] font-label-sm text-label-sm">{ISSUE_LABEL[i.type]}</span>
                  {i.detail}
                  {i.evidenceIds.length > 0 && <span className="text-on-surface-variant"> ({i.evidenceIds.map(evName).join(", ")})</span>}
                </li>
              ))}
            </ul>
          )}
          {stale && <p className="font-body-sm text-body-sm text-[#f6caa8]">New evidence arrived after this review. Run it again before confirming.</p>}
          {review.decision && (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {review.decision.action === "confirmed" ? "Confirmed" : "Rejected"} by the creator{review.decision.note ? `: “${review.decision.note}”` : "."}
            </p>
          )}

          {isCreator && !review.decision && (
            <div className="flex flex-col gap-2 pt-1">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={280}
                placeholder="Note for the group (needed to reject)"
                className="px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/40 font-body-md text-body-md"
              />
              <div className="flex flex-col gap-2">
                {review.status === "recommended" && (
                  <button
                    disabled={!!busy || stale}
                    onClick={() =>
                      run("confirm", () => decide(bet.id, review.id, "confirm", note || undefined)).then((r) => r?.receipt && finish(r.alreadySettled))
                    }
                    className="py-2.5 rounded-xl bg-primary-container text-on-primary font-label-lg text-label-lg disabled:opacity-40"
                  >
                    {busy === "confirm" ? "Settling…" : `Confirm ${label(review.outcomeId)} and pay out`}
                  </button>
                )}
                <button
                  disabled={!!busy || !note.trim()}
                  onClick={() => run("reject", () => decide(bet.id, review.id, "reject", note)).then((r) => r && toast("Recommendation rejected.", "coral"))}
                  className="py-2 rounded-xl bg-surface-container-high text-on-surface font-label-md text-label-md disabled:opacity-40"
                >
                  Reject (needs a note)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isCreator ? (
        <details className="flex flex-col gap-2" open={!review || review.status !== "recommended" || !!review.decision}>
          <summary className="cursor-pointer font-label-md text-label-md text-on-surface-variant">Settle it yourself</summary>
          <div className="flex flex-col gap-2 pt-2">
            <p className="font-body-sm text-body-sm text-on-surface-variant">You made this bet, so your call is final. This can&apos;t be undone.</p>
            {bet.outcomes.map((o) => (
              <label key={o.id} className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer ${manual === o.id ? "border-primary-container bg-primary-container/10" : "border-[#3a3645]"}`}>
                <input type="radio" name="result" checked={manual === o.id} onChange={() => setManual(o.id)} className="accent-[#ce4c3b]" />
                <span className="font-label-lg text-label-lg text-on-surface">{o.label}</span>
              </label>
            ))}
            <button
              disabled={!manual || !!busy}
              onClick={() => run("settle", () => settleBet(bet.id, manual!, note || undefined)).then((r) => r && finish(r.alreadySettled))}
              className="py-3 rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm disabled:opacity-40"
            >
              {busy === "settle" ? "Settling…" : "Settle and pay out"}
            </button>
          </div>
        </details>
      ) : (
        <p className="font-body-sm text-body-sm text-on-surface-variant">The bet&apos;s creator makes the final call.</p>
      )}
    </section>
  );
}
