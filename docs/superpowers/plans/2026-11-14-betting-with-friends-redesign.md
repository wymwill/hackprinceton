# Betting with Friends Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Revised 2026-11-14: keeps the AI Bookie, dares and a demo group. Timothy's LMSR math, groups and resolution flow are unchanged where possible.

**Goal:** Groups with a Slack-style switcher, per-group currency (tokens or points), Kalshi-style LMSR markets whose opening chance the AI Bookie sets, evidence review by the Bookie with propose-then-dispute resolution, and dares with proof and group approval.

**Architecture:** Keep Next.js 16 and the JSON-file store with `transact` (`src/server/store.ts`). Replace the pool-betting server (`src/server/bets.ts`, `src/lib/bets/*`) with groups, markets and dares modules, plus pure LMSR math shared with the client. Generalize the existing AI modules in `src/server/ai/` from bets to markets rather than rewriting them. Pages move under `/g/[groupId]`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 tokens, Node 24 (`node --test` runs `.ts` directly), `@anthropic-ai/sdk` with Claude Opus 5.5, e2e scripts over HTTP.

**Spec:** `docs/superpowers/specs/2026-11-14-betting-with-friends-redesign-design.md`

## Global Constraints

- Cookie `bwf_user`. Env: `BWF_DATA_FILE` (default `.data/bwf.json`), `BWF_DISPUTE_WINDOW_MS` (default `86400000`), `BWF_DARE_WINDOW_MS` (default `172800000`), `BWF_SEED` (`demo` default, or `empty`), `BWF_URL` for e2e. AI keeps `BOOKIE_AI` (`claude`, `off` or `stub`) and `BOOKIE_AI_MODEL` (default `claude-opus-5-5`).
- LMSR `b = 25`. A contract pays 100. Prices are integers 1–99 in the UI. Buy cost is `ceil(100·ΔC)` and sell proceeds are `floor(100·ΔC)`. The starting chance is 5–95, default 50.
- Points scoring: a correct pick earns `max(10, 100 − sidePct)`, where `sidePct` is the rounded % of pickers on your side at settlement. A wrong pick earns 0.
- Tokens `startingBalance` is 100–100,000. Invite code alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, length 8.
- **AI is advisory.** No AI output changes a balance, a score or a result. Every AI call has a non-AI fallback, and the whole e2e suite passes with `BOOKIE_AI=off` and with `BOOKIE_AI=stub`.
- AI calls run after the HTTP response (`after()`), with a 45s timeout. AI outputs are stored with `model`, `at`, `source: "ai" | "baseline" | "stub"` and `facts`, and listed in the audit trail.
- UI: keep the copper/grey tokens. Periwinkle (tertiary) is only for the Bookie. Plain language, with no "LMSR", "oracle" or "arbiter" in the UI. No CRT effects. No real-money option.
- UI task verification: `npx tsc --noEmit -p .` clean, `npm run lint` 0 errors, a browse screenshot at 1440×900 with no console errors.

## Review Focus

1. Buying with a spend below one contract's cost returns 400 `too_small`, with nothing charged.
2. Selling more contracts than held, or selling after close, returns 409 with no changes.
3. Joining a tokens group twice, or with a second invite, grants the starting balance once.
4. In a points group the trade endpoint returns 409 `wrong_mode`, and changing a pick after close returns 409.
5. The house loss on a settled market never exceeds 1,733 tokens, after many random buys and sells.
6. The Bookie's estimate re-seeds the price only when there are zero trades. After the first trade it never moves the price, even if the estimate arrives late.
7. The Bookie's recommendation never settles a market by itself. Only the host's proposal plus the vote rules do.
8. A dare is owed only by losers of a settled, non-void market, and only winners can vote on its proof.

Tests for 1–5 are in Tasks 2 and 4, 6 is in Task 5, 7 is in Task 6, and 8 is in Task 7.

---

### Task 1: Commit the visual work so far

- [x] Done in `d3b072c` (copper/grey theme, fonts, rename to Betting with Friends, CRT removed). The Dares page removal in that commit is reversed by Task 7, which rebuilds dares on markets.

