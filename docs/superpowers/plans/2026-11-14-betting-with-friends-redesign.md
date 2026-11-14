# Betting with Friends Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Groups with a Slack-style switcher, per-group currency (tokens / points / money WIP), Kalshi-style LMSR markets, propose-then-dispute resolution and punishments, with no example data.

**Architecture:** Keep Next.js 16 and the JSON-file store with `transact` (`src/server/store.ts`). Replace the pool-betting server (`src/server/bets.ts`, `src/lib/bets/*`) with groups + markets modules and pure LMSR math shared with the client. Pages move under `/g/[groupId]`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 tokens, Node 24 (`node --test` runs `.ts` directly), e2e script over HTTP.

**Spec:** `docs/superpowers/specs/2026-11-14-betting-with-friends-redesign-design.md`

## Global Constraints

- No "bookie" (any case) in `src/`, `scripts/`, `README.md`, `package.json` when done. Cookie `bwf_user`, env `BWF_DATA_FILE` (default `.data/bwf.json`), `BWF_DISPUTE_WINDOW_MS` (default `86400000`), `BWF_URL` for e2e.
- LMSR `b = 25`; a contract pays 100; prices are integers 1–99 in the UI; buy cost `ceil(100·ΔC)`, sell proceeds `floor(100·ΔC)`; starting chance 5–95, default 50.
- Points scoring: correct pick earns `max(10, 100 − sidePct)` where `sidePct` is the rounded % of pickers on your side at settlement; wrong earns 0.
- Tokens `startingBalance` 100–100,000. Invite code alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, length 8.
- Placeholders exactly as the spec's Placeholders section. Default punishments `Placeholder punishment 1..3`.
- UI keeps the copper/grey tokens and Scarlet labels. No CRT, no dares, no AI copy.
- UI task verification: `npx tsc --noEmit -p .` clean, `npm run lint` 0 errors, browse screenshot at 1440×900 with no console errors.

## Review Focus

1. Buying with a spend below one contract's cost: 400 `too_small`, nothing charged.
2. Selling more contracts than held, or selling after close: 409, nothing changes.
3. Joining a tokens group twice (or via a second invite) grants the starting balance once.
4. Points group: the trade endpoint returns 409 `wrong_mode`; changing a pick after close returns 409.
5. House loss on a settled market never exceeds 1,733 tokens, after many random buys and sells.

Tests for 1–5 are in Tasks 2 and 4. Dispute edge cases are in Task 5.

---

### Task 1: Commit the visual work so far

- [ ] **Step 1:** `npx tsc --noEmit -p .` and `npm run lint` pass.
- [ ] **Step 2:** Commit everything currently modified (copper/grey theme, fonts, rename to Betting with Friends, CRT removed, Dares removed, test wip seed): `Retheme to Rosy Copper and Shadow Grey; rename to Betting with Friends; remove Dares.`

### Task 2: LMSR math

**Files:** Create `src/lib/markets/lmsr.ts`, `src/lib/markets/lmsr.test.ts`. Modify `tsconfig.json` (`"allowImportingTsExtensions": true`), `package.json` (`"test:unit": "node --test src/lib/**/*.test.ts"`).

**Produces** (no imports, usable on client and server):
- `B = 25`, `PAYOUT = 100`
- `type Q = { yes: number; no: number }`
- `priceYes(q: Q): number` (0..1)
- `initialQ(chancePct: number): Q` → `{ yes: B·ln(p/(1−p)), no: 0 }`
- `quoteBuy(q: Q, side: "yes"|"no", spend: number): { contracts: number; cost: number }` largest integer contracts with `ceil(100·ΔC) ≤ spend` (binary search, contracts ≤ 100,000)
- `quoteSell(q: Q, side, contracts: number): number` proceeds `floor(100·ΔC)`
- `applyTrade(q: Q, side, deltaContracts: number): Q`

- [ ] **Step 1: Write tests:** `priceYes(initialQ(50)) === 0.5`; `Math.round(priceYes(initialQ(80))*100) === 80`; `quoteBuy(initialQ(50),"yes",49)` → `{contracts:0,cost:0}` and with 51 → `{contracts:1, cost:51}` (ceil of 100·ΔC for 1 contract at 50%, ≈50.25); buying then selling the same contracts returns ≤ cost; buying YES raises `priceYes`; house loss bound: from `initialQ(50)` buy 10,000 tokens of YES, settle YES, `contracts*100 − cost ≤ 1733`.
- [ ] **Step 2:** `npm run test:unit` → fails (module missing).
- [ ] **Step 3:** Implement. Use the log-sum-exp form for numeric stability.
- [ ] **Step 4:** `npm run test:unit` → all pass.
- [ ] **Step 5:** Commit: `Add LMSR pricing math with tests.`

