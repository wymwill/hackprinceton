import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { JoinModal, Shell } from "../components/Shell.tsx";
import { Panel } from "../components/ui.tsx";
import { fmt, signed } from "../lib/format.ts";
import { isParticipant } from "../lib/rules.ts";
import { useStore } from "../lib/store.tsx";
import type { Id, Series } from "../lib/types.ts";

/* ───────────────────────── 1. Your first bet, for real ───────────────────────── */

type Step = { title: string; how: ReactNode; done: boolean; action?: ReactNode };

/** The five steps to a first bet, ticked off from the player's real data. */
export function useFirstBetSteps(onJoin: () => void = () => {}): Step[] {
  const { db, me } = useStore();
  return useMemo(() => {
    const list = db.series;
    const playing = list.filter((s) => isParticipant(s, me));
    const lobby = playing.find((s) => s.status === "lobby");
    const live = playing.find((s) => s.status === "active");
    const started = playing.some((s) => s.status !== "lobby");
    const myWager = playing.some((s) => s.bets.some((b) => b.wagers.some((w) => w.userId === me)));
    const settled = playing.some((s) => s.bets.some((b) => b.results?.some((r) => r.userId === me)));
    const needsPunishment = (s: Series) => s.settings.mode !== "money" && !s.favors.some((f) => f.authorId === me);
    const go = (s: Series | undefined, label: string) =>
      s ? <Link className="btn sm primary" to={`/s/${s.id}`}>{label} in {s.name} →</Link> : null;
    const openBet = live?.bets.find((b) => b.status === "open" && !b.wagers.some((w) => w.userId === me));

    return [
      {
        title: "Get into a series",
        how: "A series is a set of YES/NO (or multiple-choice, or range) bets played with friends for virtual coins. Start one, or join a friend's with their invite code or link.",
        done: list.length > 0,
        action: (
          <span className="row wrap">
            <Link className="btn sm primary" to="/new">Start a series</Link>
            <button type="button" className="btn sm" onClick={onJoin}>Join with a code</button>
          </span>
        ),
      },
      {
        title: "Add your punishment",
        how: "Before betting starts, everyone puts in what they'd do if they lose: into a shared pool, or a pledge of their own. (Real-money series skip this.)",
        done: started || (playing.length > 0 && playing.some((s) => !needsPunishment(s))),
        action: go(lobby, "Add it"),
      },
      {
        title: "Say you're ready",
        how: "Read the rules and tick \"I'm ready\". In a shared pool that also agrees to every punishment in it. The host can start once everyone is ready.",
        done: started || playing.some((s) => s.members.find((m) => m.userId === me)?.ready),
        action: go(lobby, "Get ready"),
      },
      {
        title: "Place your first bet",
        how: "Open a bet, pick a side, choose how many coins. The ticket shows what you'd win if your side wins. You can add more later, but you can't switch sides (except by withdrawing in the first few minutes, if the series allows it).",
        done: myWager,
        action: live && openBet ? <Link className="btn sm primary" to={`/s/${live.id}/bets/${openBet.id}`}>Bet on “{openBet.question}” →</Link> : go(live, "Bet"),
      },
      {
        title: "See your first result",
        how: "The host calls each bet. Winners split the whole pool by how much they put in, and the leaderboard moves. Try the practice bet on this page to see exactly how.",
        done: settled,
        action: go(live, "Check your bets"),
      },
    ];
  }, [db, me, onJoin]);
}

function FirstBet({ onJoin }: { onJoin: () => void }) {
  const steps = useFirstBetSteps(onJoin);
  const doneCount = steps.filter((s) => s.done).length;
  const current = steps.findIndex((s) => !s.done);
  return (
    <Panel label="Your first bet" right={doneCount === steps.length ? "Done! 🎉" : `${doneCount} of ${steps.length} done`}>
      <div className="tut-progress" aria-hidden="true">
        <i style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="tut-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={s.done ? "done" : i === current ? "current" : ""}>
            <span className="tut-dot">{s.done ? "✓" : i + 1}</span>
            <div>
              <b>{s.title}</b>
              {(i === current || !s.done) && <p className="hint">{s.how}</p>}
              {i === current && s.action && <div style={{ marginTop: 10 }}>{s.action}</div>}
            </div>
          </li>
        ))}
      </ol>
      {current === -1 && <p className="notice ok"><b>You've done it all.</b> Keep betting, or start a series with your clan.</p>}
    </Panel>
  );
}

/* ───────────────────────── 2. A practice bet (nothing is saved) ───────────────────────── */