### Task 2: LMSR math

**Files:** Create `src/lib/markets/lmsr.ts` and `src/lib/markets/lmsr.test.ts`. Modify `tsconfig.json` (`"allowImportingTsExtensions": true`) and `package.json` (`"test:unit": "node --test src/lib/**/*.test.ts"`).

**Produces** (no imports, usable on client and server):
- `B = 25`, `PAYOUT = 100`
- `type Q = { yes: number; no: number }`
- `priceYes(q: Q): number` (0..1)
- `initialQ(chancePct: number): Q`, returning `{ yes: B·ln(p/(1−p)), no: 0 }`
- `quoteBuy(q: Q, side: "yes"|"no", spend: number): { contracts: number; cost: number }`: the largest integer number of contracts with `ceil(100·ΔC) ≤ spend` (binary search, at most 100,000 contracts)
- `quoteSell(q: Q, side, contracts: number): number`: proceeds `floor(100·ΔC)`
- `applyTrade(q: Q, side, deltaContracts: number): Q`

- [ ] **Step 1: Write tests:** `priceYes(initialQ(50)) === 0.5`; `Math.round(priceYes(initialQ(80))*100) === 80`; `quoteBuy(initialQ(50),"yes",49)` gives `{contracts:0,cost:0}`, and with 51 gives `{contracts:1, cost:51}`; buying then selling the same contracts returns at most the cost; buying YES raises `priceYes`; house loss bound: from `initialQ(50)`, buy 10,000 tokens of YES, settle YES, and check `contracts*100 − cost ≤ 1733`.
- [ ] **Step 2:** `npm run test:unit` fails (module missing).
- [ ] **Step 3:** Implement using the log-sum-exp form for numeric stability.
- [ ] **Step 4:** `npm run test:unit` passes.
- [ ] **Step 5:** Commit: `Add LMSR pricing math with tests.`

### Task 3: Groups, data model, seeds

**Files:**
- Rewrite: `src/server/store.ts` (types and file path), `src/server/seed.ts` (demo and empty), `src/server/http.ts`
- Create: `src/server/groups.ts`, `src/server/errors.ts` (`AppError(status, code, message)`), `src/lib/markets/types.ts`, `src/app/api/groups/route.ts` (POST create), `src/app/api/groups/join/route.ts` (POST `{code}`), `src/app/api/groups/[id]/route.ts` (PATCH)
- Modify: `src/app/api/state/route.ts` (`?group=` query), `src/app/api/session/route.ts`
- Delete: `src/server/bets.ts`, `src/app/api/bets/`. Keep `src/lib/bets/odds.ts` and move it to `src/lib/markets/baseline.ts` (Task 5 uses it).
- Test: rewrite `scripts/e2e-lifecycle.mjs` as `scripts/e2e.mjs`, and set `"test:e2e": "node scripts/e2e.mjs"` in `package.json`.

**Produces:**
- `Db = { version: 2; users; groups; memberships; markets; trades; picks; ledger; receipts; evidence; reviews; aiLog; dares; dareVotes }`.
- `LedgerRow = { id, groupId, userId, marketId?, kind: "grant" | "buy" | "sell" | "payout" | "refund" | "score", amount, createdAt }`. A balance in a group is the sum of that user's rows in that group.
- `groups.ts`: `createGroup(db, userId, {name, emoji?, mode, startingBalance?})`, `joinGroup(db, userId, code)`, `updateGroup(db, userId, groupId, patch)`, `requireMember(db, userId, groupId)`, `balanceIn(db, groupId, userId)`.
- `types.ts`: `GroupMode = "tokens" | "points"`, `GroupView { id, name, emoji, inviteCode, mode, startingBalance, darePresets, ownerId, locked, members: MemberView[] }`, `MemberView { userId, name, role, balance, positionValue, points, record: {wins, losses}, streak, dares: {done, skipped} }`, `AppState { me, users, groups, group, markets, dares, ai: {mode, model?}, serverTime }`.
- Seeds: `demo` builds "The Boyz Gym Arc" (tokens, 1,000) with Alex, Sam, Priya, Marcus, Elena and Jake. It includes about 10 settled markets with receipts (Jake 2 and 7 on fitness), 2 open markets including "Will Jake make 6 AM leg day?", 1 closed market with 2 evidence items, and 1 dare in each status. `empty` builds `Player 1` to `Player 4` and no groups.

