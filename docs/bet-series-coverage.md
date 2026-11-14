# Bet Series: requirements coverage

Every requirement from the Bet Series feature list, where it shows up in `frontend/`, the route in `src/app/api/series` that carries it out, and the test that checks it.

- **Rules:** SQL in `supabase/migrations/` (0001–0006 from the `codex/backend` branch, 0007 brings it up to the full spec).
- **Rule tests:** `supabase/tests/series.test.mjs` and `upgrade.test.mjs` (`npm run test:series-sql`, in-process Postgres).
- **Live test:** `scripts/e2e-series.mjs` against the real project.

As of 2026-11-14 every item is covered.

## Backend features that had no UI (from `codex/backend`), and where they are now

| Backend feature | Screen now |
| --- | --- |
| Supabase sign-in; every call carries the player's token | Sign-in screen (Google, or email and password), account and sign out in the sidebar |
| Bet questions written when the series is created | Series creation, "02 · Bets" (optional; the lobby can add the rest) |
| Per-favor consent (`consent_series_favor`) | Lobby, Favor pool: "n/m agree" and Agree / ✓ Agreed on each favor |
| Loser accepts or declines the assigned favor (`respond_series_favor_assignment`) | Results, Favor picks: Accept / Decline; after a decline the winner picks again |
| Favor picks limited to favors the loser agreed to | Results, Favor picks: only eligible favors are offered |
| Locking a bet, with one-sided pools refunded on lock | Bet page, Host controls: "Lock betting"; the result banner says "Refunded" |
| Host completes the series (`complete_bet_series`) | Dashboard, Host controls: "End series now" (it also ends by itself after the last planned bet) |
| Join by series id | Join with the code or the invite link `/join/CODE`; `POST /api/series/:id/join` still works |
| Leaderboard endpoint | Leaderboard and Dashboard use the same server ranking (`standings` in `/api/series/state`) |
| Series list | Sidebar switcher and Home |

**Backend gaps found and fixed in 0007:**

- There was no route to read assignments. Added `GET /api/series/:id/assignments`, and assignments are in the state read.
- No player names were stored. Participants now get a display name from their Supabase profile.
- Finished series dropped out of `GET /api/series`. All statuses are listed now.
- The leaderboard flagged everyone outside the top X as losers. It now flags only the bottom X.

## Core concept

| Requirement | Screen | API / rule | Test |
| --- | --- | --- | --- |
| YES/NO bets in a friend group | Bet page, Dashboard | `POST …/bets`, `…/wagers` | betting suite |
| Virtual coins across a Bet Series | Series creation, Dashboard | `initialBankroll`; balances per series | "coins are handed out exactly once and only in that series" |
| Several series at once | Sidebar switcher, Home | `GET /api/series/state` lists all of yours | "join by id or code…only members see the series" |
| Ranked by remaining coins at the end | Results, Leaderboard | `_bs_standings`, `final_order` | standings and ties suite |
| Losers do favors or real money, by mode | Results | `_bs_finish` (per mode) | "the end" suite |

## Series creation

| Requirement | Screen | API / rule | Test |
| --- | --- | --- | --- |
| Name and description | Series creation, Basics | `POST /api/series` | "a valid create is a lobby…" |
| Number of bets | Basics | `plannedBetCount` (1–50) | "lobby bets: host adds and removes, up to the count" |
| Participants | Lobby invite code and link; `/join/CODE` | `POST /api/series/join`, `…/:id/join` | "join by id or code…" |
| Bottom X losers | Basics | `loserCount` (1–20), fixed at creation | "the leaderboard marks only the bottom X" |
| Starting coins (e.g. 1,000) | Basics | `initialBankroll` (100–100,000) | "bad input is refused…" |
| Mode and advanced settings | Mode, Advanced rules | `stakeMode`, `settings` | "a valid create…" |
| Host can play too | "I'm playing too" | `settings.hostPlays` | "a host who isn't playing…" |
| All bets before start, or add during | Advanced, Writing bets | `settings.betCreation` | "bets during the series open right away when allowed…" |

## Modes

| Requirement | Screen | API / rule | Test |
| --- | --- | --- | --- |
| A: real money, host minimum | Mode A card, minimum field; Results "owes $" | `settings.minContribution`, `MONEY` | "pledge…; money: recorded only" |
| B: each player pledges their own favor | Lobby, Pledged favors | `…/favors` (replaces own pledge) | "pledge mode replaces your one pledge…" |
| B: bottom X do their own pledge | Results, Favors owed | `_bs_finish` (PLEDGE) | "pledge: the bottom X owe their own pledge…" |
| C: shared pool, at least one each | Lobby, Favor pool | start blocker `favors_missing` | "blockers come in order…" |
| C: favors per player | Mode C field | `settings.favorsPerPlayer` (1–5) | "shared pool: favor limit…" |
| C: top X pick for bottom X, rank 1 for last | Results, Favor picks | `…/favors/assign` | "shared pool: rank 1 picks for last…" |
| C: exclusive or reusable pool | Mode C toggle | `settings.exclusivePool` | same test (order and "favor taken") |
| Consent to favors | Lobby agreement and ready; Results accept / decline | `…/consent`, `…/ready`, `…/respond` | "per-favor agreement…", "a favor the loser never agreed to…" |

