# Bet Series on Supabase

Bet Series keeps its data in Supabase Postgres, and its rules live there as SQL functions. The Next app's `/api/series/*` routes are thin wrappers that call one function each, acting as the signed-in player. The Bet Series screens are the Vite app in `frontend/`.

```
frontend/ (served at :3000)  ──/api──▶  Next app (:3000) src/app/api/series/*  ──RPC──▶  Supabase Postgres
   Supabase Auth in the browser          Bearer token → auth.uid()                 supabase/migrations/*.sql
```

The rest of the Next app (groups, markets, the AI Bookie) still uses its own JSON store. Only Bet Series is on Supabase.

## What you need

From the Supabase project (Project Settings → API):

| Value | Where it goes |
| --- | --- |
| Project URL | `SUPABASE_URL` |
| Publishable key (also called the anon key) | `SUPABASE_PUBLISHABLE_KEY` |

Put both in `.env.local` at the repo root. The Next app and `frontend/` both read them from there; `frontend/vite.config.ts` picks up only these two values, so no other variable reaches the browser. The `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` names from the first version of this branch also work.

Never use the `service_role` / secret key in either app. Only `scripts/e2e-series.mjs` and `scripts/create-demo-users.mjs` need it, and they read it from the git-ignored `.supabase-test-secret` file.

## Set up the project

1. **Apply the migrations** in `supabase/migrations/` in order, with `supabase db push` (from a machine linked to the project) or by pasting each file into the SQL editor. `0011_pledge_changes_reset_ready.sql` is the newest; `0009_multi_outcome_bets.sql` adds multiple-choice bets, `0010_range_bets.sql` numerical ranges, and `0007_full_bet_series_rules.sql` holds most of the rules. Each upgrades existing data in place: 0007 for data made with 0001–0006, 0009 turns every existing bet into a YES/NO bet with outcome ids, and 0010 leaves existing bets as they are (all tested in `supabase/tests/upgrade.test.mjs`).
2. **Turn on sign-in methods** (Authentication → Sign In / Providers). Email with password works with no setup. For Google, follow `docs/supabase-setup.md`.
3. **Allow the redirect URLs** (Authentication → URL Configuration): add `http://localhost:3000/**`, and `https://<your-domain>/**` once deployed.
4. Run it:

   ```bash
   npm run dev                    # repo root: open http://localhost:3000
   ```

## API

Every route needs `Authorization: Bearer <Supabase access token>`. Responses are `{ "result": ... }`; errors are `{ "error": { "code", "message" } }`, where `message` is written for players. The status is 401 (not signed in), 403 (not allowed: `not_host`, `not_member`…), 404 (not found), 409 (wrong moment: `series_not_lobby`, `bet_not_open`, start blockers…) or 400 (bad input).

| Route | Does |
| --- | --- |
| `GET /api/series/state` | Everything the app shows: you, the server clock, and every series you're in with members, favors, bets, wagers, results, standings, start blockers, assignments and activity |
| `GET /api/series` | Your series (all statuses), newest first |
| `POST /api/series` | Create a lobby. `{ title, description?, plannedBetCount, initialBankroll, loserCount, stakeMode: "SHARED_FAVOR_POOL" \| "PLEDGE" \| "MONEY", questions?: string[] (YES/NO) or bets?: [{ question, outcomes?: string[], tieRule?: "refund" \| "first_listed" }] (not both), settings?: { minContribution, favorsPerPlayer, exclusivePool, tiebreak: "first" \| "random", betCreation: "upfront" \| "during", withdrawMinutes, hostPlays } }` |
| `POST /api/series/join` | Join by invite code `{ code }` |
| `GET /api/series/:id` | One series with its roster |
| `POST /api/series/:id/join` · `/leave` | Join by id (repeat is harmless) · leave the lobby |
| `DELETE /api/series/:id/participants/:userId` | Host removes a player (lobby only) |
| `GET` · `POST /api/series/:id/favors` | List favors · add one `{ description }` (pledge mode replaces yours) |
| `DELETE /api/series/:id/favors/:favorId` | Take back your favor (lobby only) |
| `POST /api/series/favors/:favorId/consent` | Agree or stop agreeing to someone's favor `{ consent }` (shared pool) |
| `POST /api/series/:id/ready` | `{ ready }`; in a shared pool this also agrees to every favor in it |
| `POST /api/series/:id/start` | Host starts: coins once, bets open, rules lock (repeat is harmless) |
| `GET` · `POST /api/series/:id/bets` | List bets with wagers and results · host writes one `{ question, outcomes?: string[] (2–10), tieRule?: "refund" \| "first_listed" }` (no outcomes = YES/NO), or a range `{ question, kind: "range", ranges: [{ lower, upper }] (null = open end), unit?, decimals?: 0–3 }` |
| `PATCH /api/series/:id/bets/:betId` | Host edits a draft bet: `{ question?, kind?: "binary" \| "multi" \| "range", outcomes?: [{ id?, label }] (in order; ids keep the outcome, missing ones are removed), tieRule?, ranges?, unit?, decimals? }`. 409 `outcomes_locked` once the bet has opened |
| `DELETE /api/series/:id/bets/:betId` | Host deletes a bet that hasn't opened |
| `POST /api/series/:id/bets/:betId/wagers` | `{ outcomeId, amount }` (the older `{ outcome: "YES" \| "NO", amount }` still works) |
| `POST /api/series/:id/bets/:betId/withdraw` | Take your whole wager back inside the window |
| `POST /api/series/:id/bets/:betId/lock` · `/resolve` · `/cancel` | Host stops wagers (one-sided pools refund at once) · settles `{ outcomeId }` (or `{ outcome: "YES" \| "NO" }`), reports a tie on a multiple-choice bet with `{ tiedOutcomeIds: [2+ ids] }`, or for a range bet takes the measured `{ value }` (the matching range wins; naming a range is refused) · cancels with refunds |
| `POST /api/series/:id/complete` | Host ends once nothing is open (it also ends itself after the last planned bet) |
| `GET /api/series/:id/leaderboard` | rank, display_name, balance (settled), available, at_stake, is_loser |
| `GET /api/series/:id/assignments` | What each loser owes and its status |
| `POST /api/series/:id/favors/assign` | Winner picks a favor for their paired loser `{ loserId, favorId }` |
| `POST /api/series/assignments/:assignmentId/respond` | Loser accepts or declines `{ accept }` |
| `POST /api/series/:id/favor-done` | Loser marks an accepted favor done |