Rules: `mode` other than tokens or points returns 400. A non-member asking for a group gets 404. PATCH is owner-only (403 `not_owner`). `mode` or `startingBalance` in a PATCH after the first market returns 409 `locked`. Joining grants `startingBalance` once (tokens mode only).

- [ ] **Step 1: e2e tests:** with `BWF_SEED=empty`, `p1` creates a tokens group and gets 1,000; `p2` creates a points group and their balance is 0; `p3` joins by code twice, the second time gets 409 `already_member`, and the balance is granted once; `p4` getting state for a group they're not in gets 404; `p2` patching `p1`'s group name gets 403. With `BWF_SEED=demo`, state lists the demo group with 6 members and at least 10 settled markets.
- [ ] **Step 2:** Run against `BWF_DATA_FILE=/tmp/bwf-test.json BWF_DISPUTE_WINDOW_MS=3000 BWF_DARE_WINDOW_MS=3000 BOOKIE_AI=stub npm run dev` (delete the file first). It fails.
- [ ] **Step 3:** Implement. Group ids are `g_xxxxxxxx` via the existing `newId`, and the demo group id is `demo`.
- [ ] **Step 4:** The e2e group checks pass. `npx tsc --noEmit -p .` errors only in UI files, which are rebuilt in Tasks 8–10.
- [ ] **Step 5:** Commit: `Add groups with invite codes, per group balances and demo and empty seeds.`

### Task 4: Markets: create, trade, pick, close

**Files:** Create `src/server/markets.ts` and the routes `src/app/api/groups/[id]/markets/route.ts` (POST), `src/app/api/markets/[id]/trade/route.ts`, `.../pick/route.ts` and `.../close/route.ts`. Extend `scripts/e2e.mjs`.

**Produces:**
- `Market { id, groupId, question, rule?, dare?: DareSpec, hostId, createdAt, deadline, q: Q, history: {at, yes, source: "market" | "bookie"}[], tradeCount, bookie?: BookieEstimate, proposal?, receiptId? }`, `Trade { id, marketId, userId, side, contracts /* negative = sell */, amount /* tokens, negative = received */, createdAt }`, `Pick { marketId, userId, side, updatedAt }`.
- `DareSpec = { kind: "none" } | { kind: "preset" | "custom" | "bookie"; text: string } | { kind: "wheel" }`.
- `createMarket(db, userId, groupId, {question, rule?, deadline, chance?, dare?})`: the question is 3–140 characters, the rule at most 160, a dare text at most 80, and the deadline must be in the future and within 90 days.
- `trade(db, userId, marketId, {action: "buy"|"sell", side, amount})`: for a buy, `amount` is the spend, and for a sell it's the number of contracts.
- `pick(db, userId, marketId, side)` and `closeMarket(db, userId, marketId)` (host only).
- `MarketView { id, groupId, question, rule?, dare?, hostId, createdAt, deadline, status, chance, bookie?, volume, history, positions: {userId, yes, no, spent}[], picks: {userId, side}[], evidence, review?, proposal?, receipt? }`.

- [ ] **Step 1: e2e tests:** creating in a tokens group with chance 70 gives `chance === 70`; `p2` buying YES with 200 drops their balance by the returned cost (at most 200), raises the chance, and shows contracts in `positions`; buying with 10 at 70% gives 400 `too_small`; selling more than held gives 409; `p2` selling half raises their balance by the proceeds; a non-member trade gives 404; buying after `close` gives 409; in a points group, a trade gives 409 `wrong_mode`, and picking Yes then No leaves one pick on No; picking after close gives 409; 8 concurrent buys by one user never overdraw.
- [ ] **Step 2:** Run. It fails. **Step 3:** Implement using `lmsr.ts`. **Step 4:** Run. It passes.
- [ ] **Step 5:** Commit: `Add Kalshi style markets with LMSR trading and points picks.`