## Lobby

| Requirement | Screen | API / rule | Test |
| --- | --- | --- | --- |
| Join and review the rules | Lobby, Rules panel | `…/join` | "join by id or code…" |
| Submit favors | Lobby, favor panel | `…/favors`, `DELETE …/favors/:id` | "shared pool: favor limit…" |
| Host kicks before start; players leave | Lobby, Players | `DELETE …/participants/:userId`, `…/leave` | "leave and kick…" |
| Start: coins handed out, rules locked | Lobby, Start | `…/start` (repeat is harmless) | "coins are handed out exactly once…" |
| X fixed once created | (no edit control) | no update route | by design |

## Betting

| Requirement | Screen | API / rule | Test |
| --- | --- | --- | --- |
| Host writes YES/NO questions | Series creation, Lobby, Dashboard | `POST …/bets` | "lobby bets…", "bets during the series…" |
| Several bets open at once | Dashboard, Open tab | all written bets open at start | "coins are handed out…" (bet open) |
| Pick a side and wager; add more | Bet page ticket | `…/wagers` | "add to your side, never switch, never overspend…" |
| Withdraw in the first 15 minutes only | Ticket, Withdraw with countdown | `…/withdraw` | "withdraw only inside the window…" |
| See others' picks and stakes | Bet page, Who's on what | wagers in the state read | API run |
| Host decides YES or NO, even if playing | Bet page, Host controls | `…/resolve` (host only) | "winners split the whole pool…" |
| Winners split the pool by stake | Bet page, Payouts | `_bs_settle` | "200 YES, 100 YES, 300 NO pays 400 / 200 / 0", "rounding leftovers…" |
| Everyone on one side: refund | Result banner | `_bs_settle` refund branch; lock refunds at once | "everyone on one side gets refunded…" |
| Host cancels: refund | Host controls, Cancel bet | `…/cancel` | "cancel refunds once…" |
| Balances and ranks update per resolved bet | Top bar, Dashboard, Leaderboard | standings use settled coins | standings suite |

## Leaderboard and losing

| Requirement | Screen | API / rule | Test |
| --- | --- | --- | --- |
| Ranked by coin balance | Leaderboard, Dashboard | `_bs_standings`, `…/leaderboard` | standings suite |
| Bottom X lose | Dashed line, "Bottom X" tag | `losing` / `is_loser` | "the leaderboard marks only the bottom X" |
| Final board decides favors | Results | `final_order`, `_bs_finish` | "the end" suite |

## Advanced customizations

| Requirement | Screen | API / rule | Test |
| --- | --- | --- | --- |
| Tiebreak: first to reach the score; same bet, earlier wager | Advanced, Ties | `tiebreak = FIRST` | "first to reach the score ranks higher…" |
| Tiebreak: random order | Advanced, Ties | `random_order` drawn at start | "random tiebreak draws an order…" |
| Allow or block new bets mid-series | Advanced, Writing bets | `bet_creation` | "bets during the series…" |
| Favors per player; exclusive or reusable pool | Mode C | `favors_per_player`, `exclusive_pool` | pool tests |

## Decisions made while merging (worth a team look)

- **Picking a favor.** The branch let a winner assign only a favor they wrote themselves. The spec says the winner picks from the shared pool, so any favor in the pool can be picked, as long as the loser wrote it or agreed to it.
- **Consent.** Ticking "I'm ready" in a shared pool agrees to every favor in it. Agreement can also be given or taken back one favor at a time; taking it back un-readies you. Start needs everyone ready.
- **Questions at creation.** These are optional now. The branch required all of them. In `upfront` mode all of them are still required before start, and API callers that send every question get `upfront` by default.
- **Declines.** A declined favor isn't owed. The winner picks another, and the series stays "Picking favors" until every pick is made.
- **Locking a one-sided bet.** It settles right away as a refund (the branch's rule), shown as "Refunded".
- **Invitations by name are gone.** Real accounts have no shared user list, so players join by code or link.

## Open team questions and the current defaults

| Question | Default |
| --- | --- |
| Withdraw only in the first 15 minutes? | The host picks Never, 5, 15 or 30 (15 in the form; 0 for API calls that don't say) |
| When does the countdown start? | When the bet opens (series start for bets written up front) |
| Can players switch sides? | Only by withdrawing inside the window and betting again |
| Which tiebreaks? | First to reach (then earlier wager, then join order) or random |
| How do players approve favors? | Per-favor agreement and the ready check before start; accept or decline after the pick |
| Limits on favor content? | 3 to 120 characters; the host can kick before start |
| Real money in the MVP? | Shown and recorded only, marked "Preview"; nothing is charged |