### Task 3: Groups, data model, seed

**Files:**
- Rewrite: `src/server/store.ts` (types + file path), `src/server/seed.ts`, `src/server/http.ts`
- Create: `src/server/groups.ts`, `src/lib/markets/types.ts`, `src/app/api/groups/route.ts` (POST create), `src/app/api/groups/join/route.ts` (POST `{code}`), `src/app/api/groups/[id]/route.ts` (PATCH)
- Modify: `src/app/api/state/route.ts` (`?group=` query), `src/app/api/session/route.ts`
- Delete: `src/server/bets.ts`, `src/lib/bets/`, `src/app/api/bets/`
- Test: rewrite `scripts/e2e-lifecycle.mjs` → `scripts/e2e.mjs`; `package.json` `"test:e2e": "node scripts/e2e.mjs"`

**Produces:**
- `Db = { version: 2; users; groups; memberships; markets; trades; picks; ledger; receipts; punishmentsDone }`.
- `LedgerRow = { id, groupId, userId, marketId?, kind: "grant" | "buy" | "sell" | "payout" | "refund" | "score", amount, createdAt }`; balance in a group = sum of that user's rows in that group.
- `groups.ts`: `createGroup(db, userId, {name, emoji?, mode, startingBalance?})`, `joinGroup(db, userId, code)`, `updateGroup(db, userId, groupId, patch)`, `requireMember(db, userId, groupId)`, `balanceIn(db, groupId, userId)`.
- `types.ts`: `GroupMode`, `GroupView { id, name, emoji, inviteCode, mode, startingBalance, punishments, ownerId, locked, members: MemberView[] }`, `MemberView { userId, name, role, balance, positionValue, points, record: {wins, losses}, streak }`, `AppState { me, users: {id,name}[], groups: {id,name,emoji}[], group: GroupView | null, markets: MarketView[], serverTime }` (MarketView defined in Task 4).
- Errors via existing `BetError` pattern, renamed `AppError(status, code, message)` in `src/server/errors.ts`.

Rules: `mode: "money"` → 400 `money_wip`. Non-member asking for a group → 404. Owner-only PATCH (403 `not_owner`); `mode`/`startingBalance` in PATCH after the first market → 409 `locked`. Join grants `startingBalance` once (tokens mode only).

- [ ] **Step 1: e2e tests:** state for `p1` lists `Placeholder group` with 4 members, each 1,000 tokens; `p2` creates a points group → its own balance 0; money mode → 400; `p3` joins by code twice → second is 409 `already_member`, balance granted once; `p4` GET state for a group they're not in → 404; `p2` PATCH name on `p1`'s group → 403; seed has exactly one market titled `test wip` (asserted after Task 4 adds markets to state, mark as pending until then).
- [ ] **Step 2:** Run against `BWF_DATA_FILE=/tmp/bwf-test.json BWF_DISPUTE_WINDOW_MS=3000 npm run dev` (delete the file first) → fails.
- [ ] **Step 3:** Implement. Group ids `g_xxxxxxxx` via existing `newId`; seed group id `main`.
- [ ] **Step 4:** e2e group checks pass; `npx tsc --noEmit -p .` errors only in UI files (rebuilt in Tasks 6–9).
- [ ] **Step 5:** Commit: `Add groups with invite codes, per-group balances and placeholder seed.`

### Task 4: Markets: create, trade, pick, close

**Files:** Create `src/server/markets.ts`; routes `src/app/api/groups/[id]/markets/route.ts` (POST), `src/app/api/markets/[id]/trade/route.ts`, `.../pick/route.ts`, `.../close/route.ts`. Extend `scripts/e2e.mjs`.

