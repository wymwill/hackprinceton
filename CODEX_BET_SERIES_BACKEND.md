# Codex implementation task — Bookie / HackPrinceton Bet Series backend

**Task type:** Implement code, not just a design document.  
**Repository:** https://github.com/wymwill/hackprinceton  
**Priority:** Working backend vertical slice first, then complete as much of the scoped MVP as possible.  
**Date of handoff:** November 14, 2026.

> **Codex, read this entire file and the repository's existing `AGENTS.md` before editing. Inspect the current checkout and relevant code first. Then IMPLEMENT the backend described below, run tests/build, and report what you changed. Do not stop after giving me a plan. Use the current repository as source of truth for file paths, architecture, and overlapping work.**

## 0. Why this file exists

We are building **Bookie**, a friend-group social prediction/betting web app at HackPrinceton. We need a reliable backend for **Bet Series**, not just individually mocked bets. Other teammates are working on UI. Take ownership of server-side data models, lifecycle operations, REST endpoints, tests, and concise integration documentation. Do not redesign their screens.

This is a **virtual-coin, no-real-money** game. No deposits, payouts, or financial services.

### Known repository context (verify, do not assume)

- Public `main` was observed as a Next.js 16 App Router + React + TypeScript + Tailwind v4 project (`src/app`, `src/lib`, `src/screens`, `src/components`). Its README describes much of the UI as mocked.
- We previously discussed a teammate's branch named `feature/bet-lifecycle` which **may already contain** `/api/bets`, a server-side lifecycle and payout implementation, tests, and a local JSON store such as `.data/bookie.json`. I cannot confirm the current feature branch or these exact paths from this handoff. **Search the actual checkout and branches. Reuse existing functionality instead of recreating it.**
- The repository has a root `AGENTS.md` noting Next.js 16 breaking changes; it requires reading the relevant documentation from `node_modules/next/dist/docs/` before writing Next.js code. Honor this instruction.
- There may also be an earlier spec at `docs/bet-series-spec.md`. Read it if present. This task file restates all key product rules so it is usable alone. If specifications conflict with current code or one another, preserve established functionality and document the conflict rather than silently overwriting it.

## 1. Required product behavior (confirmed project decisions)

1. A **host creates a named Series**, with: title/description, number of planned YES/NO bets, roster of participants, virtual-coin starting bankroll (example: 1000), **X bottom-ranked losers fixed at creation**, and a selected penalty/stake mode.
2. Series starts in a **pre-betting lobby**. Eligible users can join and propose favors; the host can kick entrants **only before the series starts**.
3. On start, every admitted participant receives the fixed **series-specific** virtual bankroll exactly once. Do not use or mutate unrelated global balances.
4. A series contains a succession of simple **YES/NO** bets. Members can wager from their remaining series balance. The host may also place wagers, despite resolving the outcome.
5. **Host resolves** each bet. Standard two-sided settlement is **pari-mutuel**, proportional to each winning wager's share of the total stake on the winning side.
6. **All-on-one-side** rule: when every wager is on the same outcome, everybody gets their stake back, regardless of the host's chosen outcome.
7. **Cancellation** rule: when the host cancels a bet, all stakes are returned. A bet must never settle or refund more than once.
8. At Series completion, rank participants by remaining virtual coins. The **bottom X** lose the series.
9. For the **shared favor pool** mode, pairing is symmetric: rank **1** selects a favor for **absolute last place**, rank **2** selects for **second-to-last**, etc., for X top/bottom pairs. Favor proposals and eventual assignments require participant consent; do not treat favors as unconditionally enforceable obligations.
10. Penalty/favor modes must be designed to be **extensible**, but only `SHARED_FAVOR_POOL` requires end-to-end behavior in this task. Do not invent product requirements for other modes.
11. User interface design is owned by teammates. Provide APIs/types and a sample usage contract; make UI edits only if absolutely necessary for a smoke test, and keep them minimal.

## 2. Implementation decisions and constraints

