# The House

The House is a compact commentator on `/s/:id/bets/:betId`. Place a wager or resolve a bet and the existing 2.5-second state poll updates the card. A deterministic comment is available immediately, with no key, no provider connection, and no changes to betting handlers or Supabase schema.

The server derives the latest observable event from the caller's existing `my_series_state` RPC. It checks membership before every response, including cache hits. The client never supplies amounts, outcomes, identities, prompts, or event facts. Rapid events between polls are coalesced to the latest event; this MVP is not an archival announcer feed.

## What gets said

- **Wagers:** names the player, actual aggregate stake, and outcome. Says “now has” because existing snapshots aggregate additions, rather than pretending each total is a new deposit. Stakes at least 50% of the series' starting coins get large-wager commentary. The denominator is explicitly **starting bankroll**, not an invented historical available balance. A contrarian position requires at least two other bettors, with at least 75% of them on the same opposing outcome; this describes the observed snapshot, not betting odds.
- **Resolution:** names the recorded winning outcome and largest actual payout, explicitly including the original stake. Close-pool commentary means the two largest stake pools differ by at most 10% of the total; it does not claim the real-world result was close.
- **Upsets:** at least three bettors, a funded winning outcome holding at most 25% of all pre-settlement stakes, and a more heavily backed outcome. Stakes come from the frozen `series_bet_results` data in the snapshot. Ties, refunds, one-sided pools, and cancellations never count as upsets.
- **Ties and refunds:** respects refund and first-listed tie rules, one-sided refunds, canceled bets, and range results outside all ranges. No winner is invented.

The factual sentence is deterministic. The OpenAI adapter composes commentary by choosing a context-appropriate punchline from a vetted catalog, using strict structured output. It does **not** accept free-form model prose. This intentionally small MVP guarantees that model output cannot invent history, numbers, relationships, slurs or threats. Only numeric/boolean facts, fixed event categories and candidate punchlines reach the model; usernames, market questions, outcome labels, user IDs and tokens do not. User labels are quoted and rendered as ordinary React text, never HTML. The model has no tools or database client.

The adapter follows the official [Responses structured-output format](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). The default [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini) supports that format. Each request uses `store: false`, at most 160 output tokens and a 3.5-second timeout, with no retries. Refusals, invalid JSON, unexpected properties/choices, network errors and unavailable credentials use deterministic fallback commentary.

## Configuration

All settings below are server-only. `.env.example` contains empty credentials; use the ignored root `.env.local` or the host's secret configuration when ready. Never use a `VITE_` or `NEXT_PUBLIC_` prefix for model credentials. Vite's existing allowlist still exposes only Supabase public configuration. No new key was created for this implementation.

| Setting | Behavior |
| --- | --- |
| `OPENAI_API_KEY` | Optional. With `HOUSE_MODE=auto`, enables the server-side adapter for new, eligible events. Without it, the feature works with deterministic comments. |
| `OPENAI_HOUSE_MODEL` | Optional model override; defaults to `gpt-4.1-mini`. Must support Responses structured output. |
| `HOUSE_MODE` | `auto` (default), `fallback` (never call the provider), or `mock` (deterministic mock adapter exercising the cache). Unknown modes fail closed to fallback. |
| `HOUSE_CACHE_DIR` | Persistent directory; defaults locally to the already-ignored `.data/house`. All server processes must use the same persistent filesystem for shared deduplication and budgets. |

The card labels provider-backed choices **AI commentary**, and fallback/mock choices **Auto commentary**. Dismiss hides this event for the browser session; Turn off persists an account-scoped preference across bets and reloads. Show commentary reverses either choice. No commentary request is needed while hidden. Choice caches are scoped by account and bounded; private names and full commentary text are not saved in browser storage.

## Persistence and cost

