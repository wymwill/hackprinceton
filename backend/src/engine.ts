/**
 * The rules of a Bet Series, as pure functions over a plain JSON database.
 *
 * Commands take the database, the acting user and a clock, change the database
 * in place, and throw a RuleError with a readable message when a rule says no.
 * The store runs every command on a copy, so a thrown error changes nothing.
 * Views (balances, standings, pools) are derived, never stored.
 */
import type {
  Assignment, Bet, BetResult, Db, Favor, Id, Series, Settings, Side, User, Wager,
} from "./types.ts";

export class RuleError extends Error {}
function fail(message: string): never {
  throw new RuleError(message);
}

export const DEFAULT_SETTINGS: Settings = {
  betCount: 5,
  losers: 1,
  startingCoins: 1000,
  mode: "pool",
  minContribution: 5,
  favorsPerPlayer: 2,
  exclusivePool: true,
  tiebreak: "first",
  betCreation: "during",
  withdrawMinutes: 15,
  hostPlays: true,
};

const iso = (now: number) => new Date(now).toISOString();
let seq = 0;
export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode(db: Db, rng: () => number) {
  for (;;) {
    let code = "";
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
    if (!db.series.some((s) => s.code === code)) return code;
  }
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : NaN);
function inRange(v: unknown, lo: number, hi: number, label: string) {
  const n = int(v);
  if (Number.isNaN(n) || n < lo || n > hi) fail(`${label} must be a whole number from ${lo.toLocaleString()} to ${hi.toLocaleString()}.`);
  return n;
}

export const nameOf = (db: Db, id: Id) => db.users.find((u) => u.id === id)?.name ?? "Someone";

function log(s: Series, now: number, text: string) {
  s.activity.unshift({ at: iso(now), text });
  if (s.activity.length > 200) s.activity.length = 200;
}

// ---------- lookups ----------

export function getSeries(db: Db, id: Id) {
  return db.series.find((s) => s.id === id) ?? fail("That series doesn't exist.");
}
function getBet(s: Series, betId: Id) {
  return s.bets.find((b) => b.id === betId) ?? fail("That bet doesn't exist.");
}
function requireHost(s: Series, actor: Id) {
  if (s.hostId !== actor) fail("Only the host can do that.");
}
function requireStatus(s: Series, status: Series["status"], message: string) {
  if (s.status !== status) fail(message);
}

export const isParticipant = (s: Series, userId: Id) =>
  s.members.some((m) => m.userId === userId && m.status === "joined") && (userId !== s.hostId || s.settings.hostPlays);

/** Players in the competition, in join order. */
export const participantIds = (s: Series) =>
  s.members.filter((m) => m.status === "joined" && (m.userId !== s.hostId || s.settings.hostPlays)).map((m) => m.userId);

function requireParticipant(s: Series, actor: Id) {
  if (!isParticipant(s, actor)) fail("You're not a player in this series.");
}

// ---------- settings ----------

export function normalizeSettings(input: Partial<Settings>): Settings {
  const s = { ...DEFAULT_SETTINGS, ...input };
  if (!["money", "pledge", "pool"].includes(s.mode)) fail("Pick a mode.");
  return {
    betCount: inRange(s.betCount, 1, 50, "Number of bets"),
    losers: inRange(s.losers, 1, 20, "Number of losing players"),
    startingCoins: inRange(s.startingCoins, 100, 100_000, "Starting coins"),
    mode: s.mode,
    minContribution: s.mode === "money" ? inRange(s.minContribution, 1, 10_000, "Minimum contribution") : s.minContribution,
    favorsPerPlayer: s.mode === "pool" ? inRange(s.favorsPerPlayer, 1, 5, "Favors per player") : 1,
    exclusivePool: Boolean(s.exclusivePool),
    tiebreak: s.tiebreak === "random" ? "random" : "first",
    betCreation: s.betCreation === "upfront" ? "upfront" : "during",
    withdrawMinutes: inRange(s.withdrawMinutes, 0, 60, "Withdrawal window"),
    hostPlays: Boolean(s.hostPlays),
  };
}

// ---------- users ----------

