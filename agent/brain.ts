/**
 * What Bookie understands in a text, and what it says back. No SDK and no network here,
 * so it's fast and testable: index.ts feeds it messages from Photon Spectrum, and
 * bookie.ts does the database calls.
 */

export type Intent =
  | { kind: "help" }
  | { kind: "link"; code: string }
  | { kind: "unlink" }
  | { kind: "bets" }
  | { kind: "board" }
  | { kind: "coins" }
  | { kind: "wager"; amount: number | "all"; outcome: string; pick?: number }
  | { kind: "unknown"; text: string };

// ---------- understanding ----------

const WAKE = /^(?:hey\s+|yo\s+|ok\s+)?@?bookie[\s,:!-]*/i;

/**
 * Read one text. In a group chat Bookie only answers when it's addressed ("bookie …")
 * or the text is clearly a command, so it never talks over the friends' own chat;
 * then this returns null.
 */
export function parse(raw: string, inGroup: boolean): Intent | null {
  const original = raw.trim();
  const addressed = WAKE.test(original);
  const text = original.replace(WAKE, "").trim().replace(/[.!]+$/, "").replace(/\s+/g, " ");
  const t = text.toLowerCase();
  const intent = command(t, text);
  if (intent) return intent;
  if (inGroup && !addressed) return null;
  if (!t) return { kind: "help" };
  return { kind: "unknown", text };
}

