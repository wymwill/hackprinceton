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

1. **Apply the migrations** in `supabase/migrations/` in order, with `supabase db push` (from a machine linked to the project) or by pasting each file into the SQL editor. `0015_bet_close_times.sql` is the newest: it adds an optional "betting closes at" time to bets (existing bets get none). `0012_friends_and_clans.sql` adds friends and clans, `0009_multi_outcome_bets.sql` multiple-choice bets, `0010_range_bets.sql` numerical ranges, and `0007_full_bet_series_rules.sql` holds most of the rules. Each upgrades existing data in place: 0007 for data made with 0001–0006, 0009 turns every existing bet into a YES/NO bet with outcome ids, 0010 leaves existing bets as they are, and 0013 gives every existing clan an empty chat (all tested in `supabase/tests/upgrade.test.mjs`). 0013 also adds `clan_messages` to the `supabase_realtime` publication so chat messages arrive live; check Database → Publications afterwards.
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
| `GET /api/social/clans/:clanId/messages` | Your clan's chat, oldest first: the newest 50, `?before=<id>` for older, `?after=<id>` for newer (catching up); `?limit=` up to 100. `{ messages, hasMore, lastReadId, unread }` |
| `POST /api/social/clans/:clanId/messages` | Send as yourself `{ body, clientId? }` (1–2,000 characters; resending a `clientId` returns the first message) |
| `DELETE /api/social/clans/:clanId/messages/:messageId` | Delete your own message (the text is wiped; a "deleted" marker stays) |
| `POST /api/social/clans/:clanId/read` | Mark the chat read up to `{ messageId }` |
| `GET /api/social/chat` | Your clan and its unread count `{ clanId, lastId, unread }` |

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
- **Close times (0015).** The host can give any bet a closing time, when writing it or while it's open. Once it passes, wagers and withdrawals are refused and the bet reads as closed; the host still calls the result. No timer runs: the rule is checked on every read and write.
- **Clan chat (0013).** Every clan has one chat; when the clan closes (its last member leaves) its messages are deleted with it.
  - Only current members can read it: through the functions, and through the `clan_messages` RLS policy, which is also what Supabase Realtime checks before delivering a change. Leaving cuts access at once. New members see the whole history, with nothing marked unread.
  - Messages are written only by `send_clan_message`, as the signed-in user (403 `not_clan_member` otherwise). Text is trimmed, stray control characters dropped and long runs of blank lines shortened; 1 to 2,000 characters (emoji count once); at most 10 messages per person per 10 seconds (429 `slow_down`).
  - Authors can delete their own messages, nobody else's (403 `not_message_author`), and not system messages.
  - System messages (`kind: "system"`) mark clan events: `clan_created`, `member_joined`, `member_left`, `owner_changed` (from triggers, so every path is covered). Each has an `event` name and a `data` object, so later announcements such as bet results can be new events without a schema change.
  - The app shows each message once: it keeps messages by id, sends a client id with each message (retries return the first copy), and after reconnecting fetches only what's newer than the last message it has. While the live connection is down it checks every few seconds instead.

## Catching up a project that ran 0012 early

The reported state is 0001–0008 and 0012 applied, with 0009 (multiple choice), 0010 (ranges), 0011 (pledge resets) and 0013 (clan chat) missing. On 2026-11-14, read-only API checks against `opixwxaamxffvcjblmjr` confirmed that clans exist, while outcomes/chat tables and all six public chat RPCs are missing from the API cache, and the range columns and chat read cursor do not exist. This supports the reported mismatch; it does **not** establish the migration ledger, 0011 function bodies, private data, RLS policies, or publication state. No production writes were made.

The recovery script and earlier instructions were already committed at the start of this inspection (`main`, `0c769dc`; clean working tree). The hardened script now rejects partial migration columns and a missing publication or disabled INSERT/UPDATE publication events. It uses a 5-second lock timeout and a 120-second per-statement timeout. These checks do not replace inspecting the actual database.

