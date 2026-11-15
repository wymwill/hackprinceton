# Claude Code Handoff: Alea Wrapped

## Repository state

- **Branch:** `feature/alea-wrapped`
- **Implementation commit:** `9b2a474` (`feat: add Alea Wrapped personal story`)
- **Base commit:** `5d3bfa84c8827057c73d41e31027888b2f515c5a` (main, includes The House)
- **Production database:** untouched
- **Remote operations:** none; this branch has not been pushed or merged
- **Working tree:** expected clean after the separate handoff-document commit; check `git status --short` and `git rev-parse HEAD`.

This document is a follow-up commit to `9b2a474`. Its own final commit SHA is reported by the handoff author in the task response; obtain it in the checkout with `git rev-parse HEAD`.

## Follow-up by Claude Code (latest)

Everything the checklist below asked for was rerun on this branch; the fumble-slide assertion passes on desktop and mobile. Fixed along the way:

- **Share card quote:** the opening “ was drawn over by the first line (each `<tspan x>` restarts at the margin). The quote marks now sit inside the first and last lines (`frontend/src/lib/poster.ts`). The old wrapper could also silently drop a word in the middle of a long quote; it now stops at the last whole word that fits and adds “…”. Unit tests in `tests/unit/wrapped.test.mjs`.
- **“Bets placed” headline number rendered at label size** (13px instead of ~180px) on the numbers slide, in the demo and signed-in story: `.number-hero span` also matched the number's inner span. Scoped to `.number-hero > span`; the browser test now checks the rendered size.
- **Close button on the loading/error screen** sat in the middle of the page: its rule targeted `.wrapped-load-message .wrapped-exit`, which never matched. Now `.wrapped-loading > .wrapped-exit`.
- **New signed-in browser test** (handoff step 5): sign in through the form, Profile → Your Alea Wrapped shows only that account's numbers (checked against the API, never another member's or the demo's), a new account gets the empty story, and a failed load shows the error state. `test:wrapped-ui` now runs the whole `wrapped.spec.mjs`.

Still open: native file sharing on a real device, live OpenAI, and everything under “Deliberately deferred”.

## Project overview and architecture

Alea is a social virtual-coin betting application. The repository combines a Next.js App Router server/API layer with a Vite-built React client under `frontend/`. Supabase provides authenticated identity and application data. The existing betting experience tracks markets/series and each member's current wager, while settlement records contain final stake, payout, net, and settlement time. The House commentator already exists on the base commit (`feature/ai-commentator` was merged into `main` before Wrapped work).

Wrapped is a personal, annual, read-only recap. The main path is:

1. The React client opens `/wrapped` for the authenticated personal story, or `/wrapped-demo` for an explicitly fictional public demo.
2. `GET /api/wrapped?year=YYYY` authenticates the caller and invokes the existing series action to read that caller's `my_series_state` snapshot. It does not accept a user ID as authority.
3. `shared/wrapped.ts` converts verified snapshot records into deterministic analytics and a compact story summary.
4. The server passes only a controlled event/flavor and numeric signals to the existing House adapter. Usernames and market descriptions are excluded from model context. If credentials, provider availability, or persistent cache are unavailable, a deterministic House line is used.
5. The client renders a lazy-loaded nine-slide story and creates the closing PNG locally on explicit user action.

No new database table, migration, or persistent recap URL is used. The personal endpoint returns private/no-store data. The demo summary is a separate fictional constant and does not call the personal API.

## Original feature requirements and scope

The product brief requested a polished Spotify-Wrapped-like, mobile-first personal story using real betting history; deterministic archetypes; best win and worst loss; social awards; a meaningful timeline; a House verdict; shareable image export; a clearly marked demo; and safe handling of private records. It also proposed friend comparisons, clan awards, links into original markets, replay/navigation/accessibility, and optional sharing. Statistical claims had to be based on stored data, not invented odds, balances, relationships, or outcomes. The brief explicitly prohibited production database changes and required no live AI credentials to use the feature.

This commit prioritizes the P0 personal vertical slice. Clan Wrapped, public/private recap links, comparison pages, and chat sharing were intentionally not included because the existing application has no recap authorization/token mechanism, and those items are outside the minimal safe personal feature.

## Status: implemented and tested

The following are implemented. Test coverage is described separately below so “implemented” is not confused with complete end-to-end verification.

- Authenticated personal route and `/api/wrapped` endpoint; callers cannot select another user's ID. Endpoint data is private/no-store and year-scoped.
- Nine-slide story: introduction, actual totals, archetype, strongest win, worst loss, qualifying social awards, cumulative settlement timeline, House verdict, and final summary/poster.
- Public fictional `/wrapped-demo`, visibly marked as demo throughout the story and exported poster.
- Deterministic analytics and archetype rules, including empty-account behavior and minimum evidence thresholds.
- Context links for best/worst moments to the original in-series market where the source supports that link.
- Existing House integration with deterministic offline commentary. House input excludes untrusted username/market text and does not perform or affect any betting/settlement operation.
- Direct slide progress controls, previous/next, keyboard controls, touch swipe, reduced-motion handling, and responsive story layouts.
- Explicit PNG export (1080×1920); native share is used only where browser support exists, otherwise download remains available.
- Profile links for the personal experience and public demo; Wrapped is lazy-loaded by the client router.
- Automated tests for analytics/edge cases, House adapter constraints/fallback, loopback-only local API behavior, and browser demo navigation/export/accessibility modes.