- **Keep the existing Next.js stack.** Implement in server-side TypeScript / App Router route handlers and existing server modules. **Do not add a separate FastAPI service.**
- **Do not migrate to Supabase, add credentials, or replace persistence by default.** Inspect what exists. If an existing JSON-file store is already used, extend it for the local single-process hackathon MVP, note its deployment limitations, and structure data access so a future PostgreSQL/Supabase migration is feasible. If an existing shared database is already configured, use it instead. Ask only if truly blocked by required secrets or an architecture decision that cannot be made conservatively.
- Reuse existing bet IDs, user identity mechanism, validation, concurrency guards, and payout logic if present; avoid creating two parallel sources of truth for the same wager.
- If existing code has a demo identity switcher, follow its server-side convention **only as a temporary demo mechanism** and clearly mark it as insecure for public production. Do not silently trust arbitrary client-provided `userId` as an authorization system.
- Integer coin arithmetic only; check `Number.isSafeInteger` (or existing bigint/decimal strategy). Do not create coins through rounding or double-settlement.
- The server is authoritative for balance, series status, membership, and favor assignments; clients never provide authoritative balance/role/settlement totals.
- Preserve existing app routes, screens, CSS, and teammate changes. No destructive refactors. Do not reset, rebase, force-push, commit or push unless the user separately authorizes it. Do not overwrite uncommitted files.
- Make a minimal, maintainable design rather than an overbuilt microservice system.

## 3. Preflight: inspect the real working tree

Before changes, inspect and briefly summarize:

- `git status --short`, current branch, available relevant branches, and any uncommitted edits; **do not switch branches if it would risk local changes**.
- `package.json`, `AGENTS.md`, any nested agent instructions, Next.js version/docs, `src/app/api`, `src/lib`, database/storage helpers, tests, and server/client identity mechanism.
- Existing bet lifecycle: bet schema, transitions, settle/refund logic, handling of duplicate requests/concurrent calls, and where balances live.
- Existing team-facing screens and props only to understand their data requirements.

If already on a backend branch with relevant work, extend it. If on a branch missing important teammate work, **do not manufacture a fake replacement**: inspect available local branches, note missing dependencies, and implement safely against what is actually present. Prefer small isolated new files and route handlers.

## 4. Deliverables in priority order

### Milestone A — must finish first: create / join / start Series

1. Typed `Series`, `SeriesParticipant`, and any storage schema/types, with validation.
2. A storage layer that persists series and memberships using existing conventions.
3. **`POST /api/series`** — create a lobby series; creator becomes its host and participant. Accept `title`, `description`, `plannedBetCount`, `initialBankroll`, `loserCount`, `stakeMode`. Reject invalid values. `LOBBY` initial status.
4. **`GET /api/series/:seriesId`** — series details, participants, status, and balances visible to authorized viewers. Do not leak secrets.
5. **`POST /api/series/:seriesId/join`** — join only in lobby. Retry must not duplicate participant or mint coins.
6. **`POST /api/series/:seriesId/start`** — host only; validate participant/loser counts; initialize balances once and atomically change series to `ACTIVE`. Repeated and concurrent starts must not create more coins.
7. **`DELETE /api/series/:seriesId/participants/:userId`** — host-only removal during `LOBBY`; never allow removing the host. Optional member leave operation if compatible with current patterns.
8. Automated tests for create/join/start/permissions and repeat/concurrent requests.

**Minimum demo:** Host creates series with 5 bets, 1000 starting coins, and X=2; three or more friends join (with X=2 require at least four total); host starts once; every participant has exactly 1000 coins in that series; retrying start does not add more coins; balances are untouched in a different series.

### Milestone B — integrate YES/NO bets into a Series

Build on the existing bet lifecycle if it exists. Add or adapt routes to support series-scoped bets and wagers:

- `POST /api/series/:seriesId/bets` (host creates a question)
- `POST /api/series/:seriesId/bets/:betId/wagers` (series participant bets `YES` or `NO`, positive integer amount within available funds)
- `POST /api/series/:seriesId/bets/:betId/lock` (host stops wagering)
- `POST /api/series/:seriesId/bets/:betId/resolve` (host resolves exactly once)
- `POST /api/series/:seriesId/bets/:betId/cancel` (host refunds exactly once)
- Appropriate reads for bet list, active bet, wagers/pools and current user balance.

Adapt route naming to match existing conventions where it minimizes duplication. Return stable JSON errors and HTTP statuses. All membership, host checks, state checks, balance checks, and series/bet ID associations must execute server-side.

**Critical settlement rules:**

