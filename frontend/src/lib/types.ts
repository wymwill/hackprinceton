/**
 * What the Bet Series API sends from GET /api/series/state, already in the
 * shape the screens use. The SQL that builds it is `_bs_series_json` in
 * supabase/migrations/202611140007_full_bet_series_rules.sql.
 */

export type Id = string;

/** A = real money, B = self-pledged favors, C = shared favor pool. */
export type Mode = "money" | "pledge" | "pool";
export type Tiebreak = "first" | "random";
export type BetCreation = "upfront" | "during";
export type Side = "yes" | "no";

export type Settings = {
  /** Total bets in the series. */
  betCount: number;
  /** Bottom X players lose. */
  losers: number;
  startingCoins: number;
  mode: Mode;
  /** Mode A: minimum buy-in per player, in dollars. */
  minContribution: number;
  /** Mode C: how many favors each player may add to the pool (at least 1 required). */
  favorsPerPlayer: number;
  /** Mode C: true = a favor can be picked once. */
  exclusivePool: boolean;
  tiebreak: Tiebreak;
  /** "upfront" = every bet is written in the lobby; "during" = the host can add bets while the series runs. */
  betCreation: BetCreation;
  /** Minutes after a bet opens during which a wager can be withdrawn. 0 = never. */
  withdrawMinutes: number;
  hostPlays: boolean;
};

export type Member = {
  userId: Id;
  name: string;
  avatarUrl?: string | null;
  status: "joined";
  /** Read the rules (and, in a shared pool, agreed to every favor in it). */
  ready: boolean;
  /** False only for a host who sits out. */
  plays: boolean;
  joinedAt: string;
};

export type Favor = {
  id: Id;
  authorId: Id;
  text: string;
  createdAt: string;
  /** Shared pool: other players who agreed to this favor. The author always counts as agreeing. */
  agreedBy: Id[];
};

export type BetStatus = "draft" | "open" | "closed" | "resolved" | "canceled";

export type Wager = {
  userId: Id;
  side: Side;
  amount: number;
  /** When this player first put coins on the bet. */
  firstAt: string;
  updatedAt: string;
};

export type BetResult = { userId: Id; stake: number; payout: number; net: number; firstAt: string };

export type Bet = {
  id: Id;
  question: string;
  createdAt: string;
  position: number;
  status: BetStatus;
  openedAt?: string | null;
  closedAt?: string | null;
  settledAt?: string | null;
  /** Null on a resolved bet means it was refunded when the host locked a one-sided pool. */
  outcome?: Side | null;
  /** Order in which bets were resolved: 1, 2, 3… */
  seq?: number | null;
  /** True when everyone got their coins back (one-sided pool, nobody on the winning side, or canceled). */
  refunded: boolean;
  wagers: Wager[];
  results?: BetResult[] | null;
};

/** picking: the winner hasn't chosen. pending: waiting for the loser to accept. */
export type AssignmentStatus = "picking" | "pending" | "accepted" | "declined";

export type Assignment = {
  id: Id;
  loserId: Id;
  /** Mode C: the top player who picks this loser's favor. */
  chooserId?: Id | null;
  favorId?: Id | null;
  text?: string | null;
  done: boolean;
  status: AssignmentStatus;
};

export type Standing = {
  userId: Id;
  rank: number;
  /** Settled coins: open wagers don't count until they settle. */
  coins: number;
  atStake: number;
  /** Coins free to wager right now. */
  available: number;
  /** Resolution order of the bet where this player reached their current score (0 = since the start). */
  reachedSeq: number;
  losing: boolean;
};

export type SeriesStatus = "lobby" | "active" | "assigning" | "finished";

export type ActivityItem = { at: string; text: string };

export type Series = {
  id: Id;
  code: string;
  name: string;
  description: string;
  hostId: Id;
  createdAt: string;
  status: SeriesStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  settings: Settings;
  members: Member[];
  favors: Favor[];
  bets: Bet[];
  /** Drawn at start when the tiebreak is random. */
  randomOrder?: Id[] | null;
  /** Final standings, frozen when the series ends. */
  finalOrder?: Id[] | null;
  assignments: Assignment[];
  /** Newest first, last 50. */
  activity: ActivityItem[];
  /** Ranked by the server, ties already broken. */
  standings: Standing[];
  /** Lobby only: what still stops the host from starting. */
  blockers: string[];
};

export type Me = { id: Id; name: string; email?: string | null; avatarUrl?: string | null };

export type AppState = { me: Me; serverTime: string; series: Series[] };

/** What the screens read from the store. */
export type Db = { series: Series[] };