**Production execution, migration-history repair, and the live write test below require owner approval.** The local tests use synthetic data reproducing the reported migration order; they are not a copy or backup of production.

1. **Run the full read-only audit first:** paste `supabase/diagnostics/clan-chat.sql` into the target project's SQL editor. It runs in a read-only transaction and reports the ledger (in notices), schema, all chat functions/grants, policy definitions, triggers, publication flags, data totals, and legacy wager compatibility. Review every result set; if the editor only shows the last result, select individual queries inside a read-only transaction. Compare both favor-function definitions with migration 0011: its pledge paths must reset every participant's readiness. Public API checks can be repeated with `node scripts/inspect-clan-chat-live.mjs`, but cannot replace this audit. The script uses GET only, which PostgREST executes in [read-only transactions](https://postgrest.org/en/stable/references/transactions.html).

   This smaller query summarizes the key preconditions:

   ```sql
   select
     to_regclass('public.clans') is not null                      as has_0012_clans,
     to_regclass('public.series_bet_outcomes') is not null        as has_0009_multi,
     exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'series_bets' and column_name = 'unit') as has_0010_ranges,
     to_regclass('public.clan_messages') is not null              as has_0013_chat,
     (select count(*) from public.series_wagers where outcome is null or outcome not in ('YES','NO'))
       + (select count(*) from public.series_bet_results where side is null or side not in ('YES','NO'))
       + (select count(*) from public.series_bets where winning_outcome not in ('YES','NO')) as not_yes_no,
     (select count(*) from public.bet_series)                     as series,
     (select count(*) from public.series_wagers)                  as wagers,
     (select coalesce(sum(balance), 0) from public.bet_series_participants) as coins;
   ```

   Expect `true, false, false, false`, `not_yes_no = 0`, and zero orphan references in the full audit. Save all aggregate totals. If the schema or ledger differs, stop and choose only the missing migrations; do not bypass guards or mark migrations applied to hide the mismatch.
2. **Confirm a restorable backup**, then pause app writes for the recovery window. Inspect unexpected custom triggers/functions before proceeding. The migration takes locks and backfills outcome IDs on existing wagers, results and winning bets; a transaction prevents partial application, but does not undo a successful commit.
3. **Generate the exact SQL for review:** `node scripts/catchup-sql.mjs > /tmp/alea-catchup.sql`. This only creates a local file. After approval, paste the **entire file**, including `begin` and `commit`, into the SQL editor for project `opixwxaamxffvcjblmjr` and run once. It applies 0009, 0010, 0011 and 0013 in order; no reset, truncation or deletion of existing application rows is needed. It adds schema, replaces functions/constraints/policies, and fills new columns. Tests verify that every original column value is preserved on representative existing data. If any statement errors or times out, execute `rollback;` if the session is still in a transaction and investigate; do not run a remaining fragment or disable the checks. A second run stops at preflight.
4. **Check the result** (read-only):

   ```sql
   select
     to_regclass('public.series_bet_outcomes') is not null as has_0009_multi,
     exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'series_bets' and column_name = 'unit') as has_0010_ranges,
     to_regclass('public.clan_messages') is not null as has_0013_chat,
     coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.clan_messages')), false) as chat_rls_on,
     exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'clan_messages') as chat_policy,
     exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clan_messages') as chat_realtime,
     to_regprocedure('public.send_clan_message(uuid,text,uuid)') is not null as chat_send_fn,
     (select count(*) from public.bet_series) as series,
     (select count(*) from public.series_wagers) as wagers,
     (select coalesce(sum(balance), 0) from public.bet_series_participants) as coins;
   ```

   Everything should be `true`, with the same three counts as before. Rerun the full audit too: all six public RPCs must grant authenticated EXECUTE, no helper or chat RPC may grant anon EXECUTE, all six helpers must deny authenticated EXECUTE, and the only chat SELECT policy should be for authenticated members using `is_clan_member(clan_id)`. Authenticated users get SELECT but no direct writes; anon gets no table access. All three chat triggers must be enabled. `supabase_realtime` must include `public.clan_messages` with INSERT and UPDATE enabled (deletions are soft updates). Compare every saved data total. The transaction reloads the PostgREST schema cache on commit; refresh the app afterwards. Do not grant anonymous access to resolve permission errors.
5. **Reconcile migration history after successful SQL verification and approval.** On a CLI installation linked to the correct project, first run `supabase migration list --linked`. If the ledger already records 0001–0008 and 0012, record the four newly applied migrations with `supabase migration repair --linked --status applied 202611140009 202611140010 202611140011 202611140013`, then list again. If earlier SQL-editor migrations have no ledger entries, verify their schema before recording them individually. Repair edits history; it does not execute schema SQL. Never mark a failed migration applied. See [Supabase's migration-history guidance](https://supabase.com/docs/guides/deployment/database-migrations). Avoid a blind `db push --include-all`, which could replay earlier SQL-editor migrations absent from the ledger.
6. **After separate approval for test writes, check live chat:** `node scripts/verify-clan-chat-live.mjs --yes` creates three temporary users, a temporary clan and messages, checks actual Supabase Realtime delivery/privacy, then attempts cleanup. It requires `.supabase-test-secret`; no such credential is configured in this checkout. This test was **not** run during the read-only investigation. Alternatively, approve a manual test using two clan members and an outsider. Local WebSocket tests simulate Realtime; production delivery remains unverified until this step passes.

## Tests

Recovery verification on 2026-11-14: all 87 SQL tests passed, including original-row preservation, rollback after a late failure, partial-schema/Realtime guards, and the read-only audit before/after recovery. Local API checks passed for chat (9), multiple-choice bets (9), ranges (8), and missing migration 0013 (four chat endpoints return the specific 503 while social/series reads remain 200). Typecheck and lint passed. Production write tests and browser UI verification were not run; the browser connection was unavailable.

| Command | Runs against | Needs |
| --- | --- | --- |
| `npm run test:series-sql` | The migrations in an in-process Postgres (PGlite) with RLS, as the `authenticated` role | Nothing |
| `node supabase/tests/local-supabase.mjs` | A stand-in Supabase (email Auth, RPC, simple table reads, and Realtime postgres_changes with RLS checks, on PGlite) for running the whole app offline. Start the Next app and `frontend/` with `SUPABASE_URL=http://localhost:54399 SUPABASE_PUBLISHABLE_KEY=local`. In memory, test only | Nothing |
| `npm run test:ranges-local` | Numerical range bets over HTTP through the Next API (same setup as the next row) | Nothing |
| `npm run test:chat-local` | Clan chat over HTTP and live over the stand-in's Realtime: two members exchanging messages, other clans and nonmembers refused, deleting, a dropped connection with no duplicates, leaving | Nothing |
| `npm run test:outcomes-local` | Multiple-choice bets over HTTP through the Next API, with users signed up on the stand-in. Start the stand-in and the Next app first (commands in the script header) | Nothing |
| `npm run test:series` | The real project, with disposable users | `.env.local` and `.supabase-test-secret` |
| `node scripts/verify-clan-chat-live.mjs --yes` | Clan chat on the real project after 0013: live delivery between two temporary users, privacy, deleting, leaving; removes everything after | `.env.local` and `.supabase-test-secret` |
| `node scripts/e2e-missing-migration-local.mjs` | What chat says on a database without 0013 (stand-in started with `MIGRATIONS_UP_TO=202611140013`) | Nothing |

## Notes

- **Identity** is always the verified Supabase user. Nothing in a request body picks who is acting.
- **Concurrency.** Writes lock the series row, so balance checks and settlement are safe across server instances.
- **Hosting.** Bet Series data is in Supabase. The Next app's other features still write `.data/bookie.json`, so they need a host with a persistent disk.