export function addUser(db: Db, name: unknown): User {
  const n = clean(name, 32);
  if (n.length < 1) fail("Type a name.");
  if (db.users.some((u) => u.name.toLowerCase() === n.toLowerCase())) fail("Someone already has that name.");
  const user = { id: newId("u"), name: n };
  db.users.push(user);
  return user;
}

// ---------- lobby ----------

export type CreateSeriesInput = { name: string; description?: string; settings: Partial<Settings>; invite?: Id[] };

export function createSeries(db: Db, actor: Id, input: CreateSeriesInput, now = Date.now(), rng = Math.random): Series {
  const name = clean(input.name, 60);
  if (name.length < 1) fail("Give the series a name.");
  const settings = normalizeSettings(input.settings);
  const invite = [...new Set(input.invite ?? [])].filter((id) => id !== actor && db.users.some((u) => u.id === id));
  const at = iso(now);
  const series: Series = {
    id: newId("s"),
    code: newCode(db, rng),
    name,
    description: clean(input.description, 280),
    hostId: actor,
    createdAt: at,
    status: "lobby",
    settings,
    members: [
      { userId: actor, status: "joined", ready: false, joinedAt: at },
      ...invite.map((userId) => ({ userId, status: "invited" as const, ready: false, joinedAt: at })),
    ],
    favors: [],
    bets: [],
    activity: [],
  };
  log(series, now, `${nameOf(db, actor)} created the series.`);
  db.series.push(series);
  return series;
}

export function joinSeries(db: Db, actor: Id, seriesId: Id, now = Date.now()) {
  const s = getSeries(db, seriesId);
  requireStatus(s, "lobby", "This series has already started.");
  const m = s.members.find((x) => x.userId === actor);
  if (m?.status === "joined") fail("You're already in this series.");
  if (m) {
    m.status = "joined";
    m.joinedAt = iso(now);
  } else {
    s.members.push({ userId: actor, status: "joined", ready: false, joinedAt: iso(now) });
  }
  log(s, now, `${nameOf(db, actor)} joined.`);
  return s;
}

export function joinByCode(db: Db, actor: Id, code: unknown, now = Date.now()) {
  const c = clean(code, 12).toUpperCase();
  const s = db.series.find((x) => x.code === c) ?? fail("No series has that code.");
  return joinSeries(db, actor, s.id, now);
}

function dropMember(s: Series, userId: Id) {
  s.members = s.members.filter((m) => m.userId !== userId);
  const hadFavors = s.favors.some((f) => f.authorId === userId);
  s.favors = s.favors.filter((f) => f.authorId !== userId);
  if (hadFavors && s.settings.mode === "pool") for (const m of s.members) m.ready = false;
}

export function leaveSeries(db: Db, actor: Id, seriesId: Id, now = Date.now()) {
  const s = getSeries(db, seriesId);
  requireStatus(s, "lobby", "You can only leave before betting starts.");
  if (s.hostId === actor) fail("The host can't leave their own series.");
  if (!s.members.some((m) => m.userId === actor)) fail("You're not in this series.");
  dropMember(s, actor);
  log(s, now, `${nameOf(db, actor)} left.`);
}

export function kickMember(db: Db, actor: Id, seriesId: Id, userId: Id, now = Date.now()) {
  const s = getSeries(db, seriesId);
  requireHost(s, actor);
  requireStatus(s, "lobby", "Players can only be removed before betting starts.");
  if (userId === actor) fail("You can't remove yourself.");
  if (!s.members.some((m) => m.userId === userId)) fail("That player isn't in this series.");
  dropMember(s, userId);
  log(s, now, `${nameOf(db, actor)} removed ${nameOf(db, userId)}.`);
}

const favorsOf = (s: Series, userId: Id) => s.favors.filter((f) => f.authorId === userId);