function command(t: string, text: string): Intent | null {
  if (/^(help|hi|hello|hey|start|commands|menu|\?|what can you do\??)$/.test(t)) return { kind: "help" };
  const link = t.match(/^link\s+([a-z0-9]{6,12})$/);
  if (link) return { kind: "link", code: link[1].toUpperCase() };
  if (/^(unlink|disconnect|stop|log ?out)$/.test(t)) return { kind: "unlink" };
  if (/^(bets|open|open bets|odds|markets|list|what'?s open\??|show bets)$/.test(t)) return { kind: "bets" };
  if (/^(board|standings|leaderboard|ranks?|scores?|who'?s winning\??)$/.test(t)) return { kind: "board" };
  if (/^(coins|balance|bal|wallet|money|how much do i have\??)$/.test(t)) return { kind: "coins" };
  return wager(t, text);
}

/** "bet 50 on yes #2", "put 100 on Jake", "50 on no for 1", "bet all on yes" */
function wager(t: string, text: string): Intent | null {
  const m = t.match(/^(?:bet|put|wager|stake|place)\s+(\d[\d,]*|all)\s+(?:coins?\s+)?(?:on\s+)?(.+)$/) ?? t.match(/^(\d[\d,]*)\s+(?:coins?\s+)?on\s+(.+)$/);
  if (!m) return null;
  const amount = m[1] === "all" ? "all" : Number(m[1].replace(/,/g, ""));
  if (amount !== "all" && (!Number.isSafeInteger(amount) || amount < 1)) return null;
  // Keep the outcome's original capitals ("Jake"), cut a trailing bet number.
  let rest = text.slice(text.length - m[2].length);
  let pick: number | undefined;
  const tail = rest.match(/\s*(?:(?:on|for|in)\s+)?(?:bet\s+)?#\s*(\d{1,2})$|\s+(?:on|for|in)\s+(?:bet\s+)?(\d{1,2})$/i);
  if (tail) {
    pick = Number(tail[1] ?? tail[2]);
    rest = rest.slice(0, rest.length - tail[0].length);
  }
  const outcome = rest.trim().replace(/^["“']|["”']$/g, "");
  if (!outcome) return null;
  return { kind: "wager", amount, outcome, pick };
}

// ---------- the state Bookie reads (a slice of my_series_state) ----------

export type Outcome = { id: string; label: string; pool: number };
export type Wager = { userId: string; outcomeId?: string | null; amount: number };
export type Bet = { id: string; question: string; status: string; kind?: string; closesAt?: string | null; outcomes: Outcome[]; wagers: Wager[] };
export type Member = { userId: string; name: string; plays?: boolean };
export type Standing = { userId: string; rank: number; coins: number; available: number; atStake?: number; losing?: boolean };
export type Series = { id: string; name: string; status: string; members: Member[]; standings: Standing[]; bets: Bet[]; settings?: { losers?: number } };
export type State = { linked: boolean; me?: { id: string; name: string }; series?: Series[] };
export type Receipt = { outcome?: string; amount: number; totalStake: number; available: number; replayed?: boolean };

/** What index.ts gives the brain: the database calls, already bound to this sender. */
export type Bookie = {
  state(): Promise<State>;
  link(code: string): Promise<{ name: string }>;
  unlink(): Promise<boolean>;
  wager(seriesId: string, betId: string, outcomeId: string, amount: number): Promise<Receipt>;
};

/** A rule said no: the message is already written for players (it comes from the SQL). */
export class Refusal extends Error {}

export type Options = {
  appUrl?: string;
  /** Free text → a command, by a language model. Optional; null when it can't tell. */
  interpret?: (text: string) => Promise<Intent | null>;
  now?: number;
};

// ---------- answering ----------

const fmt = (n: number) => n.toLocaleString("en-US");
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};
function until(iso: string, now: number) {
  const m = Math.round((Date.parse(iso) - now) / 60_000);
  if (m <= 0) return "closing now";
  if (m < 60) return `closes in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `closes in ${h}h${m % 60 ? ` ${m % 60}m` : ""}`;
  return `closes in ${Math.floor(h / 24)}d`;
}

export function helpText(appUrl?: string) {
  return [
    "Hi, I'm Bookie 🎲 Bet with your friends right here in your texts.",
    "",
    "• bets: what's open, with the odds",
    "• bet 50 on yes #1: place a wager",
    "• board: who's winning",
    "• coins: what you have left",
    "",
    `New here? Open Bookie${appUrl ? ` (${appUrl})` : ""} → Profile → Text Bookie, get a code, and text me: link CODE`,
  ].join("\n");
}

const notLinked = (appUrl?: string) =>
  `I don't know who you are yet. Open Bookie${appUrl ? ` (${appUrl})` : ""} → Profile → Text Bookie, get a code, then text me: link CODE`;

type OpenBet = { series: Series; bet: Bet; n: number };

/** Open bets you can wager on, soonest to close first, numbered 1, 2, 3… (the same order every time). */
export function openBets(state: State, now = Date.now()): OpenBet[] {
  const me = state.me?.id;
  const list: Omit<OpenBet, "n">[] = [];
  for (const s of state.series ?? []) {
    if (s.status !== "active") continue;
    if (!s.members.some((m) => m.userId === me && m.plays !== false)) continue;
    for (const b of s.bets) {
      if (b.status !== "open") continue;
      if (b.closesAt && Date.parse(b.closesAt) <= now) continue;
      list.push({ series: s, bet: b });
    }
  }
  list.sort((a, b) => (Date.parse(a.bet.closesAt ?? "9999-12-31") - Date.parse(b.bet.closesAt ?? "9999-12-31")) || a.bet.question.localeCompare(b.bet.question));
  return list.map((x, i) => ({ ...x, n: i + 1 }));
}

function odds(b: Bet) {
  const total = b.outcomes.reduce((a, o) => a + o.pool, 0);
  if (!total) return "no coins in yet";
  return b.outcomes.map((o) => `${o.label} ${Math.round((o.pool / total) * 100)}%`).join(" · ") + ` · pool ${fmt(total)}`;
}

function describe(x: OpenBet, me: string | undefined, now: number) {
  const mine = x.bet.wagers.find((w) => w.userId === me);
  const mineLabel = mine && x.bet.outcomes.find((o) => o.id === mine.outcomeId)?.label;
  return [
    `${x.n}. ${x.bet.question} (${x.series.name})`,
    `   ${odds(x.bet)}${x.bet.closesAt ? ` · ${until(x.bet.closesAt, now)}` : ""}`,
    ...(mine ? [`   You: ${fmt(mine.amount)} on ${mineLabel ?? "your pick"}`] : []),
  ].join("\n");
}

function listText(list: OpenBet[], me: string | undefined, now: number) {
  if (!list.length) return "No open bets right now. When your host opens one, text me \"bets\".";
  const example = list[0].bet.outcomes[0]?.label.toLowerCase() ?? "yes";
  return ["Open bets:", ...list.slice(0, 9).map((x) => describe(x, me, now)), "", `Reply like: bet 50 on ${example} #1`].join("\n");
}

/** The outcome a player meant: exact label, then a unique prefix, then y/n for YES/NO. */
export function matchOutcome(bet: Bet, said: string): Outcome | null {
  const s = said.trim().toLowerCase();
  const exact = bet.outcomes.filter((o) => o.label.toLowerCase() === s);
  if (exact.length === 1) return exact[0];
  const prefix = bet.outcomes.filter((o) => o.label.toLowerCase().startsWith(s));
  if (prefix.length === 1) return prefix[0];
  if (s === "y" || s === "yep" || s === "yeah") return bet.outcomes.find((o) => o.label.toLowerCase() === "yes") ?? null;
  if (s === "n" || s === "nope" || s === "nah") return bet.outcomes.find((o) => o.label.toLowerCase() === "no") ?? null;
  return null;
}

/** Roughly what this stake pays if it wins, from the pool right now (winners split the pool by stake). */
function payoutIfWins(bet: Bet, outcome: Outcome, me: string | undefined, add: number) {
  const total = bet.outcomes.reduce((a, o) => a + o.pool, 0) + add;
  const side = outcome.pool + add;
  const mine = (bet.wagers.find((w) => w.userId === me && w.outcomeId === outcome.id)?.amount ?? 0) + add;
  return side > 0 ? Math.floor((mine * total) / side) : 0;
}

async function placeWager(intent: Extract<Intent, { kind: "wager" }>, bookie: Bookie, state: State, now: number) {
  const me = state.me?.id;
  const list = openBets(state, now);
  if (!list.length) return "There's nothing open to bet on right now.";
  let target: OpenBet | undefined;
  if (intent.pick !== undefined) {
    target = list.find((x) => x.n === intent.pick);
    if (!target) return `There's no bet #${intent.pick}. ${listText(list, me, now)}`;
  } else if (list.length === 1) {
    target = list[0];
  } else {
    // No number: fine if exactly one open bet has an outcome with that name ("bet 20 on Jake").
    const hits = list.filter((x) => matchOutcome(x.bet, intent.outcome) && !/^(yes|no|y|n)$/i.test(intent.outcome));
    if (hits.length === 1) target = hits[0];
    else return `Which bet? Add its number, like: bet ${intent.amount} on ${intent.outcome} #1\n\n${listText(list, me, now)}`;
  }
  const outcome = matchOutcome(target.bet, intent.outcome);
  if (!outcome) {
    return `"${intent.outcome}" isn't an option on #${target.n}. Pick one of: ${target.bet.outcomes.map((o) => o.label).join(", ")}`;
  }
  const standing = target.series.standings.find((r) => r.userId === me);
  const amount = intent.amount === "all" ? standing?.available ?? 0 : intent.amount;
  if (amount < 1) return "You don't have any free coins in that series.";
  const win = payoutIfWins(target.bet, outcome, me, amount);
  const r = await bookie.wager(target.series.id, target.bet.id, outcome.id, amount);
  if (r.replayed) return `Already got that one: ${fmt(amount)} on ${outcome.label}. You have ${fmt(r.available)} coins free.`;
  return [
    `✅ ${fmt(amount)} on ${outcome.label}: ${target.bet.question}`,
    `${r.totalStake > amount ? `That's ${fmt(r.totalStake)} on ${outcome.label} in total. ` : ""}If ${outcome.label} wins you'd get about ${fmt(win)}, based on the pool right now.`,
    `${fmt(r.available)} coins free in ${target.series.name}.`,
  ].join("\n");
}

function boardText(state: State) {
  const me = state.me?.id;
  const live = (state.series ?? []).filter((s) => s.status === "active" || s.status === "assigning");
  if (!live.length) return "You're not in a running series. Start one in the app, or ask a friend for their invite link.";
  return live
    .slice(0, 3)
    .map((s) => {
      const name = (id: string) => (id === me ? "You" : s.members.find((m) => m.userId === id)?.name ?? "Player");
      const mine = s.standings.find((r) => r.userId === me);
      const head = mine ? `${s.name}: you're ${ordinal(mine.rank)} of ${s.standings.length}${mine.losing ? " (in the losing spot 😬)" : ""}` : s.name;
      const rows = s.standings.slice(0, 5).map((r) => `${r.rank}. ${name(r.userId)} ${fmt(r.coins)}${r.losing ? " 🔻" : ""}`);
      return [head, ...rows].join("\n");
    })
    .join("\n\n");
}

function coinsText(state: State) {
  const me = state.me?.id;
  const rows = (state.series ?? [])
    .filter((s) => s.status === "active")
    .map((s) => ({ s, r: s.standings.find((x) => x.userId === me) }))
    .filter((x) => x.r);
  if (!rows.length) return "You're not playing in a running series right now.";
  return rows.map(({ s, r }) => `${s.name}: ${fmt(r!.available)} free${r!.atStake ? `, ${fmt(r!.atStake)} in play` : ""}`).join("\n");
}

/** One reply for one intent. Never throws for things players do; refusals come back as text. */
export async function respond(intent: Intent, bookie: Bookie, opts: Options = {}): Promise<string> {
  const now = opts.now ?? Date.now();
  try {
    if (intent.kind === "help") return helpText(opts.appUrl);
    if (intent.kind === "link") {
      const r = await bookie.link(intent.code);
      return `You're in, ${r.name}! 🎉 This number now plays as you. Text "bets" to see what's open.`;
    }
    if (intent.kind === "unlink") {
      return (await bookie.unlink()) ? "Done. This number isn't linked to Bookie any more." : "This number wasn't linked.";
    }
    if (intent.kind === "unknown") {
      const guess = opts.interpret ? await opts.interpret(intent.text).catch(() => null) : null;
      if (guess && guess.kind !== "unknown") return respond(guess, bookie, { ...opts, interpret: undefined });
      return `Not sure what you mean. Try "bets", "bet 50 on yes #1", "board" or "coins".`;
    }
    const state = await bookie.state();
    if (!state.linked) return notLinked(opts.appUrl);
    if (intent.kind === "bets") return listText(openBets(state, now), state.me?.id, now);
    if (intent.kind === "board") return boardText(state);
    if (intent.kind === "coins") return coinsText(state);
    return await placeWager(intent, bookie, state, now);
  } catch (err) {
    if (err instanceof Refusal) return err.message;
    throw err;
  }
}
