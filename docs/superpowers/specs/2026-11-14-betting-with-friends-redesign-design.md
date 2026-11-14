# Betting with Friends: redesign

## Intent

Friend groups run their own little prediction markets. Anyone in a group can make a market (a YES/NO question) or bet on one, the way Kalshi works: buy YES or NO contracts at a price that moves with demand, and each winning contract pays out in full. Each group chooses what it plays for: tokens with a starting balance, points like a sports league, or real money (shown, not built). Losers can owe a punishment. The host proposes the result and the players can dispute it. The AI bookie concept and all example content are gone.

Product mechanics and screen ideas come from Scarlet Market (`~/Programming/scarlet_market`), with an automated market maker instead of its order book so small groups always get filled.

## Goals

- Groups: switch from a dropdown under the logo (like Slack's workspace switcher), create a group, join by invite code. Everything else lives inside the current group.
- Per-group currency setting: Tokens (starting balance), Points (score league), Real money (visible, disabled, "WIP").
- Kalshi-style markets: price is the chance, buy and sell YES/NO contracts, a winning contract pays 100.
- Propose-then-dispute resolution.
- Punishments: per-group presets, optional per market, owed by losers, marked done.
- No example content. Seed is placeholder only.

## Non-goals

- Real money movement, logins and accounts ("Playing as" stays), multi-outcome markets, an order book, AI anything, gamified tasks, CRT/retro effects, dares.

## Anti-goals

- Hard-coded people, groups or stories in the UI.
- A market that can't be traded because nobody is on the other side.

## Approaches (pricing)

1. **Automated market maker, LMSR** (picked 2026-11-14). Always quotes a price and always fills. The house is the counterparty; its worst-case loss per market is bounded. Matches Kalshi's contract model (pay the price, win 100).
2. Kalshi look over the existing shared pool. Rejected: the shown price isn't the price you get, which breaks the Kalshi mental model.
3. Order book like Scarlet. Rejected: in a group of a few friends most orders never match.

## Decisions

### Groups

- `Group { id, name, emoji, inviteCode, mode: "tokens" | "points" | "money", startingBalance, punishments: string[], ownerId, createdAt }`.
- `Membership { groupId, userId, role: "owner" | "member", joinedAt }`. Balances are per membership, so one group's tokens never affect another.
- Invite codes: 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, unique.
- Tokens mode: `startingBalance` 100 to 100,000, granted once on join. Points mode: everyone starts at 0. Money mode can't be selected yet.
- Mode and starting balance are locked once the group has its first market. Name, emoji and punishment presets stay editable by the owner.
- URLs are per group: `/g/[groupId]` (markets), `/g/[groupId]/m/[marketId]`, `/g/[groupId]/leaderboard`, `/g/[groupId]/punishments`, `/g/[groupId]/settings`. `/` goes to your first group, or to a "Create or join a group" screen.

### Markets (tokens mode)

- LMSR with liquidity `b = 25` contracts. Cost `C(qY, qN) = b · ln(e^(qY/b) + e^(qN/b))`. YES price `pY = e^(qY/b) / (e^(qY/b) + e^(qN/b))`.
- A contract pays **100 tokens**. Prices are shown as whole numbers 1 to 99 ("Yes 62¢" style chips).
- **Buy:** the player enters a spend; they get the largest whole number of contracts whose cost `ceil(100 · ΔC)` fits in it, and are charged exactly that.
- **Sell:** players can sell contracts they hold while the market is open and receive `floor(100 · ΔC)`.
- **Starting chance:** the host sets it when creating the market (default 50%, range 5–95%) by offsetting the initial `qY − qN = b · ln(p / (1 − p))`. It's a hint, not a trade.
- The house funds the market maker. Its loss per market is at most `100 · b · ln 2 ≈ 1,733` tokens, so tokens are not conserved across a market; the e2e test checks the bound instead.
- The host can trade their own market (decided 2026-11-14).

### Markets (points mode)

- No spending. Each member makes one pick (Yes or No), changeable until the market closes.
- The shown chance is the share of picks on Yes (50% with no picks).
- At resolution a correct pick earns `max(10, 100 − share of pickers on your side at close, in %)`. A wrong pick earns 0. Picking against the crowd pays more.

### Resolution

- Status: `open` → `closed` (deadline passed or host closed early) → `review` (host proposed) → `settled`.
- The host proposes Yes, No or Void. Voters are everyone with a position or pick in the market, except the host. Each voter can Confirm or Dispute and can change their vote.
- If disputes are more than half of the voters, the proposal is dropped and the market goes back to `closed`. Otherwise it settles when every voter has voted, when there are no voters, or when the window ends (`DISPUTE_WINDOW_MS`, default 24h). Expired windows settle on the next request of any kind.
- Settling: tokens mode pays 100 per winning contract; points mode scores picks. Void: tokens mode refunds each player's net spend; points mode scores nothing.

### Punishments

- Group presets (default `Placeholder punishment 1` to `3`), editable in settings. Optional on a market: a preset or a custom one.
- Owed by losers once settled and not void: tokens mode = net result on the market below 0; points mode = wrong pick. Owed to the winners. Losers mark it done.

### Screens

| Where | Contents |
| --- | --- |
| Sidebar | Logo top-left. Under it the group switcher (current group, dropdown with your groups, Create group, Join with code). Then group nav: Markets, Leaderboard, Punishments, Settings. New market button. Playing-as card at the bottom. |
| Markets (`/g/[id]`) | Dismissible explainer, Closing soon strip, filters (Open / Needs result / In review / Settled), market cards with chance, Yes and No price buttons, volume, deadline; side rail with your positions and recent activity. |
| Market page | Question, rule ("how we'll know"), punishment, chance chart, trade ticket (Buy/Sell, Yes/No, amount; shows contracts, average price, payout if right, profit), your position, everyone's positions or picks, host panel (close early, propose with a confirm step), review panel (tally, Confirm/Dispute), settled result with payouts. |
| New market | Question, how we'll know, deadline, starting chance, punishment (preset chips or custom). |
| Leaderboard | Tokens: balance plus position value at current prices. Points: points. Record and streak. |
| Punishments | You owe / owed to you, mark done. |
| Settings | Name, emoji, invite code with copy, mode and starting balance (locked after first market), punishment presets, members. |
| Create group | Name, emoji, currency: Tokens (starting balance) / Points / Real money · WIP (disabled). |

### Placeholders

Users `Placeholder 1` to `Placeholder 4` (ids `p1`..`p4`, no avatars). One group `Placeholder group` in tokens mode, 1,000 starting tokens, owner `p1`, all four members. One market `test wip` by `p1`. Any other copy that used to be an example reads `Placeholder placeholder`.

## Left to the builder

Visual layout within the existing tokens and Scarlet-style panels, empty states, chart rendering, exact copy outside placeholders.
