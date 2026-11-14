# Supabase Bet Series setup

The Series API now uses Supabase Auth access tokens and PostgreSQL RPCs. It does not read or write Series through `.data/bookie.json`. Existing non-Series app APIs still use the local JSON store.

## Configure

1. Create a Supabase project and configure Auth providers / allowed redirect URLs for the websites students will use.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Project Settings → API. Never use the `service_role` key in the browser or this app.
3. Apply all migrations in `supabase/migrations/` in timestamp order using the Supabase SQL editor or Supabase CLI (`supabase db push`). The latest Series migration is `202611140005_plan_series_bets.sql`.
4. Deploy the Next.js app and set the same variables in the deployment environment.

Clients on any allowed site sign users in with Supabase Auth, then call the app API with `Authorization: Bearer <session.access_token>`. IDs and roles are derived from the verified Supabase user; request bodies cannot select a host identity.

## API

- `POST /api/series` JSON `{ "title":"Weekend picks", "description":"", "plannedBetCount":2, "initialBankroll":1000, "loserCount":1, "stakeMode":"SHARED_FAVOR_POOL", "questions":["Will it rain Saturday?", "Will the home team win?"] }`. The `questions` array must contain exactly `plannedBetCount` nonempty YES/NO questions. Creation stores them together with the lobby.
- `POST /api/series/:seriesId/join`
- `POST /api/series/:seriesId/start`
- `GET /api/series/:seriesId`
- `POST /api/series/:seriesId/bets` with `{ "question":"Will ...?" }` only fills missing planned slots in older lobbies; it cannot add questions once the series starts. `GET` lists the planned bets in order and their wagers.
- `POST /api/series/:seriesId/bets/:betId/wagers` with `{ "outcome":"YES", "amount":50 }`.
- `POST /api/series/:seriesId/bets/:betId/lock`, `/resolve` with `{ "outcome":"YES" }`, or `/cancel`.
- `GET /api/series/:seriesId/leaderboard`; `POST /api/series/:seriesId/complete`.
- `GET|POST /api/series/:seriesId/favors`; `POST /api/series/favors/:favorId/consent`; `POST /api/series/:seriesId/favors/assign`; assignment response is handled by `POST /api/series/assignments/:assignmentId/respond`.

Create/join/start run as database functions with row locking; join is idempotent and start initializes balances atomically once. Series reads are restricted to members by RLS. Only the host can start, and starting requires all planned questions and at least `max(2, 2 * loserCount)` participants. A single-member start returns `one_person` and the message "Can't start with only one person."

At start, the first planned bet opens. Settling or canceling it opens the next question. Locking a pool with wagers on only one side automatically resolves it and refunds every stake. Zero wagers require an explicit resolve or cancel; both leave balances unchanged. With a fixed question schedule, a canceled bet closes its slot, refunds stakes, and counts toward completion; no replacement question can be introduced after start. This cancellation rule supersedes the earlier provisional rule in `CODEX_BET_SERIES_BACKEND.md`, which allowed canceled bets to be replaced.

## Current scope and deployment notes

This is a shared-database Series backend, not a full app-wide persistence migration. Regular bets and their AI/evidence/review services still use the JSON file. The Series API requires Supabase access tokens; the old demo cookie does not authorize it. Students create Auth accounts in the sign-in control; hosts share the Series ID with students on any website. Build uses Webpack because Turbopack crashed on CSS child-process startup in the local environment. Favor choices remain voluntary: each intended loser must pre-consent to a proposal, and must separately accept the final assignment.