export function submitFavor(db: Db, actor: Id, seriesId: Id, text: unknown, now = Date.now()): Favor {
  const s = getSeries(db, seriesId);
  requireStatus(s, "lobby", "Favors are locked once betting starts.");
  requireParticipant(s, actor);
  if (s.settings.mode === "money") fail("This series uses real money, not favors.");
  const t = clean(text, 120);
  if (t.length < 3) fail("Describe the favor in a few words.");
  const favor = { id: newId("f"), authorId: actor, text: t, createdAt: iso(now) };
  if (s.settings.mode === "pledge") {
    s.favors = s.favors.filter((f) => f.authorId !== actor);
    s.favors.push(favor);
    const me = s.members.find((m) => m.userId === actor)!;
    me.ready = false;
  } else {
    const max = s.settings.favorsPerPlayer;
    if (favorsOf(s, actor).length >= max) fail(`You can add up to ${max} favor${max === 1 ? "" : "s"}.`);
    s.favors.push(favor);
    // The pool changed, so everyone's agreement to it has to be given again.
    for (const m of s.members) m.ready = false;
  }
  log(s, now, `${nameOf(db, actor)} ${s.settings.mode === "pledge" ? "pledged a favor" : "added a favor to the pool"}.`);
  return favor;
}

export function removeFavor(db: Db, actor: Id, seriesId: Id, favorId: Id) {
  const s = getSeries(db, seriesId);
  requireStatus(s, "lobby", "Favors are locked once betting starts.");
  const f = s.favors.find((x) => x.id === favorId) ?? fail("That favor doesn't exist.");
  if (f.authorId !== actor) fail("You can only remove your own favors.");
  s.favors = s.favors.filter((x) => x.id !== favorId);
  if (s.settings.mode === "pool") for (const m of s.members) m.ready = false;
  else s.members.find((m) => m.userId === actor)!.ready = false;
}

export function setReady(db: Db, actor: Id, seriesId: Id, ready: boolean) {
  const s = getSeries(db, seriesId);
  requireStatus(s, "lobby", "Betting has already started.");
  requireParticipant(s, actor);
  if (ready && s.settings.mode !== "money" && favorsOf(s, actor).length === 0) {
    fail(s.settings.mode === "pledge" ? "Pledge your favor first." : "Add at least one favor to the pool first.");
  }
  s.members.find((m) => m.userId === actor)!.ready = ready;
}

export function addBet(db: Db, actor: Id, seriesId: Id, question: unknown, now = Date.now()): Bet {
  const s = getSeries(db, seriesId);
  requireHost(s, actor);
  const q = clean(question, 140);
  if (q.length < 3) fail("Write the YES/NO question.");
  const max = s.settings.betCount;
  if (s.bets.length >= max) fail(`This series has ${max} bet${max === 1 ? "" : "s"}, and they're all written.`);
  const bet: Bet = { id: newId("b"), question: q, createdAt: iso(now), status: "draft", wagers: [] };
  if (s.status === "lobby") {
    s.bets.push(bet);
  } else if (s.status === "active") {
    if (s.settings.betCreation !== "during") fail("This series locked its bets before it started.");
    bet.status = "open";
    bet.openedAt = iso(now);
    s.bets.push(bet);
    log(s, now, `New bet: ${q}`);
  } else {
    fail("This series is over.");
  }
  return bet;
}

export function removeDraftBet(db: Db, actor: Id, seriesId: Id, betId: Id) {
  const s = getSeries(db, seriesId);
  requireHost(s, actor);
  requireStatus(s, "lobby", "Bets can't be deleted once betting starts. Cancel it instead.");
  getBet(s, betId);
  s.bets = s.bets.filter((b) => b.id !== betId);
}

/** Everything that still blocks the host from starting. Empty = ready to go. */
export function startBlockers(db: Db, s: Series): string[] {
  const out: string[] = [];
  const players = participantIds(s);
  const n = players.length;
  const x = s.settings.losers;
  if (n < 2) out.push("At least 2 players need to join.");
  else if (s.settings.mode === "pool" && 2 * x > n) {
    out.push(`A shared pool needs at least ${2 * x} players so the top ${x} can pick for the bottom ${x}.`);
  } else if (x >= n) out.push(`Need more than ${x} player${x === 1 ? "" : "s"} for ${x} to lose.`);
  if (s.settings.mode !== "money") {
    const missing = players.filter((p) => favorsOf(s, p).length === 0);
    if (missing.length) out.push(`Waiting on favors from ${missing.map((p) => nameOf(db, p)).join(", ")}.`);
  }
  const notReady = players.filter((p) => !s.members.find((m) => m.userId === p)!.ready);
  if (notReady.length) out.push(`Not ready yet: ${notReady.map((p) => nameOf(db, p)).join(", ")}.`);
  if (s.settings.betCreation === "upfront" && s.bets.length < s.settings.betCount) {
    out.push(`Write all ${s.settings.betCount} bets before starting (${s.bets.length} so far).`);
  }
  return out;
}