type Side = "yes" | "no";
type PracticeWager = { who: string; side: Side; amount: number };
const FRIENDS: PracticeWager[] = [
  { who: "Ben", side: "yes", amount: 120 },
  { who: "Cat", side: "no", amount: 200 },
  { who: "Dan", side: "no", amount: 80 },
];
const START = 1000;

/** Same rule as the server: winners split the whole pool by stake; leftovers from rounding go to the biggest stakes. */
function settle(wagers: PracticeWager[], outcome: Side) {
  const total = wagers.reduce((a, w) => a + w.amount, 0);
  const winPool = wagers.filter((w) => w.side === outcome).reduce((a, w) => a + w.amount, 0);
  if (winPool === 0 || winPool === total) return { refunded: true, rows: wagers.map((w) => ({ ...w, paid: w.amount })) };
  const rows = wagers.map((w) => ({ ...w, paid: w.side === outcome ? Math.floor((w.amount * total) / winPool) : 0 }));
  let left = total - rows.reduce((a, r) => a + r.paid, 0);
  for (const r of [...rows].filter((x) => x.side === outcome).sort((a, b) => b.amount - a.amount)) if (left-- > 0) r.paid += 1;
  return { refunded: false, rows };
}

function Practice() {
  const [stage, setStage] = useState<"pick" | "placed" | "locked" | "settled">("pick");
  const [side, setSide] = useState<Side>("yes");
  const [amount, setAmount] = useState(100);
  const [outcome, setOutcome] = useState<Side>("yes");
  const mine: PracticeWager = { who: "You", side, amount: Math.max(0, Math.floor(amount) || 0) };
  const all = stage === "pick" ? FRIENDS : [...FRIENDS, mine];
  const pool = (s: Side) => all.filter((w) => w.side === s).reduce((a, w) => a + w.amount, 0);
  const preview = settle([...FRIENDS, mine], side).rows.find((r) => r.who === "You")!.paid;
  const result = stage === "settled" ? settle(all, outcome) : null;
  const yes = pool("yes");
  const no = pool("no");
  const pct = yes + no ? Math.round((yes / (yes + no)) * 100) : 50;
  const reset = () => {
    setStage("pick");
    setAmount(100);
  };

  return (
    <Panel label="Practice bet" right="Pretend coins · nothing is saved">
      <div className="tut-practice">
        <div>
          <span className="cap">Step {stage === "pick" ? 1 : stage === "placed" ? 2 : stage === "locked" ? 3 : 4} of 4</span>
          <h3 className="tut-q">Will it rain tomorrow?</h3>
          <div className={`pbar ${yes + no ? "" : "empty"}`} aria-label={`${pct}% of coins on YES`}>
            <i className="y" style={{ width: `${pct}%` }} />
            <i className="n" />
          </div>
          <div className="people" style={{ marginTop: 10 }}>
            {all.map((w) => (
              <div key={w.who} className="person">
                <span className={w.who === "You" ? "bright" : ""}>{w.who}</span>
                <span className={`num ${w.side === "yes" ? "yes-t" : "no-t"}`}>{fmt(w.amount)} {w.side.toUpperCase()}</span>
              </div>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            Pool: <b className="num">{fmt(yes + no)}</b> coins · {pct}% on YES. Everyone can see who's on what.
          </p>
        </div>

        <div className="stack">
          {stage === "pick" && (
            <>
              <p className="tut-say">You start with {fmt(START)} coins. Pick a side and how much to put on it.</p>
              <div className="seg">
                <button type="button" className={side === "yes" ? "on yes" : ""} onClick={() => setSide("yes")}>Yes</button>
                <button type="button" className={side === "no" ? "on no" : ""} onClick={() => setSide("no")}>No</button>
              </div>
              <label className="field">
                <span>Coins</span>
                <input className="input" type="number" min={1} max={START} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
              </label>
              <div className="row wrap">
                {[50, 100, 250, 500].map((n) => (
                  <button key={n} type="button" className="btn sm" onClick={() => setAmount(n)}>{n}</button>
                ))}
              </div>
              <div>
                <div className="kv">If {side.toUpperCase()} wins you get <b>{fmt(preview)}</b></div>
                <div className="kv">Profit <b>{signed(preview - mine.amount)}</b></div>
              </div>
              <p className="hint">
                Fewer coins on your side means a bigger share if you're right. This estimate moves as others bet.
              </p>
              <button type="button" className="btn primary block" disabled={mine.amount < 1 || mine.amount > START} onClick={() => setStage("placed")}>
                Place practice bet: {fmt(mine.amount)} on {side.toUpperCase()}
              </button>
            </>
          )}
          {stage === "placed" && (
            <>
              <p className="tut-say">
                You're in with <b>{fmt(mine.amount)}</b> on <b>{side.toUpperCase()}</b>. You could add more to your side any
                time betting is open, but not switch. In most series you can take a wager back during the first few
                minutes after a bet opens.
              </p>
              <p className="tut-say">Now pretend you're the host. When the moment arrives, the host locks betting.</p>
              <button type="button" className="btn primary block" onClick={() => setStage("locked")}>Lock betting (as the host)</button>
            </>
          )}
          {stage === "locked" && (
            <>
              <p className="tut-say">Betting is locked. The host calls the result, even if they bet on it themselves. Did it rain?</p>
              <div className="seg">
                <button type="button" className="on yes" onClick={() => { setOutcome("yes"); setStage("settled"); }}>It rained: YES</button>
                <button type="button" className="on no" onClick={() => { setOutcome("no"); setStage("settled"); }}>Dry: NO</button>
              </div>
            </>
          )}
          {stage === "settled" && result && (
            <>
              <p className="tut-say">
                <b>{outcome.toUpperCase()}</b> wins.{" "}
                {result.refunded
                  ? "Everyone was on one side, so every coin went back."
                  : `The ${outcome.toUpperCase()} side splits the whole ${fmt(yes + no)}-coin pool by stake.`}
              </p>
              <table className="table">
                <thead><tr><th>Player</th><th className="r">Stake</th><th className="r">Paid</th><th className="r">Net</th></tr></thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.who} className={r.who === "You" ? "me" : ""}>
                      <td>{r.who}</td>
                      <td className="r num">{fmt(r.amount)}</td>
                      <td className="r num">{fmt(r.paid)}</td>
                      <td className={`r num ${r.paid > r.amount ? "up" : r.paid < r.amount ? "down" : "dim"}`}>{signed(r.paid - r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint">
                You'd now have <b className="num">{fmt(START - mine.amount + result.rows.find((r) => r.who === "You")!.paid)}</b> coins.
                The leaderboard ranks everyone by coins, and the bottom players at the end owe a punishment.
              </p>
              <button type="button" className="btn block" onClick={reset}>Try it again</button>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

/* ───────────────────────── 3. Every feature ───────────────────────── */

type Feature = { id: Id; title: string; tag: string; body: ReactNode; to?: string; cta?: string };

const FEATURES: Feature[] = [
  {
    id: "series", tag: "Basics", title: "Series and modes", to: "/new", cta: "Start a series",
    body: (
      <>
        <p>A <b>series</b> is a set of bets played over days or weeks. Everyone starts with the same coins; the host sets how many bets, the starting coins and how many players lose (the bottom X).</p>
        <p>Pick a mode: <b>C · Shared punishment pool</b> (winners choose punishments for losers from a pool everyone fills), <b>B · Self-pledged</b> (each player pledges their own), or <b>A · Real money</b> (recorded only; nothing is charged).</p>
      </>
    ),
  },
  {
    id: "lobby", tag: "Basics", title: "The lobby",
    body: (
      <>
        <p>Before betting starts, the series sits in its lobby. Share the <b>invite code or link</b>; friends sign in and join.</p>
        <p>Everyone adds a punishment, reviews the others (<b>Agree</b> on each, or tick <b>I'm ready</b> to agree to all), and says they're ready. Any change to the pool un-readies everyone. The host can remove players, and anyone can leave, until the host presses <b>Start betting</b>. Starting hands out the coins and locks the rules.</p>
      </>
    ),
  },
  {
    id: "types", tag: "Betting", title: "Three kinds of bets",
    body: (
      <>
        <p><b>Yes / No:</b> the classic. <b>Multiple choice:</b> two or more options; the host decides what happens on a tie (refund everyone, or the option listed first wins). <b>Numerical range:</b> guess which range a number lands in (like 70–74°F); the host enters the real value and the matching range wins.</p>
      </>
    ),
  },
  {
    id: "wager", tag: "Betting", title: "Placing a wager",
    body: (
      <>
        <p>Open a bet, pick an option and an amount. The ticket estimates what you'd get back if you win. You can <b>add more</b> to your side while betting is open, but you can't switch. If the series allows it, you can <b>withdraw</b> your whole wager during the first few minutes after a bet opens (that's the only way to switch).</p>
        <p>Everyone can see who's on what. That's half the fun.</p>
      </>
    ),
  },
  {
    id: "host", tag: "Hosting", title: "Host controls",
    body: (
      <>
        <p>The host writes the bets (all before start, or some during the series), <b>locks</b> betting when it's time, and <b>calls the result</b>, even on bets they played. <b>Cancel</b> refunds everyone. If everyone picked the same side, coins go back automatically.</p>
        <p>The series ends by itself after the last bet, or the host can end it once nothing is open.</p>
      </>
    ),
  },
  {
    id: "payouts", tag: "Betting", title: "How payouts work",
    body: <p>Winners split the <b>whole pool</b> in proportion to their stake. Put in 200 of the 300 on the winning side and you get two-thirds of everything. Rounding leftovers go to the biggest winning stakes, so no coin is ever lost. The practice bet above shows it step by step.</p>,
  },
  {
    id: "board", tag: "Results", title: "Leaderboard and ties",
    body: <p>Players are ranked by coins after each settled bet (open wagers don't count until they settle). Ties go to whoever reached that score first, or to an order drawn at random, depending on the series. Below the dashed line are the bottom X, who lose.</p>,
  },
  {
    id: "end", tag: "Results", title: "Punishments at the end",
    body: <p>In a shared pool, 1st place picks a punishment for last place, 2nd for second-to-last, and so on, from punishments that player agreed to. In pledge mode, losers do their own pledge. Losers mark theirs <b>done</b> when it's done.</p>,
  },
  {
    id: "moves", tag: "Getting around", title: "Home: your bets and your moves", to: "/", cta: "Go home",
    body: (
      <>
        <p><b>Home</b> is your dashboard across every series. <b>Your bets</b> sorts them into <b>Bet now</b> (open bets you haven't joined), <b>In play</b> (where you have coins riding) and <b>Settled</b> (recent results).</p>
        <p>Beside it, <b>Your moves</b> lists everything you can do right now: bets to place, punishments to review, results to call, picks to make. The number next to <b>Home</b> in the sidebar counts them. <b>All series</b> lists every series you're in.</p>
      </>
    ),
  },
  {
    id: "house", tag: "Getting around", title: "The House",
    body: <p>The House is a running commentary on each bet: who just put coins where, and what the result means. You can dismiss a comment or turn The House off.</p>,
  },
  {
    id: "friends", tag: "Social", title: "Friends", to: "/friends", cta: "Add friends",
    body: <p>Share your friend code, link or QR code; when a friend opens it, you're connected.</p>,
  },
  {
    id: "clans", tag: "Social", title: "Clans, chat and series with your clan", to: "/clans", cta: "Open clans",
    body: (
      <>
        <p>A clan is your friend group. Create one or join with a code; clans have a <b>chat</b> and compete on the <b>clan leaderboard</b> by coins wagered. You can be in several.</p>
        <p>On a clan's page, <b>Start a series with this clan</b> fills in the setup for you and puts every member in the lobby.</p>
      </>
    ),
  },
  {
    id: "profile", tag: "Social", title: "Profile and looks", to: "/profile", cta: "Edit profile",
    body: <p>Set your name and photo, and switch between light and dark mode from the sidebar.</p>,
  },
];

function Features() {
  const [open, setOpen] = useState<Id | null>("series");
  const [tag, setTag] = useState<string>("All");
  const tags = ["All", ...new Set(FEATURES.map((f) => f.tag))];
  const shown = FEATURES.filter((f) => tag === "All" || f.tag === tag);
  return (
    <Panel label="Every feature" right={`${FEATURES.length} topics`}>
      <div className="seg tut-tags" role="tablist">
        {tags.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tag === t} className={tag === t ? "on" : ""} onClick={() => setTag(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="tut-acc">
        {shown.map((f) => {
          const isOpen = open === f.id;
          return (
            <section key={f.id} className={isOpen ? "open" : ""}>
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : f.id)}>
                <span>{f.title}</span>
                <span className="cap">{f.tag}</span>
                <span aria-hidden="true" className="tut-chev">{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen && (
                <div className="tut-body">
                  {f.body}
                  {f.to && <Link className="btn sm" to={f.to}>{f.cta} →</Link>}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </Panel>
  );
}

/* ───────────────────────── The page ───────────────────────── */

export default function Tutorial() {
  const [joining, setJoining] = useState(false);
  const join = useCallback(() => setJoining(true), []);
  return (
    <Shell crumbs={[{ label: "Tutorial" }]}>
      <section className="hero">
        <div>
          <h1>
            How <em>Alea</em> works
          </h1>
          <p>Friends bet on YES/NO questions with virtual coins over a whole series. Whoever ends with the fewest coins owes a punishment. Here's every part of it, a practice bet, and a checklist for your first real one.</p>
        </div>
      </section>
      <div className="grid2 tut-top">
        <FirstBet onJoin={join} />
        <Practice />
      </div>
      <Features />
      {joining && <JoinModal onClose={() => setJoining(false)} />}
    </Shell>
  );
}
