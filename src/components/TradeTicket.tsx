"use client";

import { useState } from "react";
import { PAYOUT, quoteBuy, quoteSell, priceYes } from "@/lib/markets/lmsr";
import type { MarketView, Side } from "@/lib/markets/types";
import { useApp } from "./AppProvider";
import { Button, Segmented, card, input, label } from "./ui";

/** Buy or sell Yes or No contracts, with a live quote from the same math the server uses. */
export default function TradeTicket({ market: m, initialSide }: { market: MarketView; initialSide: Side }) {
  const { trade, member, state, toast } = useApp();
  const [action, setAction] = useState<"buy" | "sell">("buy");
  const [side, setSide] = useState<Side>(initialSide);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const yes = Math.round(priceYes(m.q) * 100);
  const mine = m.positions.find((p) => p.userId === state?.me);
  const held = mine ? mine[side] : 0;
  const n = Math.floor(Number(value) || 0);
  const balance = member?.balance ?? 0;

  const quote = action === "buy" ? quoteBuy(m.q, side, n) : { contracts: Math.min(n, held), cost: quoteSell(m.q, side, Math.min(n, held)) };
  const avg = quote.contracts ? Math.round((quote.cost / quote.contracts) * 10) / 10 : 0;
  const payout = quote.contracts * PAYOUT;
  const tooMuch = action === "buy" ? n > balance : n > held;

  const submit = async () => {
    setBusy(true);
    const r = await trade(m.id, action, side, n);
    setBusy(false);
    if (r) {
      setValue("");
      toast(action === "buy" ? `Bought ${r.contracts} ${side === "yes" ? "Yes" : "No"} for ${r.amount}.` : `Sold ${-r.contracts} for ${-r.amount}.`);
    }
  };

  const sideBtn = (s: Side) =>
    `flex flex-col items-center py-3 rounded-xl ring-1 transition-colors ${
      side === s
        ? s === "yes"
          ? "bg-primary-container/25 ring-primary-container text-primary"
          : "bg-secondary/20 ring-secondary text-secondary"
        : "bg-surface-container-high ring-transparent text-on-surface-variant hover:text-on-surface"
    }`;

  return (
    <section className={`${card} p-4 flex flex-col gap-4`} aria-label="Trade">
      <Segmented
        ariaLabel="Buy or sell"
        value={action}
        onChange={(v) => (setAction(v), setValue(""))}
        options={[
          { value: "buy", label: "Buy" },
          { value: "sell", label: "Sell" },
        ]}
      />
      <div className="grid grid-cols-2 gap-2">
        <button className={sideBtn("yes")} onClick={() => setSide("yes")} aria-pressed={side === "yes"}>
          <span className="font-label-lg text-label-lg">Yes</span>
          <span className="font-num text-[22px] font-semibold">{yes}</span>
        </button>
        <button className={sideBtn("no")} onClick={() => setSide("no")} aria-pressed={side === "no"}>
          <span className="font-label-lg text-label-lg">No</span>
          <span className="font-num text-[22px] font-semibold">{100 - yes}</span>
        </button>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className={`${label} flex justify-between`}>
          <span>{action === "buy" ? "Spend" : "Contracts to sell"}</span>
          <span className="normal-case tracking-normal">{action === "buy" ? `You have ${balance.toLocaleString()}` : `You hold ${held}`}</span>
        </span>
        <input className={`${input} font-num text-lg`} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} placeholder="0" aria-label={action === "buy" ? "Tokens to spend" : "Contracts to sell"} />
        <div className="flex gap-1.5">
          {(action === "buy" ? [50, 100, 250] : [1, 5]).map((v) => (
            <button key={v} type="button" onClick={() => setValue(String(v))} className="px-2.5 py-1 rounded-lg bg-surface-container-high font-num text-[12px] text-on-surface-variant hover:text-on-surface">
              {action === "buy" ? `+${v}` : v}
            </button>
          ))}
          <button type="button" onClick={() => setValue(String(action === "buy" ? balance : held))} className="px-2.5 py-1 rounded-lg bg-surface-container-high font-label-sm text-[12px] text-on-surface-variant hover:text-on-surface">
            Max
          </button>
        </div>
      </label>
      {n > 0 && (
        <dl className="grid grid-cols-2 gap-y-1.5 font-body-sm text-body-sm">
          <dt className="text-on-surface-variant">Contracts</dt>
          <dd className="text-right font-num text-on-surface">{quote.contracts}</dd>
          <dt className="text-on-surface-variant">Average price</dt>
          <dd className="text-right font-num text-on-surface">{avg || "–"}</dd>
          {action === "buy" ? (
            <>
              <dt className="text-on-surface-variant">You pay</dt>
              <dd className="text-right font-num text-on-surface">{quote.cost}</dd>
              <dt className="text-on-surface-variant">Payout if {side === "yes" ? "Yes" : "No"}</dt>
              <dd className="text-right font-num text-primary">{payout}</dd>
              <dt className="text-on-surface-variant">Profit</dt>
              <dd className="text-right font-num text-primary">+{payout - quote.cost}</dd>
            </>
          ) : (
            <>
              <dt className="text-on-surface-variant">You get</dt>
              <dd className="text-right font-num text-primary">{quote.cost}</dd>
            </>
          )}
        </dl>
      )}
      {n > 0 && action === "buy" && quote.contracts === 0 && <p className="font-body-sm text-body-sm text-secondary">Not enough for one contract at this price.</p>}
      {tooMuch && <p className="font-body-sm text-body-sm text-secondary">{action === "buy" ? "More than you have." : "More than you hold."}</p>}
      <Button tone={side === "yes" ? "primary" : "no"} onClick={submit} disabled={busy || !n || !quote.contracts || tooMuch}>
        {action === "buy" ? "Buy" : "Sell"} {side === "yes" ? "Yes" : "No"}
        {quote.contracts ? ` · ${quote.contracts} for ${quote.cost}` : ""}
      </Button>
      <p className="font-label-sm text-[11px] text-on-surface-variant text-center">Each right call pays {PAYOUT}. Prices move as people trade.</p>
    </section>
  );
}
