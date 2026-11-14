import { useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ConfirmButton, OutcomeTag, Panel, Pill, PoolBar, Who } from "../components/ui.tsx";
import { balances, findOutcome, isParticipant, labelOf, leader, payoutIfWins, resultText, shares, TIE_RULE_TEXT, withdrawUntil } from "../lib/rules.ts";
import { ago, countdown, fmt, signed, useNow } from "../lib/format.ts";
import { useStore } from "../lib/store.tsx";
import { fmtValue, parseNum, rangeFor, rangeRule } from "../lib/ranges.ts";
import type { Bet, Id, Series } from "../lib/types.ts";

/** YES/NO keep their yes/no styling; other outcomes use their own color (--oc). */
const tone = (bet: Bet, i: number) => (bet.kind === "binary" ? (i === 0 ? "yes" : "no") : "oc");
const ocStyle = (color: string) => ({ "--oc": color }) as CSSProperties;

/** Who has coins on one outcome, biggest first. */
function OutcomeColumn({ bet, id }: { bet: Bet; id: Id }) {
  const { me } = useStore();
  const { list } = shares(bet);
  const o = list.find((x) => x.id === id)!;
  const wagers = bet.wagers.filter((w) => w.outcomeId === id).sort((a, b) => b.amount - a.amount);
  const max = Math.max(1, ...bet.wagers.map((w) => w.amount));
  return (
    <div className={`side-col ${tone(bet, o.index)}`} style={ocStyle(o.color)}>
      <h4>
        {o.label} <span>{fmt(o.pool)}</span>
      </h4>
      {wagers.length === 0 && <div className="side-empty">Nobody yet.</div>}
      {wagers.map((w) => (
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
  const { list, total } = shares(bet);
  // A link can preselect an outcome: ?outcome=<id>, or the older ?side=yes|no.
  const [pick, setPick] = useState<Id>(() => mine?.outcomeId ?? findOutcome(bet, params.get("outcome") ?? params.get("side"))?.id ?? list[0].id);
  const [amount, setAmount] = useState(50);
  const now = useNow(1000) + skew;
  const chosen = list.find((o) => o.id === (mine?.outcomeId ?? pick)) ?? list[0];
  const free = balances(s).get(me)?.available ?? 0;
  const until = withdrawUntil(bet, s.settings);
  const canWithdraw = !!mine && until !== null && now < until;
  const payout = payoutIfWins(bet, me, chosen.id, amount > 0 ? amount : 0);
  const stake = (mine?.amount ?? 0) + (amount > 0 ? amount : 0);
  const binary = bet.kind === "binary";

  return (
    <Panel label={mine ? "Add to your wager" : "Place a wager"} className="ticket" right={`${fmt(free)} free`}>
      {binary ? (
        <div className="seg" role="radiogroup" aria-label="Your pick">
          {list.map((o, i) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={chosen.id === o.id}
              className={chosen.id === o.id ? `on ${i === 0 ? "yes" : "no"}` : ""}
              disabled={!!mine && mine.outcomeId !== o.id}
              onClick={() => setPick(o.id)}
            >
              {i === 0 ? "Yes" : "No"}
            </button>
          ))}
        </div>
      ) : (
        <div className="opick" role="radiogroup" aria-label="Your pick">
          {list.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={chosen.id === o.id}
              className={chosen.id === o.id ? "on" : ""}
              style={ocStyle(o.color)}
              disabled={!!mine && mine.outcomeId !== o.id}
              onClick={() => setPick(o.id)}
            >
              <span className="lbl">
                {o.label}
                {bet.kind === "range" && <small className="rule">{rangeRule(o.lower ?? null, o.upper ?? null, bet.unit ?? "", bet.decimals ?? 0)}</small>}
              </span>
              <span className="num">{total ? `${o.pct}%` : "–"}</span>
            </button>
          ))}
        </div>
      )}
      {mine && (
        <p className="hint">
          You're on <OutcomeTag bet={bet} id={mine.outcomeId} /> with {fmt(mine.amount)} coins.
          {canWithdraw ? " Withdraw to pick something else." : " You can add more to it."}
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
          If {chosen.label} wins <b>{fmt(payout)}</b>
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
        className={`submit ${binary ? (chosen.index === 0 ? "yes" : "no") : "oc"}`}
        style={binary ? undefined : ocStyle(chosen.color)}
        disabled={!(amount >= 1) || amount > free}
        onClick={() => api.wager(s.id, bet.id, chosen.id, amount, `${fmt(amount)} on ${chosen.label}.`)}
      >
        {mine ? "Add" : "Bet"} {fmt(amount > 0 ? amount : 0)} on {chosen.label}
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

/** Multiple choice only: the host ticks the outcomes that tied, and the bet's tie rule decides. */
function TieReport({ s, bet }: { s: Series; bet: Bet }) {
  const { api } = useStore();
  const [tied, setTied] = useState<Id[]>([]);
  const first = bet.outcomes.find((o) => tied.includes(o.id));
  return (
    <details className="tie-report">
      <summary>It's a tie</summary>
      <div className="stack" style={{ marginTop: 10 }}>
        <p className="hint">{TIE_RULE_TEXT[bet.tieRule]} This was set before betting started.</p>
        {bet.outcomes.map((o) => (
          <label key={o.id} className="check">
            <input
              type="checkbox"
              checked={tied.includes(o.id)}
              onChange={(e) => setTied((t) => (e.target.checked ? [...t, o.id] : t.filter((x) => x !== o.id)))}
            />
            <span>{o.label}</span>
          </label>
        ))}
        <ConfirmButton
          className="btn"
          disabled={tied.length < 2}
          label={tied.length < 2 ? "Pick at least two" : `Report a ${tied.length}-way tie`}
          confirm={bet.tieRule === "refund" ? "Refund everyone?" : `${first?.label} wins as listed first. Confirm?`}
          onConfirm={() =>
            api.resolveTie(s.id, bet.id, tied, bet.tieRule === "refund" ? "Tie: everyone got their coins back." : `Tie: ${first?.label} wins as listed first.`)
          }
        />
      </div>
    </details>
  );
}

/** Range bets: the host types the measured value; the range holding it wins. No picking by hand. */
function RangeSettle({ s, bet }: { s: Series; bet: Bet }) {
  const { api } = useStore();
  const [raw, setRaw] = useState("");
  const unit = bet.unit ?? "";
  const decimals = bet.decimals ?? 0;
  const value = parseNum(raw);
  const tooPrecise = value !== null && (raw.trim().split(".")[1] ?? "").length > decimals;
  const hit = value !== null && !tooPrecise ? rangeFor(bet, value) : undefined;
  const shown = value !== null ? fmtValue(value, unit, decimals) : "";
  return (
    <div className="stack" style={{ gap: 8 }}>
      <label className="field">
        <span>Actual result{unit ? ` (${unit})` : ""}</span>
        <input
          className="input"
          inputMode="decimal"
          value={raw}
          placeholder={decimals ? (72).toFixed(decimals) : "72"}
          onChange={(e) => setRaw(e.target.value)}
          aria-describedby={`settle-${bet.id}`}
        />
      </label>
      <p id={`settle-${bet.id}`} className={value === null || tooPrecise ? "hint" : hit ? "hint" : "hint warn"} role="status">
        {raw.trim() === ""
          ? `Enter the measured number${decimals ? ` to ${decimals} decimal place${decimals === 1 ? "" : "s"}` : ""}. The matching range is picked automatically.`
          : value === null
            ? "That isn't a number."
            : tooPrecise
              ? `This bet is measured to ${decimals} decimal place${decimals === 1 ? "" : "s"}.`
              : hit
                ? <>
                    {shown} falls in <b>{hit.label}</b>.
                  </>
                : `${shown} is outside every range, so everyone gets their coins back.`}
      </p>
      <ConfirmButton
        className="btn"
        disabled={value === null || tooPrecise}
        label={value === null || tooPrecise ? "Settle" : `Settle at ${shown}`}
        confirm={hit ? `Confirm ${shown} → ${hit.label}` : `Confirm ${shown} (refund everyone)`}
        onConfirm={() => api.resolveValue(s.id, bet.id, value!, hit ? `Result ${shown}: ${hit.label} wins.` : `Result ${shown}: outside every range, coins returned.`)}
      />
    </div>
  );
}

function HostPanel({ s, bet }: { s: Series; bet: Bet }) {
  const { api } = useStore();
  if (bet.status !== "open" && bet.status !== "closed") return null;
  const { list } = shares(bet);
  const binary = bet.kind === "binary";
  return (
    <Panel label="Host controls">
      <div className="stack">
        {bet.status === "open" && (
          <>
            <button type="button" className="btn" onClick={() => api.lockBet(s.id, bet.id, "Betting locked.")}>
              Lock betting
            </button>
            <p className="hint">Stops new wagers. If every coin is on one {bet.kind === "range" ? "range" : "outcome"}, locking refunds them right away.</p>
          </>
        )}
        <span className="cap">Resolve: what happened?</span>
        {bet.kind === "range" ? (
          <RangeSettle s={s} bet={bet} />
        ) : (
        <div className={binary ? "resolve-grid" : "resolve-list"}>
          {list.map((o, i) => (
            <ConfirmButton
              key={o.id}
              className={binary ? (i === 0 ? "y" : "n") : "oc"}
              style={binary ? undefined : ocStyle(o.color)}
              label={binary ? (i === 0 ? "Yes" : "No") : o.label}
              confirm={`Confirm ${o.label}`}
              onConfirm={() => api.resolveBet(s.id, bet.id, o.id, `Resolved: ${o.label}.`)}
            />
          ))}
        </div>
        )}
        {bet.kind === "multi" && <TieReport s={s} bet={bet} />}
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
  const { total, list } = shares(bet);
  const top = leader(bet);
  const now = useNow(1000) + skew;
  const until = withdrawUntil(bet, s.settings);
  const playing = isParticipant(s, me);
  const index = s.bets.indexOf(bet) + 1;
  const binary = bet.kind === "binary";
  const winner = list.find((o) => o.id === bet.outcomeId);
  const tied = bet.tiedOutcomeIds ?? [];

  return (
    <>
      <section className="bhead">
        <div>
          <span className="row">
            <Pill kind={bet.status}>{bet.status === "closed" ? "Betting locked" : bet.status}</Pill>
            <span className="cap">
              Bet {index} of {s.settings.betCount}
              {bet.kind === "multi" && ` · ${bet.outcomes.length} options`}
              {bet.kind === "range" && ` · ${bet.outcomes.length} ranges${bet.unit ? ` in ${bet.unit}` : ""}`}
            </span>
          </span>
          <h1 style={{ marginTop: 14 }}>{bet.question}</h1>
          <div className="sub">
            <span>
              Pool <b className="num">{fmt(total)}</b>
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
          {bet.kind === "multi" && <p className="hint" style={{ marginTop: 8 }}>{TIE_RULE_TEXT[bet.tieRule]}</p>}
          {bet.kind === "range" && (
            <p className="hint" style={{ marginTop: 8 }}>
              Each range includes its lower number and stops just before the next. The host enters the measured result
              {bet.decimals ? ` (to ${bet.decimals} decimal place${bet.decimals === 1 ? "" : "s"})` : ""} and the range holding it wins.
            </p>
          )}
        </div>
        {(bet.status === "open" || bet.status === "closed") && (
        <div className="readout" title="Share of the coins in the pool, not a probability">
          <div className="v">
            {!total ? "–" : binary ? list[0].pct : top!.pct}
            {total > 0 && <small>%</small>}
          </div>
          <span className="cap">{!total ? "no coins yet" : binary ? "of the pool on yes" : `of the pool on ${top!.label}`}</span>
        </div>
        )}
      </section>

      <div className="grid2">
        <div className="col">
          {bet.status === "resolved" && (
            <Panel className="outcome-banner-wrap" bodyClass="outcome-banner">
              <span className="o otag" style={winner ? ocStyle(winner.color) : undefined}>
                {winner ? winner.label : tied.length ? "Tie" : "Refunded"}
              </span>
              <span className="lead">
                {bet.kind === "range" && bet.resultValue != null
                  ? `Result: ${fmtValue(Number(bet.resultValue), bet.unit ?? "", bet.decimals ?? 0)}. ` +
                    (!winner
                      ? "That's outside every range, so every coin went back."
                      : bet.refunded
                        ? "Nobody was on another range, so every coin went back."
                        : "Winners split the pool in proportion to their stakes.")
                  : tied.length
                  ? bet.outcomeId
                    ? `${tied.map((id) => labelOf(bet, id)).join(" and ")} tied. ${labelOf(bet, bet.outcomeId)} was listed first, so it wins.` +
                      (bet.refunded ? " Nobody was on it alone, so every coin went back." : "")
                    : `${tied.map((id) => labelOf(bet, id)).join(" and ")} tied, so every coin went back.`
                  : bet.refunded
                    ? bet.outcomeId
                      ? "Nobody was on another outcome, so every coin went back."
                      : "Every coin was on one outcome when betting locked, so it all went back."
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
            <div className={`sides ${binary ? "" : "many"}`}>
              {list.map((o) => (
                <OutcomeColumn key={o.id} bet={bet} id={o.id} />
              ))}
            </div>
          </Panel>
          {bet.results && bet.status === "resolved" && (
            <Panel label="Payouts" right={resultText(bet)}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Pick</th>
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
                      <td>
                        <OutcomeTag bet={bet} id={r.outcomeId} strong={false} />
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
