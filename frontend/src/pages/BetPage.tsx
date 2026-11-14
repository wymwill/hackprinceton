import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ConfirmButton, Panel, Pill, PoolBar, Who } from "../components/ui.tsx";
import { balances, isParticipant, payoutIfWins, pools, withdrawUntil } from "../lib/rules.ts";
import { ago, countdown, fmt, signed, useNow } from "../lib/format.ts";
import { useStore } from "../lib/store.tsx";
import type { Bet, Series, Side } from "../lib/types.ts";

function SideColumn({ bet, side }: { bet: Bet; side: Side }) {
  const { me } = useStore();
  const list = bet.wagers.filter((w) => w.side === side).sort((a, b) => b.amount - a.amount);
  const total = list.reduce((a, w) => a + w.amount, 0);
  const max = Math.max(1, ...bet.wagers.map((w) => w.amount));
  return (
    <div className={`side-col ${side}`}>
      <h4>
        {side.toUpperCase()} <span>{fmt(total)}</span>
      </h4>
      {list.length === 0 && <div className="side-empty">Nobody yet.</div>}
      {list.map((w) => (
        <div key={w.userId} className={`lvl ${w.userId === me ? "mine" : ""}`}>
          <i className="bar" style={{ width: `${(w.amount / max) * 100}%` }} />
          <Who id={w.userId} />
          <span className="num">{fmt(w.amount)}</span>
        </div>
      ))}
    </div>
  );
}

function Ticket({ s, bet }: { s: Series; bet: Bet }) {
  const { me, api, skew } = useStore();
  const [params] = useSearchParams();
  const mine = bet.wagers.find((w) => w.userId === me);
  const [pick, setPick] = useState<Side>(mine?.side ?? (params.get("side") === "no" ? "no" : "yes"));
  const [amount, setAmount] = useState(50);
  const now = useNow(1000) + skew;
  const side = mine?.side ?? pick;
  const free = balances(s).get(me)?.available ?? 0;
  const until = withdrawUntil(bet, s.settings);
  const canWithdraw = !!mine && until !== null && now < until;
  const payout = payoutIfWins(bet, me, side, amount > 0 ? amount : 0);
  const stake = (mine?.amount ?? 0) + (amount > 0 ? amount : 0);

  return (
    <Panel label={mine ? "Add to your wager" : "Place a wager"} className="ticket" right={`${fmt(free)} free`}>
      <div className="seg">
        <button type="button" className={side === "yes" ? "on yes" : ""} disabled={!!mine && mine.side !== "yes"} onClick={() => setPick("yes")}>
          Yes
        </button>
        <button type="button" className={side === "no" ? "on no" : ""} disabled={!!mine && mine.side !== "no"} onClick={() => setPick("no")}>
          No
        </button>
      </div>
      {mine && (
        <p className="hint">
          You're on <b className={mine.side === "yes" ? "yes-t" : "no-t"}>{mine.side.toUpperCase()}</b> with {fmt(mine.amount)} coins.
          {canWithdraw ? " Withdraw to switch sides." : " You can add more to your side."}
        </p>
      )}
      <label className="field">
        <span>Coins</span>
        <input className="input" type="number" min={1} value={amount} onChange={(e) => setAmount(Math.floor(Number(e.target.value)))} />
      </label>
      <div className="quick">
        {[10, 50, 100, 250].map((n) => (
          <button key={n} type="button" onClick={() => setAmount(n)}>
            {n}
          </button>
        ))}
        <button type="button" onClick={() => setAmount(free)}>
          All
        </button>
      </div>
      <div className="summary">
        <div className="kv">
          Your stake <b>{fmt(stake)}</b>
        </div>
        <div className="kv win">
          If {side.toUpperCase()} wins <b>{fmt(payout)}</b>
        </div>
        <div className="kv">
          Profit <b>{signed(payout - stake)}</b>
        </div>
        <p className="hint" style={{ marginTop: 6 }}>
          Estimate from the pool right now. It moves as others bet.
        </p>
      </div>
      <button
        type="button"
        className={`submit ${side}`}
        disabled={!(amount >= 1) || amount > free}
        onClick={() => api.wager(s.id, bet.id, side, amount, `${fmt(amount)} on ${side.toUpperCase()}.`)}
      >
        {mine ? "Add" : "Bet"} {fmt(amount > 0 ? amount : 0)} on {side.toUpperCase()}
      </button>
      {canWithdraw && (
        <ConfirmButton
          className="btn block"
          label={`Withdraw · ${countdown(until! - now)} left`}
          confirm="Take your coins back?"
          onConfirm={() => api.withdraw(s.id, bet.id, "Wager withdrawn.")}
        />
      )}
      {mine && until !== null && now >= until && <p className="hint">The withdrawal window has closed.</p>}
    </Panel>
  );
}