**Produces:**
- `Market { id, groupId, question, rule?, punishment?, hostId, createdAt, deadline, q: Q, history: {at, yes}[], proposal?, receiptId? }`, `Trade { id, marketId, userId, side, contracts /* negative = sell */, amount /* tokens, negative = received */, createdAt }`, `Pick { marketId, userId, side, updatedAt }`.
- `createMarket(db, userId, groupId, {question, rule?, deadline, chance?, punishment?})` (question 3–140, rule ≤160, punishment ≤80, deadline future and ≤90 days).
- `trade(db, userId, marketId, {action: "buy"|"sell", side, amount})`: buy `amount` = spend, sell `amount` = contracts.
- `pick(db, userId, marketId, side)`; `closeMarket(db, userId, marketId)` (host only).
- `MarketView { id, groupId, question, rule?, punishment?, hostId, createdAt, deadline, status, chance /* 0–100 int */, volume, history, positions: {userId, yes, no, spent}[], picks: {userId, side}[], proposal?, receipt?, punishmentStatus? }`.

- [ ] **Step 1: e2e tests:** create in tokens group with chance 70 → `chance === 70`; `p2` buys YES with 200 → balance drops by the returned cost (≤200), chance rises, `positions` shows contracts; buy with 10 at 70% → 400 `too_small`; sell more than held → 409; `p2` sells half → balance rises by proceeds; non-member trade → 404; after `close`, buy → 409; points group: trade → 409 `wrong_mode`, pick Yes then No → one pick, side No; pick after close → 409; 8 concurrent buys by one user never overdraw.
- [ ] **Step 2:** Run → fails. **Step 3:** Implement using `lmsr.ts`. **Step 4:** Run → passes.
- [ ] **Step 5:** Commit: `Add Kalshi-style markets with LMSR trading and points picks.`

### Task 5: Resolution and punishments

**Files:** Modify `src/server/markets.ts`, `src/server/store.ts` (call `sweep` inside `transact`); routes `src/app/api/markets/[id]/result/route.ts` (`{outcome: "yes"|"no"|"void"}`), `.../vote/route.ts` (`{vote: "confirm"|"dispute"}`), `.../punishment/route.ts`. Extend `scripts/e2e.mjs`.

**Produces:** `proposeResult`, `vote`, `sweep(db, now)`, `markPunishmentDone`; `Receipt { id, marketId, outcome, voided, settledAt, results: {userId, net, payout, points}[] }`; `punishmentStatus { text, owedBy, owedTo, done }`.

Rules are the spec's Resolution and Punishments sections; propose on an open market closes it first; voters = users with a position or pick, minus the host.

- [ ] **Step 1: e2e tests:** non-host propose → 403; host vote → 403; non-voter vote → 403; two voters both dispute → back to `closed` with no proposal, re-propose has empty votes; dispute then change to confirm + other confirms → `settled`, each YES contract paid 100; host-only market settles on propose; window: one confirm, `sleep(3500)`, GET state → `settled`; void (tokens) → everyone back to their pre-market balance; points market settles → correct pickers get `max(10, 100 − sidePct)`; punishment owed by losers only, winner marking → 403, loser marking twice → 200 both, `done` lists them once; void → no punishment; house loss ≤ 1,733 on the settled tokens market.
- [ ] **Step 2:** Run → fails. **Step 3:** Implement. **Step 4:** `npm run test:e2e` and `npm run test:unit` pass.
- [ ] **Step 5:** Commit: `Add propose-and-dispute resolution and punishments.`

### Task 6: App shell: provider, routes, sidebar switcher

**Files:**
- Rename `src/components/BookieProvider.tsx` → `src/components/AppProvider.tsx` (`useApp()`); rewrite for `AppState`, takes `groupId` from the route, actions: `createGroup, joinGroup, updateGroup, createMarket, trade, pick, closeMarket, proposeResult, vote, markPunishmentDone, switchUser`.
- Create `src/app/g/[groupId]/layout.tsx`, `src/app/page.tsx` (redirect to first group or render `NoGroups`), `src/screens/NoGroups.tsx`, `src/components/GroupSwitcher.tsx`, `src/components/CreateGroupModal.tsx`, `src/components/JoinGroupModal.tsx`.
- Rewrite `src/components/Sidebar.tsx`, `src/components/Header.tsx` (Playing as + search), `src/lib/data.ts` (NAV built from groupId: Markets, Leaderboard, Punishments, Settings).
- Delete: `src/app/bets`, `src/app/receipts`, `src/app/leaderboard`, `src/app/profile`, `src/screens/{GroupHome,Markets,LiveBet,LiveReceipt,BetDetail,SettlementReceipt,Leaderboard,Profile}.tsx`, `src/components/{CreateBetModal,QuickBetSheet,GroupFeed,DisputeVoteModal,Sparkline}.tsx` (rebuilt fresh in Tasks 7–9 where needed).

