/** Everything the app stores. Kept plain JSON so it can move to a server later. */

export type Id = string;

export type User = { id: Id; name: string };

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
  status: "invited" | "joined";
  /** Read the rules and agreed to the favors. */
  ready: boolean;
  joinedAt: string;
};

export type Favor = { id: Id; authorId: Id; text: string; createdAt: string };

export type BetStatus = "draft" | "open" | "closed" | "resolved" | "canceled";

export type Wager = {
  userId: Id;
  side: Side;
  amount: number;
  /** When this player first put coins on the bet (tiebreaks use it). */
  firstAt: string;
  updatedAt: string;
};

export type BetResult = { userId: Id; stake: number; payout: number; net: number; firstAt: string };

export type Bet = {
  id: Id;
  question: string;
  createdAt: string;
  status: BetStatus;
  openedAt?: string;
  closedAt?: string;
  wagers: Wager[];
  outcome?: Side;
  /** Order in which bets were resolved: 1, 2, 3… */
  seq?: number;
  settledAt?: string;
  /** True when everyone got their coins back (one-sided pool, or canceled). */
  refunded?: boolean;
  results?: BetResult[];
};

export type Assignment = {
  loserId: Id;
  /** Mode C: the top player who picks this loser's favor. */
  chooserId?: Id;
  favorId?: Id;
  text?: string;
  done: boolean;
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
  startedAt?: string;
  finishedAt?: string;
  settings: Settings;
  members: Member[];
  favors: Favor[];
  bets: Bet[];
  /** Fixed at start when the tiebreak is random. */
  randomOrder?: Id[];
  /** Final standings, frozen when the series ends. */
  finalOrder?: Id[];
  assignments?: Assignment[];
  activity: ActivityItem[];
};

export type Db = { version: 1; users: User[]; series: Series[] };