## Statistical definitions and architectural decisions

These decisions are important; preserve them unless the stored schema or product owner changes the requirements.

- One member's wager in one market/series is counted once. Settled stake, payout, and net come from the recorded settlement result; open-market stake comes from the current aggregate wager.
- Total wager volume includes committed stakes later refunded/canceled. Net profit/loss uses actual `series_bet_results.net` for resolved records only. Current coin balance is never treated as historical profit.
- Win rate is profitable (`net > 0`) non-refunded, non-tied resolved wagers divided by the same eligible set. Pending, canceled, refunded, tied, and missing-outcome records are excluded. A first-listed tie can affect actual net but is not counted as a win or loss for win rate/streaks.
- Streaks use eligible settled records ordered by settlement time; zero breaks a streak. Timeline accumulates actual settlement net (including real tie payout effects). Missing/out-of-year timestamps are excluded rather than guessed.
- The requested report year is interpreted in UTC. Resolved records need a settlement timestamp; wager creation time is not substituted. Open/canceled records use wager timestamps.
- Best/worst moments are selected by highest/lowest actual net, not current balance or hypothetical implied odds.
- Social comparisons are calculated only from members in the same series and shared eligible settlements, with at least five shared comparisons. “Nemesis” reflects the other member's better net on those shared markets; alignment/opposition use stored selections. Results are returned only to the recap owner.
- Archetypes are deterministic, ordered, and sample-gated. Undefeated needs at least 8 eligible wins and no eligible losses; comeback needs at least 5 dated eligible settlements and a documented recovery; sniper needs 8–20 bets, at least 8 eligible outcomes, and at least 75% wins; other labels also have wager/outcome minimums. Chaos merchant needs at least 5 eligible results; otherwise a steady-hand label is used. A zero-wager account is Fresh Account.
- The source has current aggregate wagers and first/updated timestamps, not a full wager-edit history, historical odds, or the crowd consensus at each bet placement. Wrapped therefore does not make claims about those unavailable facts.
- The House is constrained to a small event schema and fixed joke catalog for this summary; its job here is language/personality, not financial calculation. Deterministic fallback keeps the experience independent of an API key and cache deployment.
- Local poster generation avoids sending private account data to a third-party image service and requires no external image dependency.

## Files created or changed

All files below are in implementation commit `9b2a474`.

**New files**

- `shared/wrapped.ts` — analytics types, summary calculation, deterministic archetypes, demo fixture, story helper logic.
- `src/app/api/wrapped/route.ts` — authenticated private API endpoint.
- `frontend/src/pages/Wrapped.tsx` — story mode, navigation, loading/error/empty states, demo, and poster export/share.
- `frontend/src/pages/Wrapped.css` — story visuals, responsive layouts, transitions, reduced motion.
- `tests/unit/wrapped.test.mjs` — deterministic analytics tests.
- `tests/browser/wrapped.spec.mjs` — browser coverage for demo flow, navigation, mobile swipe, reduced motion, and image export.
- `tests/e2e/wrapped-local.mjs` — loopback-only local API test using the repository's in-memory Supabase test stand-in.
- `docs/alea-wrapped.md` — user/developer-facing definitions and local test commands.

**Modified files**

- `frontend/src/App.tsx` — lazy route composition for `/wrapped` and `/wrapped-demo`; demo can render without sign-in/provider initialization.
- `frontend/src/pages/Profile.tsx` — personal Wrapped and demo entry points.
- `shared/house.ts` — Wrapped event flavor and stable deterministic fumble quip support.
- `tests/unit/house.test.mjs` — Wrapped adapter/fallback coverage.
- `playwright.house.config.mjs` — include Wrapped browser spec in the existing test configuration.
- `package.json` — Wrapped test scripts.

## Bugs, fixes, and risks discovered

- **No reliable historical probability/consensus data:** The stored source does not preserve odds or each bettor's pre-resolution group-consensus snapshot. An upset/contrarian story would be fabricated, so this recap does not claim one.
- **Current balance is not historical P/L:** The analytics use settlement net records rather than balances.
- **Tie/refund/cancellation ambiguity:** Explicit eligibility rules keep refunded, void, pending, and tied outcomes from inflating win rate or streaks while preserving actual recorded financial net where appropriate.
- **Privacy and identity:** The API ignores a supplied user ID and uses the authenticated caller's snapshot. Demo records are isolated from the account route.
- **LLM prompt injection / unsupported facts:** User names and market descriptions are not sent to the House adapter. House outputs are bounded to the existing fixed catalog and verified numeric signals.
- **Potential serverless cache limitation:** Existing House deduplication/cache relies on local `.data/house`; it is not a shared durable cache in many serverless environments. The endpoint remains functional with deterministic fallback, but cross-instance generation/deduplication is not guaranteed in such deployment. No schema change was introduced to solve this.
- **Fumble browser assertion changed late:** it was added after the last browser run; it has since been rerun and passes on desktop and mobile (see the follow-up section).
- No production defect was attempted against a live service. No production Supabase project or database was contacted or changed.