Switcher: button shows current group emoji + name + chevron; menu lists my groups (link to `/g/[id]`), divider, Create group, Join with code. Create group modal: name, emoji, currency segmented Tokens / Points / Real money · WIP (disabled), starting balance input shown for Tokens (default 1,000).

- [ ] **Step 1:** Implement, with placeholder pages for the four group routes.
- [ ] **Step 2:** Browse: `/` lands on `/g/main`; switcher lists Placeholder group; create a points group → URL switches; join with the seed code as `p3` from another group.
- [ ] **Step 3:** `grep -rni bookie src` → nothing. Commit: `Add group switcher shell and routes.`

### Task 7: Markets list and New market

**Files:** Create `src/screens/Markets.tsx`, `src/components/MarketCard.tsx`, `src/components/NewMarketModal.tsx`, `src/components/PriceChips.tsx`; page `src/app/g/[groupId]/page.tsx`.

Markets: explainer (localStorage `bwf_explainer_dismissed`, try/catch), Closing soon strip (open, <24h, max 4), filters Open / Needs result / In review / Settled, cards (question, chance, Yes ¢ and No ¢ chips that open the market page with that side preselected via `?side=yes`, volume, deadline/status, punishment line). Points groups show "Pick Yes / Pick No" and pick share. Right rail: your positions, recent activity (trades and picks, newest first, max 10). New market: question, how we'll know, deadline presets (1h, tonight, 1d, 1w, custom), starting chance slider (tokens only), punishment chips from group presets + custom.

- [ ] **Step 1:** Implement. **Step 2:** Browse: create a market as `p2`, it appears in Open with the chosen chance. **Step 3:** Commit: `Add the markets list and new market form.`

### Task 8: Market page

**Files:** Create `src/screens/Market.tsx`, `src/components/TradeTicket.tsx`, `src/components/ChanceChart.tsx` (inline SVG of `history`), `src/components/ResolutionPanel.tsx`; page `src/app/g/[groupId]/m/[marketId]/page.tsx`.

TradeTicket (tokens): Buy/Sell, Yes/No, amount; live quote from `quoteBuy`/`quoteSell` showing contracts, average price, payout if right (`contracts × 100`), profit. Points: two big Pick buttons with current pick highlighted. Positions table / picks list. ResolutionPanel per spec: host close early + propose with confirm step; review tally `c confirm · d dispute of n`, Confirm/Dispute for voters with current vote shown; settled result, per-person results, punishment owed/done.

- [ ] **Step 1:** Implement. **Step 2:** Browse with Playing as: buy YES as p2, NO as p3, p1 proposes YES, p2 confirms, p3 disputes then confirms → settled; p3 sees the punishment. **Step 3:** Commit: `Add the market page with trade ticket and resolution.`

### Task 9: Leaderboard, Punishments, Settings

**Files:** Create `src/screens/{Leaderboard,Punishments,Settings}.tsx`; pages under `src/app/g/[groupId]/{leaderboard,punishments,settings}/page.tsx`.

Leaderboard: tokens ranks by `balance + positionValue` (contracts × current price), points by `points`; columns rank, name, total, record, streak. Punishments: You owe (Mark done) / Owed to you. Settings: name, emoji, invite code with copy button, mode + starting balance (disabled with "Locked after the first market" when `locked`), punishment presets editor (add/remove, max 10, 80 chars each), members list with roles. Non-owners see read-only settings.

- [ ] **Step 1:** Implement. **Step 2:** Browse each page; numbers match `/api/state`. **Step 3:** Commit: `Add leaderboard, punishments and group settings.`

### Task 10: Docs and final check

- [ ] **Step 1:** Rewrite `README.md`: intent, run steps (delete `.data/` to reset), groups and currency modes, market math, resolution, env vars, test commands.
- [ ] **Step 2:** `grep -rni bookie src scripts README.md package.json` → nothing; `npx tsc --noEmit -p .`; `npm run lint`; `npm run build`; `npm run test:unit`; `npm run test:e2e` → all pass.
- [ ] **Step 3:** Commit: `Document Betting with Friends.`