export function startSeries(db: Db, actor: Id, seriesId: Id, now = Date.now(), rng = Math.random) {
  const s = getSeries(db, seriesId);
  requireHost(s, actor);
  requireStatus(s, "lobby", "This series has already started.");
  const blockers = startBlockers(db, s);
  if (blockers.length) fail(blockers[0]);
  const pending = s.members.filter((m) => m.status === "invited").length;
  s.members = s.members.filter((m) => m.status === "joined");
  s.status = "active";
  s.startedAt = iso(now);
  for (const b of s.bets) {
    b.status = "open";
    b.openedAt = iso(now);
  }
  if (s.settings.tiebreak === "random") {
    const order = participantIds(s);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    s.randomOrder = order;
  }
  log(s, now, `Betting started. Everyone got ${s.settings.startingCoins.toLocaleString()} coins.${pending ? ` ${pending} unanswered invite${pending === 1 ? " was" : "s were"} dropped.` : ""}`);
}

// ---------- coins ----------

export type Balance = { settled: number; atStake: number; available: number };

export function balances(s: Series): Map<Id, Balance> {
  const out = new Map<Id, Balance>();
  for (const id of participantIds(s)) out.set(id, { settled: s.settings.startingCoins, atStake: 0, available: 0 });
  for (const b of s.bets) {
    if (b.status === "resolved") {
      for (const r of b.results ?? []) {
        const x = out.get(r.userId);
        if (x) x.settled += r.net;
      }
    } else if (b.status === "open" || b.status === "closed") {
      for (const w of b.wagers) {
        const x = out.get(w.userId);
        if (x) x.atStake += w.amount;
      }
    }
  }
  for (const x of out.values()) x.available = x.settled - x.atStake;
  return out;
}

export function pools(bet: Bet) {
  let yes = 0;
  let no = 0;
  for (const w of bet.wagers) w.side === "yes" ? (yes += w.amount) : (no += w.amount);
  const total = yes + no;
  return { yes, no, total, yesPct: total ? Math.round((yes / total) * 100) : 50 };
}

/** When a wager on this bet can no longer be withdrawn, or null if never. */
export function withdrawUntil(bet: Bet, settings: Settings): number | null {
  if (!bet.openedAt || settings.withdrawMinutes <= 0) return null;
  return Date.parse(bet.openedAt) + settings.withdrawMinutes * 60_000;
}

/** What a player would get back if `side` wins after they add `extra` coins to it. */
export function payoutIfWins(bet: Bet, userId: Id, side: Side, extra: number) {
  const p = pools(bet);
  const mine = bet.wagers.find((w) => w.userId === userId && w.side === side)?.amount ?? 0;
  const stake = mine + extra;
  const sidePool = (side === "yes" ? p.yes : p.no) + extra;
  const otherPool = side === "yes" ? p.no : p.yes;
  if (stake === 0) return 0;
  if (otherPool === 0) return stake;
  return Math.floor((stake * (sidePool + otherPool)) / sidePool);
}

/**
 * Proportional payout. Winners split the whole pool by stake. Rounding leftovers
 * go one coin each to the biggest winning stakes (earlier wager first), so the
 * payouts add up to the pool exactly. If one side is empty, everyone is refunded.
 */