The server atomically creates a per-event fallback record **before** attempting a model call. That record survives failures and process restarts, preventing duplicate calls by competing workers on the same disk. Final choices are written atomically. A competing request may receive the fallback while the original call is running; the event is never regenerated just to replace it. On disk only hashes, choice IDs, source labels and empty budget markers are stored, not user text or credentials.

Limits per Supabase project namespace and shared disk:

- One attempt per stable event ID, including failed attempts.
- One call per bet/event-kind per 30-second clock bucket; resolution has a separate bucket from wagers.
- Ten calls per minute and 200 per UTC day (fixed windows).
- Only events no more than two minutes old may initiate generation. Historical views use cached choices or fallback, never backfill calls.

Disk failures fail closed to fallback. Budget exhaustion never affects betting. Cache files may be pruned when more than a day old; keep the current day's budget markers and all recent event claims. Pruning does not cause old events to be sent to the model because of the two-minute cutoff.

**Deployment limit:** this MVP targets a single persistent server, or workers sharing a filesystem with atomic exclusive creation/rename. Separate ephemeral disks cannot provide a global budget. On Vercel, provider calls stay disabled unless `HOUSE_CACHE_DIR` is explicitly configured; pointing it at `/tmp` is **not** persistent storage. Keep fallback mode on serverless hosts until a shared persistent cache/budget backend is implemented. No Supabase migration is needed for the local/demo deployment and none was added or applied.

## Local verification and demo

Use Node 22.6+ (verified with Node 24). Install dependencies normally and install the test browser once with `npx playwright install chromium`. Tests create temporary users and bets only in the in-memory Supabase stand-in. Stop the stand-in to discard them.

Terminal 1:

```sh
PORT=54419 node supabase/tests/local-supabase.mjs
```

Build a local-only frontend and API, then start it in terminal 2:

```sh
SUPABASE_URL=http://127.0.0.1:54419 SUPABASE_PUBLISHABLE_KEY=local NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54419 NEXT_PUBLIC_SUPABASE_ANON_KEY=local OPENAI_API_KEY= HOUSE_MODE=fallback npm run build
SUPABASE_URL=http://127.0.0.1:54419 SUPABASE_PUBLISHABLE_KEY=local OPENAI_API_KEY= HOUSE_MODE=fallback npm run start -- -H 127.0.0.1 -p 3219
```

Terminal 3:

```sh
npm run test:house
npm run test:series-sql
SUPABASE_URL=http://127.0.0.1:54419 API_URL=http://127.0.0.1:3219 npm run test:house-local
SUPABASE_URL=http://127.0.0.1:54419 API_URL=http://127.0.0.1:3219 npm run test:house-ui
SUPABASE_URL=http://127.0.0.1:54419 API_URL=http://127.0.0.1:3219 npm run test:chat-local
SUPABASE_URL=http://127.0.0.1:54419 API_URL=http://127.0.0.1:3219 npm run test:outcomes-local
SUPABASE_URL=http://127.0.0.1:54419 API_URL=http://127.0.0.1:3219 npm run test:ranges-local
npm run typecheck
npm run lint
```

Browser tests cover 1440px desktop and 390px mobile, real sign-in, placing a wager through the UI, live state updates, correct settlement/upset commentary, reload deduplication, dismissal/off preferences, and betting while commentary requests fail. Screenshots go to ignored `.data/house-ui-results`. Unit tests mock the exact Responses transport; no live OpenAI call is made.

For a manual demo, open `http://127.0.0.1:3219`, create local accounts and a series, then wager 600 of 1,000 starting coins. The card references the actual player, 600 coins, the selected outcome and 60% of starting bankroll. For an upset, have three players stake 50 on YES and 200 + 200 on NO, then resolve YES: The House reports the winning 11% side and 450-coin payout.

Implementation boundaries: `shared/house.ts` owns factual event derivation and safe phrasing; `src/server/house/` owns the adapter/cache; the commentary route owns authentication and source reads; `HouseCommentary.tsx` owns rendering/preferences. Existing betting state, SQL migrations, chat and settlement logic are unchanged.