### Task 5: The Bookie's odds on markets

**Files:** Modify `src/server/ai/bookie.ts`, `src/server/ai/claude.ts` (generalize `estimateOdds` input from a bet to a market: question, rule, subject, settled history from the group), `src/lib/markets/baseline.ts`. Create `src/app/api/markets/[id]/odds/route.ts` (POST re-estimate). Wire the create route to run `refreshOdds(marketId, "created")` in `after()`. Re-estimate open markets about a subject when that subject's market settles (keep the existing trigger). Extend `scripts/e2e.mjs`.

**Produces:** `BookieEstimate { chance, range: [lo, hi], uncertainty: "low" | "medium" | "high", explanation, facts: string[], source, model?, at }`, plus `applyBookieEstimate(db, marketId, estimate)`.

Rules: if `tradeCount === 0` and the market is open, set `q = initialQ(estimate.chance)` and add a `history` point with `source: "bookie"`. Otherwise store the estimate only. In points mode with no picks, the shown chance is the estimate.

- [ ] **Step 1: e2e tests (stub mode):** a new market about Jake in the demo group gets a Bookie estimate within 5s that cites at least one stored market and moves the price to the estimate; a market with one trade before the estimate keeps its price, and the estimate shows separately; `POST /odds` re-estimates; with `BOOKIE_AI=off`, the baseline estimate is stored with `source: "baseline"`; the audit trail lists each estimate.
- [ ] **Step 2:** Run. It fails. **Step 3:** Implement. **Step 4:** Run with `stub` and with `off`. Both pass.
- [ ] **Step 5:** Commit: `Have the Bookie set the opening chance on new markets.`

### Task 6: Evidence, the Bookie's review, and resolution

**Files:** Modify `src/server/markets.ts` and `src/server/store.ts` (call `sweep` inside `transact`). Move the existing evidence and review logic from the bet routes to the routes `src/app/api/markets/[id]/evidence/route.ts`, `.../review/route.ts` (POST Ask the Bookie), `.../result/route.ts` (`{outcome: "yes"|"no"|"void"}`) and `.../vote/route.ts` (`{vote: "confirm"|"dispute"}`). Keep `src/app/api/evidence/[id]/route.ts` for serving images. Extend `scripts/e2e.mjs`.

**Produces:** `postEvidence`, `requestReview` (wraps the existing `reviewEvidence`), `proposeResult`, `vote`, `sweep(db, now)`, and `Receipt { id, marketId, outcome, voided, settledAt, results: {userId, net, payout, points}[], roast?, reviewId? }`. A roast is generated in `after()` once the market settles, with a stock line as the fallback.

Rules follow the spec's Evidence and resolution section. Proposing on an open market closes it first. Voters are users with a position or pick, minus the host. Evidence is allowed only from members in the market, and only while it's closed or in review.

- [ ] **Step 1: e2e tests:** a non-host proposing gets 403; the host voting gets 403; a non-voter voting gets 403; two voters both disputing sends it back to `closed` with no proposal, and a re-proposal has empty votes; a dispute changed to confirm plus another confirm settles it, with each YES contract paid 100; a host-only market settles on proposal; window: one confirm, `sleep(3500)`, then getting state shows `settled`; void (tokens) returns everyone to their pre-market balance; a settled points market gives correct pickers `max(10, 100 − sidePct)`; the house loss is at most 1,733; **the Bookie's review alone never changes status or balances**; in stub mode, two agreeing evidence items give a recommendation and contradicting ones give "needs a human"; the receipt has a roast in `stub` mode and a stock line in `off` mode.
- [ ] **Step 2:** Run. It fails. **Step 3:** Implement. **Step 4:** `npm run test:e2e` and `npm run test:unit` pass in `stub` and in `off`.
- [ ] **Step 5:** Commit: `Add evidence, Bookie review and propose and dispute resolution.`

### Task 7: Dares