export function settle(wagers: Wager[], outcome: Side): { refunded: boolean; results: BetResult[] } {
  const total = wagers.reduce((a, w) => a + w.amount, 0);
  const winners = wagers.filter((w) => w.side === outcome);
  const winPool = winners.reduce((a, w) => a + w.amount, 0);
  if (winPool === 0 || winPool === total) {
    return {
      refunded: true,
      results: wagers.map((w) => ({ userId: w.userId, stake: w.amount, payout: w.amount, net: 0, firstAt: w.firstAt })),
    };
  }
  const pay = new Map<Id, number>();
  for (const w of winners) pay.set(w.userId, Math.floor((w.amount * total) / winPool));
  let left = total - [...pay.values()].reduce((a, b) => a + b, 0);
  const order = [...winners].sort((a, b) => b.amount - a.amount || a.firstAt.localeCompare(b.firstAt));
  for (let i = 0; left > 0; i = (i + 1) % order.length, left--) pay.set(order[i].userId, pay.get(order[i].userId)! + 1);
  return {
    refunded: false,
    results: wagers.map((w) => {
      const payout = pay.get(w.userId) ?? 0;
      return { userId: w.userId, stake: w.amount, payout, net: payout - w.amount, firstAt: w.firstAt };
    }),
  };
}

// ---------- betting ----------

function requireOpenBet(s: Series, betId: Id) {
  requireStatus(s, "active", s.status === "lobby" ? "Betting hasn't started yet." : "This series is over.");
  const bet = getBet(s, betId);
  if (bet.status !== "open") fail(bet.status === "closed" ? "Betting is closed on this one." : "This bet is finished.");
  return bet;
}

export function placeWager(db: Db, actor: Id, seriesId: Id, betId: Id, side: Side, amount: unknown, now = Date.now()) {
  const s = getSeries(db, seriesId);
  requireParticipant(s, actor);
  const bet = requireOpenBet(s, betId);
  if (side !== "yes" && side !== "no") fail("Pick YES or NO.");
  const n = int(amount);
  if (Number.isNaN(n) || n < 1) fail("Wager at least 1 coin.");
  const free = balances(s).get(actor)!.available;
  if (n > free) fail(`You only have ${free.toLocaleString()} coins free.`);
  const existing = bet.wagers.find((w) => w.userId === actor);
  if (existing && existing.side !== side) {
    const until = withdrawUntil(bet, s.settings);
    fail(
      `You're on ${existing.side.toUpperCase()}. You can add to it${until && now < until ? ", or withdraw and pick again" : ""}.`
    );
  }
  if (existing) {
    existing.amount += n;
    existing.updatedAt = iso(now);
  } else {
    bet.wagers.push({ userId: actor, side, amount: n, firstAt: iso(now), updatedAt: iso(now) });
  }
  log(s, now, `${nameOf(db, actor)} ${existing ? "added" : "put"} ${n.toLocaleString()} on ${side.toUpperCase()}: ${bet.question}`);
}

export function withdrawWager(db: Db, actor: Id, seriesId: Id, betId: Id, now = Date.now()) {
  const s = getSeries(db, seriesId);
  const bet = requireOpenBet(s, betId);
  const w = bet.wagers.find((x) => x.userId === actor) ?? fail("You don't have a wager on this bet.");
  const until = withdrawUntil(bet, s.settings);
  if (until === null) fail("This series doesn't allow withdrawals.");
  if (now >= until) fail("The withdrawal window has passed.");
  bet.wagers = bet.wagers.filter((x) => x !== w);
  log(s, now, `${nameOf(db, actor)} withdrew from: ${bet.question}`);
}

// ---------- host controls ----------

function activeBet(db: Db, actor: Id, seriesId: Id, betId: Id) {
  const s = getSeries(db, seriesId);
  requireHost(s, actor);
  requireStatus(s, "active", "The series isn't running.");
  const bet = getBet(s, betId);
  if (bet.status !== "open" && bet.status !== "closed") fail("This bet is already finished.");
  return { s, bet };
}

export function closeBet(db: Db, actor: Id, seriesId: Id, betId: Id, now = Date.now()) {
  const { s, bet } = activeBet(db, actor, seriesId, betId);
  if (bet.status === "closed") fail("Betting is already closed.");
  bet.status = "closed";
  bet.closedAt = iso(now);
  log(s, now, `Betting closed: ${bet.question}`);
}