function HostPanel({ s, bet }: { s: Series; bet: Bet }) {
  const { api } = useStore();
  if (bet.status !== "open" && bet.status !== "closed") return null;
  return (
    <Panel label="Host controls">
      <div className="stack">
        {bet.status === "open" && (
          <>
            <button type="button" className="btn" onClick={() => api.lockBet(s.id, bet.id, "Betting locked.")}>
              Lock betting
            </button>
            <p className="hint">Stops new wagers. If everyone is on one side, locking refunds them right away.</p>
          </>
        )}
        <span className="cap">Resolve</span>
        <div className="resolve-grid">
          <ConfirmButton className="y" label="Yes" confirm="Confirm YES" onConfirm={() => api.resolveBet(s.id, bet.id, "yes", "Resolved YES.")} />
          <ConfirmButton className="n" label="No" confirm="Confirm NO" onConfirm={() => api.resolveBet(s.id, bet.id, "no", "Resolved NO.")} />
        </div>
        <ConfirmButton
          className="btn danger"
          label="Cancel bet"
          confirm="Cancel and refund everyone?"
          onConfirm={() => api.cancelBet(s.id, bet.id, "Canceled. Coins returned.")}
        />
        <p className="hint">You decide the result even if you bet on it. Resolving pays out right away.</p>
      </div>
    </Panel>
  );
}

export default function BetPage({ s, bet }: { s: Series; bet: Bet }) {
  const { me, name, skew } = useStore();
  const p = pools(bet);
  const now = useNow(1000) + skew;
  const until = withdrawUntil(bet, s.settings);
  const playing = isParticipant(s, me);
  const index = s.bets.indexOf(bet) + 1;

  return (
    <>
      <section className="bhead">
        <div>
          <span className="row">
            <Pill kind={bet.status}>{bet.status === "closed" ? "Betting locked" : bet.status}</Pill>
            <span className="cap">
              Bet {index} of {s.settings.betCount}
            </span>
          </span>
          <h1 style={{ marginTop: 14 }}>{bet.question}</h1>
          <div className="sub">
            <span>
              Pool <b className="num">{fmt(p.total)}</b>
            </span>
            <span>
              Players <b>{bet.wagers.length}</b>
            </span>
            <span>
              Host <b>{name(s.hostId)}</b>
            </span>
            {bet.status === "open" && until !== null && (
              <span>
                Withdrawals <b>{now < until ? `${countdown(until - now)} left` : "closed"}</b>
              </span>
            )}
            {bet.openedAt && (
              <span>
                Opened <b>{ago(bet.openedAt, now)} ago</b>
              </span>
            )}
          </div>
        </div>
        <div className="readout">
          <div className="v">
            {p.yesPct}
            <small>%</small>
          </div>
          <span className="cap">of coins on yes</span>
        </div>
      </section>

      <div className="grid2">
        <div className="col">
          {bet.status === "resolved" && (
            <Panel className="outcome-banner-wrap" bodyClass="outcome-banner">
              <span className={`o ${bet.outcome === "yes" ? "yes-t" : bet.outcome === "no" ? "no-t" : "dim"}`}>
                {bet.outcome ? bet.outcome.toUpperCase() : "Refunded"}
              </span>
              <span className="lead">
                {bet.refunded
                  ? bet.outcome
                    ? "Nobody was on the other side, so every coin went back."
                    : "Everyone was on one side when betting locked, so every coin went back."
                  : "Winners split the pool in proportion to their stakes."}
              </span>
            </Panel>
          )}
          {bet.status === "canceled" && (
            <p className="notice">
              <b>Canceled.</b> Every wager was refunded.
            </p>
          )}
          <Panel label="Who's on what" right="Visible to everyone">
            <PoolBar bet={bet} />
            <div style={{ height: 16 }} />
            <div className="sides">
              <SideColumn bet={bet} side="yes" />
              <SideColumn bet={bet} side="no" />
            </div>
          </Panel>
          {bet.results && bet.status === "resolved" && (
            <Panel label="Payouts">
              <table className="table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th className="r">Stake</th>
                    <th className="r">Paid</th>
                    <th className="r">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {[...bet.results].sort((a, b) => b.net - a.net).map((r) => (
                    <tr key={r.userId} className={r.userId === me ? "me" : ""}>
                      <td>
                        <Who id={r.userId} />
                      </td>
                      <td className="r num">{fmt(r.stake)}</td>
                      <td className="r num">{fmt(r.payout)}</td>
                      <td className={`r num ${r.net > 0 ? "up" : r.net < 0 ? "down" : "dim"}`}>{signed(r.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </div>
        <div className="col">
          {bet.status === "open" && playing && <Ticket s={s} bet={bet} />}
          {bet.status === "open" && !playing && <p className="notice">You're hosting without playing, so you can't wager.</p>}
          {bet.status === "closed" && <p className="notice">Betting is locked. Waiting for {name(s.hostId)} to call it.</p>}
          {s.hostId === me && <HostPanel s={s} bet={bet} />}
          <Link to={`/s/${s.id}`} className="btn ghost">
            ← Back to all bets
          </Link>
        </div>
      </div>
    </>
  );
}