**Files:** Create `src/server/dares.ts` and the routes `src/app/api/markets/[id]/dare-suggestion/route.ts` (POST, Bookie suggests a dare for a draft or existing market), `src/app/api/dares/[id]/proof/route.ts` and `src/app/api/dares/[id]/vote/route.ts` (`{vote: "approve"|"redo"}`). Extend `sweep` and `scripts/e2e.mjs`.

**Produces:** `Dare { id, groupId, marketId, text, owedBy, owedTo: string[], dueAt, status: "todo" | "voting" | "done" | "skipped", proof?: {text?, evidenceId?, at} }` and `DareVote { dareId, userId, vote }`. On settlement, one `Dare` is created per loser (not for void). The wheel picks a preset at random when the market settles, seeded by the market id so tests are stable.

Rules: posting proof moves a dare to `voting`. A majority of `owedTo` approving marks it `done`, and a majority choosing redo sends it back to `todo` with the proof cleared. At `dueAt`, `voting` becomes `done` and `todo` becomes `skipped`. Only `owedTo` can vote, and only `owedBy` can post proof.

- [ ] **Step 1: e2e tests:** a tokens market settles with three winners and two losers, creating two dares owed to the three winners; a winner posting proof gets 403; a loser posting proof moves it to `voting`; a loser voting gets 403; 2 of 3 winners voting redo sends it back to `todo`; approval marks it `done`; after `sleep(3500)` an unproven dare is `skipped`; a void market creates no dares; the wheel picks a preset stably; dare suggestion returns text in `stub` and a preset in `off`; leaderboard `dares.done` and `dares.skipped` match.
- [ ] **Step 2:** Run. It fails. **Step 3:** Implement. **Step 4:** Run. It passes.
- [ ] **Step 5:** Commit: `Add dares with proof, group approval and the dare wheel.`

### Task 8: App shell: provider, routes, sidebar switcher

**Files:**
- Rename `src/components/BookieProvider.tsx` to `src/components/AppProvider.tsx` (`useApp()`). Rewrite it for `AppState`. It takes `groupId` from the route, and its actions are `createGroup, joinGroup, updateGroup, createMarket, trade, pick, closeMarket, postEvidence, askBookie, proposeResult, vote, suggestDare, postDareProof, voteDare, switchUser`. Keep the 4s poll and the hydration-safe sidebar (`useHydrated`).
- Create `src/app/g/[groupId]/layout.tsx`, `src/app/page.tsx` (redirect to the first group or render `NoGroups`), `src/screens/NoGroups.tsx`, `src/components/GroupSwitcher.tsx`, `src/components/CreateGroupModal.tsx` and `src/components/JoinGroupModal.tsx`.
- Rewrite `src/components/Sidebar.tsx`, `src/components/Header.tsx` (Playing as, search, and the AI status chip from `state.ai`) and `src/lib/data.ts` (NAV built from groupId: Markets, Leaderboard, Dares, Settings).
- Delete the old bet pages and screens once Tasks 9–10 replace them.

Switcher: a button showing the current group's emoji, name and a chevron. Its menu lists your groups (linking to `/g/[id]`), a divider, Create group, and Join with code. Create group modal: name, emoji, currency (Tokens or Points), and a starting balance for Tokens (default 1,000).

- [ ] **Step 1:** Implement, with placeholder pages for the four group routes.
- [ ] **Step 2:** Browse: `/` lands on `/g/demo`; the switcher lists the demo group; creating a points group switches the URL; joining with the demo code as a new user from another group works.
- [ ] **Step 3:** Commit: `Add the group switcher shell and routes.`

### Task 9: Markets list and New market

**Files:** Create `src/screens/Markets.tsx`, `src/components/MarketCard.tsx`, `src/components/NewMarketModal.tsx`, `src/components/PriceChips.tsx` and `src/components/BookieChip.tsx`, and the page `src/app/g/[groupId]/page.tsx`. Reuse the existing `src/components/market/*` where they fit.