export function resolveBet(db: Db, actor: Id, seriesId: Id, betId: Id, outcome: Side, now = Date.now()) {
  const { s, bet } = activeBet(db, actor, seriesId, betId);
  if (outcome !== "yes" && outcome !== "no") fail("Pick YES or NO.");
  const { refunded, results } = settle(bet.wagers, outcome);
  bet.status = "resolved";
  bet.outcome = outcome;
  bet.closedAt ??= iso(now);
  bet.settledAt = iso(now);
  bet.seq = 1 + Math.max(0, ...s.bets.map((b) => b.seq ?? 0));
  bet.refunded = refunded;
  bet.results = results;
  log(s, now, `${outcome.toUpperCase()}: ${bet.question}${refunded ? " (everyone was on one side, so coins went back)" : ""}`);
  maybeFinish(db, s, now);
}

export function cancelBet(db: Db, actor: Id, seriesId: Id, betId: Id, now = Date.now()) {
  const { s, bet } = activeBet(db, actor, seriesId, betId);
  bet.status = "canceled";
  bet.closedAt ??= iso(now);
  bet.settledAt = iso(now);
  bet.refunded = true;
  bet.results = bet.wagers.map((w) => ({ userId: w.userId, stake: w.amount, payout: w.amount, net: 0, firstAt: w.firstAt }));
  log(s, now, `Canceled, coins returned: ${bet.question}`);
  maybeFinish(db, s, now);
}

const isFinal = (b: Bet) => b.status === "resolved" || b.status === "canceled";

function maybeFinish(db: Db, s: Series, now: number) {
  if (s.bets.length === s.settings.betCount && s.bets.every(isFinal)) finish(db, s, now);
}

export function endSeries(db: Db, actor: Id, seriesId: Id, now = Date.now()) {
  const s = getSeries(db, seriesId);
  requireHost(s, actor);
  requireStatus(s, "active", "The series isn't running.");
  if (s.bets.some((b) => !isFinal(b))) fail("Resolve or cancel the open bets first.");
  finish(db, s, now);
}

// ---------- standings ----------

export type Standing = {
  userId: Id;
  rank: number;
  coins: number;
  atStake: number;
  /** Resolution order of the bet where this player reached their current score (0 = since the start). */
  reachedSeq: number;
  losing: boolean;
};

/**
 * Ranked by settled coins (open wagers don't move the board until they resolve).
 * Ties: "first" puts whoever reached that score first ahead, then the earlier
 * wager on that same bet, then join order. "random" uses the order drawn at start.
 */
export function standings(s: Series): Standing[] {
  const ids = participantIds(s);
  const bal = balances(s);
  const reached = new Map<Id, { seq: number; at: string }>(ids.map((id) => [id, { seq: 0, at: "" }]));
  const resolved = s.bets.filter((b) => b.status === "resolved").sort((a, b) => a.seq! - b.seq!);
  for (const b of resolved) {
    for (const r of b.results ?? []) if (r.net !== 0 && reached.has(r.userId)) reached.set(r.userId, { seq: b.seq!, at: r.firstAt });
  }
  const join = new Map(ids.map((id, i) => [id, i]));
  const random = new Map((s.randomOrder ?? ids).map((id, i) => [id, i]));
  const rows = ids.map((id) => ({ id, coins: bal.get(id)!.settled, atStake: bal.get(id)!.atStake, ...reached.get(id)! }));
  rows.sort((a, b) => {
    if (b.coins !== a.coins) return b.coins - a.coins;
    if (s.settings.tiebreak === "random") return (random.get(a.id) ?? 0) - (random.get(b.id) ?? 0);
    return a.seq - b.seq || a.at.localeCompare(b.at) || join.get(a.id)! - join.get(b.id)!;
  });
  const n = rows.length;
  const live = s.status !== "lobby";
  return rows.map((r, i) => ({
    userId: r.id,
    rank: i + 1,
    coins: r.coins,
    atStake: r.atStake,
    reachedSeq: r.seq,
    losing: live && i >= n - s.settings.losers,
  }));
}