- On placing a wager, atomically debit stake and store immutable wager + ledger entry (if existing ledger architecture applies).
- Normal case with wagers on both sides: if total pool is `P`, winning-side stake total is `W`, a winning wager of stake `s` receives **gross payout** `P*s/W` (stake was already debited). Deterministically distribute integer rounding remainder so all gross payouts sum to **exactly P**.
- All-on-one-side bet: refund each player's original stakes, independent of result.
- Canceled bet: refund each player's original stakes.
- No wagers: resolution is allowed with zero payout, or keep the existing safe behavior; document which.
- Two-sided wagers but **zero wagers on the declared winning side**: this edge case is unsettled. **Conservative MVP default: refund every original stake, record this as an explicit policy**. Do not divide by zero or destroy the pool silently.
- Duplicate or racing resolve/cancel calls must not credit twice. Never let a wager overspend or use another series' bankroll.

### Milestone C — rankings, end-of-series and shared favor pool

- `GET /api/series/:seriesId/leaderboard` — sorted balances, ranking, loser category. Deterministic ties.
- `POST /api/series/:seriesId/complete` — host only, terminal once, cannot complete with open/locked bets. Require planned completed bets per policy below.
- Lobby favor proposals, e.g. `POST /api/series/:seriesId/favors`, read list, withdraw proposal and consent state. Persist explicit consent/eligibility; do not infer consent from submission alone if the assignment imposes an obligation on another participant.
- Final favor choices/assignments for `SHARED_FAVOR_POOL`: for X pairs, winner rank `i` picks an eligible, agreed favor for loser rank `n-i+1`. No duplicate winner/loser assignments; enforce pairing and consent in server code. If no valid favor can be assigned, record `PENDING_CONSENT` or equivalent rather than force assignment.
- Other stake modes: keep a typed mode discriminator/strategy seam but **do not build unrequested modes**.

### Milestone D — integration and handoff

- Add concise docs (for example `docs/bet-series-api.md`) with routes, request/response examples, auth/demo identity convention, sample end-to-end flow, decision notes, and migration/deployment caveats.
- Run available tests, typecheck, lint, build; implement additional focused tests. Fix failures caused by this change. Do not claim checks passed if not run.
- Show teammates how to call the first three endpoints; avoid UI redesign.

## 5. Proposed data contract (map onto existing types where possible)

```ts
type SeriesStatus = 'LOBBY' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
type Outcome = 'YES' | 'NO';
type StakeMode = 'SHARED_FAVOR_POOL'; // extensible later

type Series = {
  id: string;
  title: string;
  description: string;
  hostUserId: string;
  status: SeriesStatus;
  plannedBetCount: number; // positive integer
  initialBankroll: number; // positive safe integer, coins
  loserCount: number; // X fixed at creation, positive integer
  stakeMode: StakeMode;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
};

type SeriesParticipant = {
  seriesId: string;
  userId: string;
  joinedAt: string;
  balance: number; // initialize once at start; 0 or null while LOBBY
  finalRank?: number;
};

type SeriesBet = {
  id: string;
  seriesId: string;
  question: string;
  status: 'OPEN' | 'LOCKED' | 'RESOLVED' | 'CANCELLED';
  createdByUserId: string;
  winningOutcome?: Outcome;
  resolvedByUserId?: string;
};

type Wager = {
  id: string;
  seriesId: string;
  betId: string;
  userId: string;
  outcome: Outcome;
  amount: number;
  createdAt: string;
};

type FavorProposal = {
  id: string;
  seriesId: string;
  submittedByUserId: string;
  description: string;
  consentStatus: 'PROPOSED' | 'CONSENTED' | 'WITHDRAWN';
};

type FavorAssignment = {
  id: string;
  seriesId: string;
  winnerUserId: string;
  loserUserId: string;
  favorProposalId: string;
  status: 'PENDING_CONSENT' | 'CONSENTED' | 'DECLINED';
};
```

These are **conceptual**. Favor shape may need separate consent from `loserUserId`. Ensure assignment cannot become `CONSENTED` unless the assigned participant explicitly agrees. Adapt names to actual established repository types; do not scatter duplicate definitions.

### Example create request

```http
POST /api/series
Content-Type: application/json

{
  "title": "Princeton Weekend Predictions",
  "description": "Five predictions among friends",
  "plannedBetCount": 5,
  "initialBankroll": 1000,
  "loserCount": 2,
  "stakeMode": "SHARED_FAVOR_POOL"
}
```

The server determines the authenticated/demo caller from the existing request mechanism and makes them host; **do not accept `hostUserId` as an authoritative input**.