## Validation results and evidence boundary

The recorded validation before the handoff commit was:

| Check | Result | What it covers |
| --- | --- | --- |
| `npm run test:series-sql` | Passed, 87 tests | Existing SQL regression suite for series, outcomes, ranges, upgrades, social, and chat. |
| `npm run test:wrapped` | Passed, 7 tests | Wrapped analytics, definitions, archetype and edge-case rules. |
| `npm run test:house` | Passed, 16 tests | Existing House behavior plus Wrapped-specific constrained/fallback behavior. |
| `npm run test:wrapped-local` | Passed | Auth rejection, invalid year, caller identity, own snapshot calculations, thresholds, fallback, user-ID parameter ignored; local in-memory Supabase stand-in only. |
| `npm run test:wrapped-ui` | Passed, 2 browser projects | Public demo story, desktop/mobile navigation, swipe, reduced motion, poster download/export. Run occurred before the final fumble-slide assertion/screenshot was added. |
| `npm run typecheck` | Passed | Root and frontend TypeScript checks. |
| `npm run lint` | Passed | Repository ESLint command. |
| `npm run build` | Passed | Vite client and Next server builds; `/api/wrapped` is included. Vite reports the existing large main chunk warning (>500 KB); Wrapped itself is a separate lazy chunk (~28 KB). |
| `git diff --check` | Passed before commit | Whitespace check. |
| Client bundle secret scan | Passed | No `OPENAI_API_KEY` marker or server OpenAI endpoint was found in generated frontend JS. |

No test here proves live OpenAI behavior, production deployment configuration, or a full authenticated browser run against production-like identity/data. The local authenticated API test uses synthetic in-memory data. No test writes production data. A direct final rerun is recommended by the next agent because the handoff follows a context interruption and the fumble UI assertion landed after browser testing.

## Partial, unfinished, or unverified functionality

**Implemented but needs additional verification**

- ~~Fumble-slide assertion and a signed-in browser flow~~: done in the follow-up; both pass.
- Native file sharing depends on browser/device capability; only the download path was automated.

**Deliberately deferred**

- Clan Wrapped awards, clan membership/policy checks for a group recap, and group poster.
- Public share URL, view-a-friend recap, privacy-safe recap token, recap comparison, and clan-chat sharing.
- Historical odds, implied probabilities, bet-time consensus, and wager-change timeline (not present in stored source data).
- Audio narration, optional sound, intensity settings, Roast Me, rivalry feed, and other P2/stretch ideas.
- Live OpenAI generation verification. The feature works without credentials; no API key was created or configured for this task.

## Environment variables and external dependencies

Names only; do not put values in this document, logs, screenshots, or commits.

- House/OpenAI: `OPENAI_API_KEY`, `OPENAI_HOUSE_MODEL`, `HOUSE_MODE`, `HOUSE_CACHE_DIR`
- Supabase/application: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY`, `API_URL`, `PORT`
- Dependencies already present: Next.js `16.4.6`, React/React DOM `19.3.0`, `@supabase/supabase-js`, TypeScript, ESLint, Playwright, Node's built-in test runner, and the repository's PGlite test stand-in. No new package was added for Wrapped.
- The browser tests require the installed Playwright browser binaries. The local API integration test runs a local app/test stand-in and refuses non-loopback service URLs.

## Exact next steps for Claude Code

1. Run `git status --short`, `git branch --show-current`, `git log -3 --oneline`, and `git rev-parse HEAD`; confirm branch `feature/alea-wrapped`, implementation commit `9b2a474`, and the clean handoff tip.
2. Read this file and `docs/alea-wrapped.md`, then inspect `shared/wrapped.ts`, `src/app/api/wrapped/route.ts`, and `frontend/src/pages/Wrapped.tsx` before changing behavior.
3. Re-run the changed-path suite locally: `npm run test:wrapped`, `npm run test:house`, `npm run test:wrapped-local`, and `npm run test:wrapped-ui`. In particular, confirm the fumble slide assertion and screenshot now pass. Keep local services loopback-only and use only the in-memory test stand-in.
4. Run `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:series-sql`; report any differences from the results above.
5. Add a local authenticated browser flow if the existing test harness supports it safely: sign in as a test identity, open Profile → Your Alea Wrapped, confirm only that identity's local fixture is shown, and verify empty/error states. Do not use production credentials or database.
6. Review mobile screenshots and the exported PNG at full resolution, plus reduced-motion behavior. Verify native share only on an appropriate local device/browser if available.
7. Before enabling real OpenAI requests, review the existing House adapter and deployment cache behavior. Test only with an owner-provided credential in a secure environment variable; never commit or echo it. Confirm the deterministic fallback still works with the variable absent.
8. Keep clan recaps, public links, and group sharing deferred until there is an explicit privacy/authorization design. Do not introduce a migration or apply production changes without separate approval.

Do not push or merge this branch, change production data, or rewrite history as part of this handoff.