// ---------- the end ----------

/**
 * How each mode turns the final order into what the losers owe. To add a new
 * way of assigning favors, add an entry here (and a Mode value in types.ts).
 * `picking: true` means players still have to choose before the series is done.
 */
export const ASSIGNERS: Record<Series["settings"]["mode"], (s: Series, order: Id[], x: number) => { assignments: Assignment[]; picking: boolean }> = {
  // Mode B: the bottom X do the favor they pledged.
  pledge: (s, order, x) => ({
    picking: false,
    assignments: order.slice(order.length - x).map((loserId) => {
      const f = s.favors.find((f) => f.authorId === loserId);
      return { loserId, favorId: f?.id, text: f?.text, done: false };
    }),
  }),
  // Mode C: rank 1 picks for last place, rank 2 for second-to-last, and so on.
  pool: (_s, order, x) => ({
    picking: true,
    assignments: Array.from({ length: x }, (_, i) => ({ loserId: order[order.length - 1 - i], chooserId: order[i], done: false })),
  }),
  // Mode A: the bottom X owe the money contribution (recorded only).
  money: (_s, order, x) => ({
    picking: false,
    assignments: order.slice(order.length - x).map((loserId) => ({ loserId, done: false })),
  }),
};

function finish(db: Db, s: Series, now: number) {
  const order = standings(s).map((r) => r.userId);
  const x = Math.min(s.settings.losers, order.length);
  const { assignments, picking } = ASSIGNERS[s.settings.mode](s, order, x);
  s.finalOrder = order;
  s.finishedAt = iso(now);
  s.assignments = assignments;
  s.status = picking ? "assigning" : "finished";
  log(s, now, `Series over. ${nameOf(db, order[0])} finished first.`);
}

export function chooseFavor(db: Db, actor: Id, seriesId: Id, loserId: Id, favorId: Id, now = Date.now()) {
  const s = getSeries(db, seriesId);
  requireStatus(s, "assigning", "Favors aren't being picked right now.");
  const list = s.assignments!;
  const i = list.findIndex((a) => a.loserId === loserId);
  const a = list[i] ?? fail("That player doesn't owe a favor.");
  if (a.chooserId !== actor) fail(`${nameOf(db, a.chooserId!)} picks this favor.`);
  if (a.favorId) fail("You already picked.");
  const f = s.favors.find((x) => x.id === favorId) ?? fail("That favor isn't in the pool.");
  if (s.settings.exclusivePool) {
    const waiting = list.slice(0, i).find((x) => !x.favorId);
    if (waiting) fail(`${nameOf(db, waiting.chooserId!)} picks first.`);
    if (list.some((x) => x.favorId === favorId)) fail("Someone already picked that favor.");
  }
  a.favorId = f.id;
  a.text = f.text;
  log(s, now, `${nameOf(db, actor)} picked a favor for ${nameOf(db, loserId)}.`);
  if (list.every((x) => x.favorId)) s.status = "finished";
}

export function markFavorDone(db: Db, actor: Id, seriesId: Id, now = Date.now()) {
  const s = getSeries(db, seriesId);
  requireStatus(s, "finished", "The favors aren't assigned yet.");
  const a = s.assignments?.find((x) => x.loserId === actor) ?? fail("You don't owe a favor.");
  if (!a.text) fail("There's no favor to complete in this mode.");
  a.done = true;
  log(s, now, `${nameOf(db, actor)} did their favor.`);
}

// ---------- seed ----------

/** First-run data: placeholder people and one placeholder series in its lobby. */
export function seed(now = Date.now()): Db {
  const users = Array.from({ length: 6 }, (_, i) => ({ id: `u${i + 1}`, name: `Placeholder ${i + 1}` }));
  const db: Db = { version: 1, users, series: [] };
  const s = createSeries(
    db,
    "u1",
    {
      name: "Placeholder series",
      description: "Placeholder placeholder",
      settings: { ...DEFAULT_SETTINGS, betCount: 3 },
      invite: ["u2", "u3", "u4"],
    },
    now
  );
  addBet(db, "u1", s.id, "test wip", now);
  return db;
}