## 6. Safe provisional choices for otherwise undecided rules

The team has **not** approved these items. Use these narrowly scoped MVP defaults where necessary, isolate them for easy change, and document them in the implementation handoff:

- **Eligible roster at start:** `n >= 2*X`, since there must be X distinct top winners and X distinct bottom losers. Require at least 2 people. `X` cannot be changed after creation.
- **Tie-break:** sort by balance descending, then original join order/`joinedAt`, then stable `userId`; document it visibly. Exact equal balance counts remain a true tie in score but placement for pairing is deterministic.
- **Series count:** `plannedBetCount` counts **RESOLVED** bets (including refunded all-one-side resolutions), **not CANCELLED** bets. A canceled bet may be replaced; disallow starting more than one active (OPEN/LOCKED) bet at a time if this simplifies lifecycle, without silently breaking existing supported parallel bets. Disallow exceeding planned RESOLVED count.
- **Wagers:** for new series endpoints, permit multiple same-side wagers per user per bet if existing backend already supports it; otherwise one wager per user per bet is a reasonable MVP default. Disallow switching sides within one bet to minimize ambiguity. Clearly state the choice.
- **Empty or uncontested payouts:** zero wagers => no coin movement; one-sided wagers => refund; no stakes on winning outcome => refund (no division by zero).
- **Completion:** require exactly `plannedBetCount` resolved bets and no outstanding OPEN/LOCKED bets. Completion is idempotent and freezes final ranks.
- **Favor consent:** no favor is binding automatically. An assigned loser must explicitly accept an assignment before it shows as agreed; host/winner cannot bypass this. Never imply that refusal creates a real-world obligation.
- **Identity:** use existing mock session/identity mechanism for hackathon demo, clearly label that it is not secure for public production.

If a provisional choice conflicts with tests or established repository product behavior, prefer the established implementation and record the deviation. Do not invent other requirements.

## 7. Required validations / tests

At minimum, add automatic tests to cover:

1. Valid create returns `LOBBY` and host membership.
2. Invalid title/count/bankroll/X/mode are rejected; no partially created series.
3. Joining twice does not duplicate membership; joining after `ACTIVE` fails.
4. Only host can start or kick; cannot kick after start; host cannot kick self.
5. Start credits **each member exactly once** (retries and concurrent attempts); series balances are isolated.
6. Nonmember cannot wager; stake must be a positive integer; insufficient balance is rejected.
7. Racing wagers cannot produce negative balance; wrong `seriesId`/`betId` rejected.
8. Standard two-sided settle redistributes all coins with deterministic rounding; worked example: A 200 YES, B 100 YES, C 300 NO; YES resolution pays 400/200/0 gross.
9. All-on-one-side refunds every stake, even when the host declares the opposite outcome.
10. Host cancel refunds precisely once; racing cancel/resolve cannot duplicate payouts.
11. Locked/resolved/canceled bets reject new wagers; host may bet/resolve.
12. Completing with unclosed bets or too few resolved bets fails; completing twice has no extra effect.
13. Ranking is deterministic, top-to-bottom pairing is correct for X=1 and X=2, and no duplicate assigned loser.
14. Favor assignment requires proper eligibility and explicit consent; refusal leaves assignment unagreed.
15. Existing bet endpoints and existing tests still work.

Use existing test framework or the smallest fitting setup. Prefer deterministic tests independent of external services.

## 8. Output expected from Codex

After implementing, give me a compact but substantive report:

1. **Preflight findings:** current branch, actual relevant files, existing backend pieces reused.
2. **Implemented:** milestones A/B/C/D completed, routes and key code paths; distinguish fully implemented, partial, and not attempted.
3. **Data persistence:** where records live and limitations for hosting/multiple instances.
4. **Verified checks:** exact commands run and PASS/FAIL, plus tests added.
5. **How to demo:** precise local start command(s), identity selection method, and example Create → Join → Start requests or UI actions.
6. **Assumptions + blockers:** especially unresolved favor consent/other stake modes, and anything needed from teammates.
7. **Changed files:** high-level file list and potential merge conflicts; do not automatically push or alter teammates' branches.

### Important execution instruction

Work autonomously through the priority milestones; **do not stop at a plan**. When time or context is limited, finish Milestone A with tests before progressing to B. A working, integrated, well-tested subset beats a broad incomplete rewrite. Leave the existing UI intact and avoid hidden architectural migrations.