Markets: a "How it works" explainer (localStorage `bwf_explainer_dismissed`, in try/catch), a Closing soon strip (open, under 24h, at most 4), filters (Open, Needs result, In review, Settled), and cards showing the question, the chance, a Bookie chip when its estimate differs from the price by 5 or more points ("Bookie says 18%"), and Yes and No price chips that open the market page with that side preselected (`?side=yes`). Cards also show volume, deadline or status, and the dare. Points groups show "Pick Yes" and "Pick No" with the pick share. Right rail: your positions and recent activity (at most 10). New market: question, how we'll know, deadline presets (1h, tonight, 1d, 1w, custom), a starting chance slider (tokens only) with the hint "The Bookie will adjust this before anyone trades", and the dare (preset chips, "Ask the Bookie", "Spin the wheel" or custom).

- [ ] **Step 1:** Implement. **Step 2:** Browse: as Sam, create "Will Jake make 6 AM leg day?". It appears in Open, then the price moves to the Bookie's chance and the card shows the Bookie line. **Step 3:** Commit: `Add the markets list and new market form.`

### Task 10: Market page, Leaderboard, Dares, Settings

**Files:** Create `src/screens/{Market,Leaderboard,Dares,Settings}.tsx`, `src/components/TradeTicket.tsx`, `src/components/ChanceChart.tsx` (an inline SVG with market and Bookie lines), `src/components/BookieCard.tsx`, `src/components/ResolutionPanel.tsx` (reuses `EvidencePanel`, `SettlementReview` and `AuditTrail`) and `src/components/DareCard.tsx`. Add the pages under `src/app/g/[groupId]/{m/[marketId],leaderboard,dares,settings}/page.tsx`.

- Market page: TradeTicket (tokens) with Buy/Sell, Yes/No and an amount, plus a live quote from `quoteBuy`/`quoteSell` showing contracts, average price, payout if right (`contracts × 100`) and profit; points mode shows two big Pick buttons. The Bookie card shows the chance, range, reason and facts, a "Re-check" button and the audit trail link. Then positions or picks, evidence, and the ResolutionPanel (close early, Ask the Bookie, propose with the recommendation pre-selected and a confirm step, the review tally with Confirm/Dispute, and the settled receipt with the roast and the dares created).
- Leaderboard: tokens ranks by `balance + positionValue`, and points ranks by `points`. Columns: rank, name, total, record, streak, dares done and skipped.
- Dares: To do, Group is voting, and Done columns, with proof upload (text or image) for the person who owes and Approve/Redo for the people owed.
- Settings: name, emoji, invite code with a copy button, mode and starting balance (disabled with "Locked after the first market" when `locked`), the dare presets editor (add or remove, at most 10, 80 characters each), and members with roles. Non-owners see read-only settings.

- [ ] **Step 1:** Implement. **Step 2:** Browse the full demo story using Playing as: Sam creates the Jake market and the Bookie sets 18%; Priya buys YES and Marcus buys NO; Sam closes it early; Jake posts a gym check-in; Sam asks the Bookie, which recommends No at 94%; Sam proposes No, Priya disputes, Marcus confirms, and it settles after the window; the receipt shows a roast; Jake's dare appears in To do; Jake posts proof; the winners approve and it moves to Done. **Step 3:** Commit: `Add the market page, leaderboard, dares and settings.`

### Task 11: Docs and final check

- [ ] **Step 1:** Rewrite `README.md`: the intent, run steps (delete `.data/` to reset, `BWF_SEED`), groups and currency modes, market math in plain words, how the Bookie works and its fallbacks, resolution, dares, env vars and test commands.
- [ ] **Step 2:** `npx tsc --noEmit -p .`, `npm run lint`, `npm run build`, `npm run test:unit`, and `npm run test:e2e` with both `BOOKIE_AI=stub` and `BOOKIE_AI=off`. All pass.
- [ ] **Step 3:** With a real `ANTHROPIC_API_KEY`, walk through the Task 10 demo story once and read the Bookie's odds, review and roast. Note anything that reads wrong.
- [ ] **Step 4:** Commit: `Document Betting with Friends and the Bookie.`
