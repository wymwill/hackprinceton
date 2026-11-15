/**
 * What the Bet Series API sends from GET /api/series/state, already in the
 * shape the screens use. The SQL that builds it is `_bs_series_json` in
 * supabase/migrations/202611140010_range_bets.sql (first written in 0007; ranges added in 0010).
 */

export type Id = string;

/** A = real money, B = self-pledged favors, C = shared favor pool. */
export type Mode = "money" | "pledge" | "pool";
export type Tiebreak = "first" | "random";
export type BetCreation = "upfront" | "during";
/** Legacy YES/NO side names. Bets now use outcome ids; see Outcome. */
export type Side = "yes" | "no";
/**
 * "binary" = YES/NO (the default). "multi" = 2 to 10 outcomes the host named.
 * "range" = 2 to 10 numerical ranges; the host enters the measured value and the range holding it wins.
 */
export type BetKind = "binary" | "multi" | "range";
/** What a multiple-choice bet does if the host reports a tie. Fixed before betting. */
export type TieRule = "refund" | "first_listed";

/** One possible result of a bet. Ids are stable; labels and order lock when betting opens. */
export type Outcome = {
  id: Id;
  label: string;
  /** 1-based order the host listed it in. */
  position: number;
  /** Coins wagered on this outcome. */
  pool: number;
  /** Players with coins on it. */
  backers: number;
  /** Range bets: lower ≤ x < upper. Null = open-ended. Absent or null on other bets. */
  lower?: number | null;
  upper?: number | null;
};

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
  /** The outcome this player is on (one per bet; they can add to it but not switch). */
  outcomeId: Id;
  /** That outcome's label, lowercased. Kept for older code; use outcomeId. */
  side: string;
  amount: number;
  /** When this player first put coins on the bet. */
  firstAt: string;
  updatedAt: string;
};

export type BetResult = { userId: Id; outcomeId?: Id | null; stake: number; payout: number; net: number; firstAt: string };

export type Bet = {
  id: Id;
  question: string;
  createdAt: string;
  position: number;
  kind: BetKind;
  tieRule: TieRule;
  /** In the order the host listed them. YES/NO bets have YES then NO; range bets go low to high. */
  outcomes: Outcome[];
  /** Range bets: the unit (°F, points, $…) and decimal places for bounds and the result. */
  unit?: string | null;
  decimals?: number | null;
  /** Range bets: the value the host entered when settling. */
  resultValue?: number | null;
  status: BetStatus;
  openedAt?: string | null;
  closedAt?: string | null;
  settledAt?: string | null;
  /** The winning outcome. Null on a resolved bet means it was refunded (one-sided pool, or a tie under the refund rule). */
  outcomeId?: Id | null;
  /** Set when the host reported a tie: the outcomes that tied. */
  tiedOutcomeIds?: Id[] | null;
  /** The winner's label, lowercased. Kept for older code; use outcomeId. */
  outcome?: string | null;
  /** Order in which bets were resolved: 1, 2, 3… */
  seq?: number | null;
  /** True when everyone got their coins back (one-sided pool, nobody on the winning side, or canceled). */
  refunded: boolean;
  wagers: Wager[];
  results?: BetResult[] | null;
};

/** Picking means the winner has not chosen. Accepted means the punishment is assigned. */
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

/** A bet as the host writes or edits it. Outcomes with an id are existing ones (kept on rename or move). */
export type BetDraft = {
  question: string;
  kind: BetKind;
  outcomes: { id?: Id; label: string }[];
  tieRule: TieRule;
  range: RangeDraft;
};

/**
 * A range bet as the host builds it: boundaries in order, plus whether the first range
 * is open below and the last open above. Ranges are the gaps between boundaries, so they
 * can't overlap or leave holes. Boundaries are kept as typed so editing feels natural.
 */
export type RangeDraft = {
  unit: string;
  decimals: number;
  cuts: string[];
  openBelow: boolean;
  openAbove: boolean;
};

/** Someone on the Friends or Clans screens. */
export type Person = { id: Id; name: string; avatarUrl?: string | null };

export type ClanMember = Person & { wagered: number; joinedAt: string };

export type Clan = { id: Id; name: string; code: string; ownerId: Id; createdAt: string; members: ClanMember[] };

export type ClanRow = { rank: number; id: Id; name: string; members: number; wagered: number; mine: boolean };

/** What GET /api/social/state sends: `my_social_state` in supabase/migrations/202611140012_friends_and_clans.sql. */
export type SocialState = {
  me: Person & { friendCode: string; wagered: number };
  friends: (Person & { since: string })[];
  clans: Clan[];
  /** Kept by the API for older clients; new screens use clans. */
  clan: Clan | null;
  clanBoard: ClanRow[];
};

/** A clan chat message: `_chat_json` in supabase/migrations/202611140013_clan_chat.sql. */
export type ChatMessage = {
  id: number;
  clanId: Id;
  /** The sender, or for system messages the member the event is about. */
  userId: Id | null;
  kind: "text" | "system";
  /** System messages: clan_created, member_joined, member_left, owner_changed (more can be added later). */
  event: string | null;
  body: string;
  data: Record<string, unknown>;
  authorName: string;
  authorAvatar: string | null;
  clientId: string | null;
  createdAt: string;
  deleted: boolean;
};

/** GET /api/social/clans/:clanId/messages */
export type ChatPage = { messages: ChatMessage[]; hasMore: boolean; lastReadId: number; unread: number };

/** GET /api/social/chat */
export type ChatStatus = { clanId: Id | null; lastId: number | null; unread: number };

/**
 * What a wager submission did: POST /series/:id/bets/:betId/wagers with a requestId
 * (`place_series_wager_once` in supabase/migrations/202611140017_idempotent_submissions.sql).
 */
export type WagerReceipt = {
  requestId: Id;
  wagerId: Id;
  seriesId: Id;
  betId: Id;
  outcomeId: Id;
  /** The outcome's label, e.g. "YES". */
  outcome: string;
  /** Coins this submission put down. */
  amount: number;
  /** Your stake on this outcome before, and after, this submission. */
  previousStake: number;
  totalStake: number;
  /** True when it added to a stake you already had. */
  addedToExisting: boolean;
  /** Your free coins right after it, from the server. */
  available: number;
  placedAt: string;
  /** True when this answer is the original receipt for a repeated submission. */
  replayed: boolean;
};