## Rules the SQL enforces

- **Modes.** Shared favor pool (C), self-pledged favors (B), real money (A, recorded only, nothing is charged).
- **Lobby.** Joining is idempotent. The host can kick and players can leave until start. In a shared pool each player adds 1 to `favorsPerPlayer` favors. Any change to the pool, or to anyone's pledge in pledge mode, resets everyone's ready (0011), and the activity feed says who changed what. Every favor shows who added or pledged it. Ready requires your own favor, and in a shared pool it agrees to every favor in it.
- **Start.** Blockers, in order:
  - at least 2 players;
  - a shared pool needs 2X players, other modes more than X;
  - every player has a favor (not money mode);
  - everyone is ready;
  - in `upfront` mode, every bet is written.

  Starting hands out coins once, opens every written bet and draws the random tiebreak order.
- **Bets and outcomes.** A bet is YES/NO (the default) or multiple choice: 2 to 10 outcomes, each 1 to 60 characters, unique ignoring case. Every outcome is a row in `series_bet_outcomes` with a stable id; wagers, winners and results point at it. The host can add, rename, reorder and remove outcomes, change the kind and set the tie rule only while the bet is a draft; they lock when betting on it opens (at start, or immediately for a bet added mid-series).
- **Numerical ranges.** A range bet has a unit (°F, points, $…, up to 12 characters), a precision (0–3 decimal places) and 2–10 contiguous ranges, each `lower ≤ x < upper`; only the first may be open below and only the last open above. Gaps, overlaps, backwards ranges and bounds with more decimals than the precision are refused (`invalid_ranges`). Labels are generated from the bounds ("Below 60°F", "60–64°F", "80°F or above"; "-10 to -6" with negatives; "$4.50–$4.99"). To settle, the host enters the measured value (`invalid_result` if it has too many decimals); the range holding it wins, an exact boundary goes to the range it starts, and a value outside closed ends refunds everyone. Ranges, unit and precision lock when betting opens.
- **Wagers.** Pick one of the bet's outcomes and add to it; never switch. You can't spend more than your free coins. The host can bet too unless they sit out. Withdrawals are allowed for `withdrawMinutes` after a bet opens (0 = never); withdrawing lets you pick again.
- **Settling.** Winners split the whole pool by stake. Rounding leftovers go one coin each to the biggest winning stakes, earlier wager first, so payouts always add up to the pool. These cases refund everyone:
  - one-sided pools (every coin on one outcome);
  - nobody on the winning outcome;
  - a tie under the `refund` rule;
  - cancels.

  Each bet settles exactly once, under a row lock.
- **Ties (multiple choice).** There is only ever one winning outcome. Each multiple-choice bet fixes its tie rule before betting: `refund` (everyone gets their coins back) or `first_listed` (the earliest-listed tied outcome wins). The host reports which outcomes tied (2 or more); YES/NO bets can't tie.
- **Standings.** Ranked by settled coins. Ties: "first" means first to reach the score, then the earlier wager on that bet, then join order. "random" uses the order drawn at start. The bottom X lose. The order freezes when the series ends.
- **The end.**
  - Shared pool: rank i picks for rank n−i+1. They can only pick favors that loser wrote or agreed to. Exclusive pools pick in rank order, one favor each. The loser accepts or declines; a decline means the winner picks again. Nothing is binding until accepted.
  - Pledge: the bottom X owe their own pledge.
  - Money: the bottom X owe the minimum.

## Tests

| Command | Runs against | Needs |
| --- | --- | --- |
| `npm run test:series-sql` | The migrations in an in-process Postgres (PGlite) with RLS, as the `authenticated` role | Nothing |
| `node supabase/tests/local-supabase.mjs` | A stand-in Supabase (email Auth, RPC and simple table reads on PGlite) for running the whole app offline. Start the Next app and `frontend/` with `SUPABASE_URL=http://localhost:54399 SUPABASE_PUBLISHABLE_KEY=local`. In memory, test only | Nothing |
| `npm run test:ranges-local` | Numerical range bets over HTTP through the Next API (same setup as the next row) | Nothing |
| `npm run test:outcomes-local` | Multiple-choice bets over HTTP through the Next API, with users signed up on the stand-in. Start the stand-in and the Next app first (commands in the script header) | Nothing |
| `npm run test:series` | The real project, with disposable users | `.env.local` and `.supabase-test-secret` |

## Notes

- **Identity** is always the verified Supabase user. Nothing in a request body picks who is acting.
- **Concurrency.** Writes lock the series row, so balance checks and settlement are safe across server instances.
- **Hosting.** Bet Series data is in Supabase. The Next app's other features still write `.data/bookie.json`, so they need a host with a persistent disk.
