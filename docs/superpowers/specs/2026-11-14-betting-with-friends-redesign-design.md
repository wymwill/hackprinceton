# Betting with Friends: redesign

> Revised 2026-11-14. The first draft removed the AI Bookie, dares and all example content. This version keeps Timothy's market mechanics, groups and copper theme, and brings back the original idea: an AI Bookie that sets the odds, checks the evidence and roasts the loser, and dares that actually get done.

## Intent

Friend groups bet on real life: gym streaks, wake-up times, side projects, movie picks. Nobody bets money. Each group plays for tokens or points, and losers owe a dare.

Every market is a Yes/No question traded like Kalshi: buy Yes or No contracts at a price that moves with demand, and each winning contract pays 100. **The Bookie**, an AI character, runs the table. It sets each market's opening chance from the friends' real track records, reviews the evidence when the market closes, recommends a result, and writes the roast on the receipt. Friends stay in control: the host proposes the result and the group can dispute it.

The pitch in one line: bet with your friends the way you already do, and the Bookie keeps score, sets fair odds, settles it with proof, and makes sure the loser actually does the dare.

## Goals

- **Groups:** a dropdown switcher under the logo, like Slack workspaces. Create a group, or join one with an invite code. Everything else lives inside the current group.
- **Currency per group:** Tokens (a starting balance) or Points (a score league). No real money. The original brief rules out money and anything casino-like.
- **Kalshi-style markets:** the price is the chance. Buy and sell Yes or No contracts. A winning contract pays 100.
- **AI odds:** the Bookie sets the opening chance from track records and explains it in one sentence. After trading starts, its estimate is shown next to the market price.
- **Settling with evidence:** players post evidence, the Bookie reviews it and recommends a result with a confidence level, the host proposes, and the group can dispute.
- **Dares that happen:** per-group presets, a Bookie-suggested dare, a spin wheel, proof upload, group approval, and a done list.
- **A demo group** with real-sounding friends and history, so the AI has something to reason about. An empty start is available too.

## Non-goals

- Real money, logins and accounts ("Playing as" stays), multi-outcome markets, an order book, live connections to fitness, code or music apps (evidence is uploaded or typed, and connected apps are mocked), and CRT or retro effects.

## Anti-goals

- A market that can't be traded because nobody is on the other side.
- The AI moving points on its own. It suggests and the people decide.
- An app that only works when the AI is online. Every AI step has a non-AI fallback.

## Approaches (pricing)

1. **Automated market maker, LMSR** (picked 2026-11-14). It always quotes a price and always fills. The house is the counterparty, and its worst-case loss per market is bounded. **The Bookie's opening chance seeds the starting price**, so the AI and the market fit together instead of competing.
2. The current shared pool. Rejected: the shown chance isn't the price you get.
3. An order book. Rejected: in a small group, most orders never match.

## Decisions

### Groups

- `Group { id, name, emoji, inviteCode, mode: "tokens" | "points", startingBalance, darePresets: string[], ownerId, createdAt }`.
- `Membership { groupId, userId, role: "owner" | "member", joinedAt }`. Balances are per membership, so tokens in one group never affect another.
- Invite codes are 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` and unique.
- Tokens mode: `startingBalance` of 100 to 100,000, granted once on join. Points mode: everyone starts at 0.
- Mode and starting balance lock after the group's first market. The owner can still edit the name, emoji and dare presets.
- URLs: `/g/[groupId]` (markets), `/g/[groupId]/m/[marketId]`, `/g/[groupId]/leaderboard`, `/g/[groupId]/dares`, `/g/[groupId]/settings`. `/` goes to your first group, or to a "Create or join a group" screen.

### Markets (tokens mode)

- LMSR with liquidity `b = 25` contracts. Cost `C(qY, qN) = b · ln(e^(qY/b) + e^(qN/b))`. The Yes price is `pY = e^(qY/b) / (e^(qY/b) + e^(qN/b))`.
- A contract pays **100 tokens**. Prices show as whole numbers from 1 to 99, for example "Yes 62".
- **Buy:** the player enters a spend and gets the largest whole number of contracts whose cost `ceil(100 · ΔC)` fits. They're charged exactly that.
- **Sell:** players can sell contracts they hold while the market is open, and receive `floor(100 · ΔC)`.
- **Opening chance:** the market opens at the host's chance (default 50%, range 5–95%). If the Bookie's estimate arrives **before the first trade**, the market re-opens at the Bookie's chance. After the first trade, the Bookie's estimate is shown beside the price but never moves it.
- The house funds the market maker. Its loss per market is at most `100 · b · ln 2 ≈ 1,733` tokens, so tokens aren't conserved across a market. The e2e test checks the bound instead.
- The host can trade in their own market.

### Markets (points mode)

- No spending. Each member makes one pick, Yes or No, and can change it until the market closes.
- The shown chance is the share of picks on Yes, or the Bookie's estimate when nobody has picked yet.
- At settlement, a correct pick earns `max(10, 100 − share of pickers on your side at close, in %)`, and a wrong pick earns 0. Going against the crowd pays more.

### The Bookie (AI)

Built on the existing `src/server/ai` modules: `estimateOdds`, `reviewEvidence`, `aiMode()` with `claude`, `off` or `stub`, and Claude Opus 5.5 with server-side refusal fallback. The work is to generalize them from pool bets to markets.

| Moment | What the Bookie does | Fallback when AI is off or fails |
| --- | --- | --- |
| Market created | Estimates the Yes chance from the subject's and the group's settled history. Returns a chance, a likely range, one sentence of reasoning and the facts it used. Runs after the response is sent. | A history-based baseline, the existing `baselineEstimate` |
| Market open | Re-estimates when the subject settles another market or someone asks. Shown as "Bookie says 18%" next to the market price. | The baseline |
| Market closed | Reviews the posted evidence and recommends Yes, No, Void or "needs a human", with a confidence level and the evidence it relied on. | Lists the evidence and hands the decision to the host |
| Settled | Writes a one-line roast for the receipt. | A stock line |
| Dare chosen | Suggests a dare that fits the market, for example leg day missed means 50 burpees. | The group presets |

Rules:
- **Advisory only.** Nothing the Bookie says moves tokens or points. Every AI output is stored with its model, its time and the facts it used, and shown in an audit trail.
- **Tone:** cheeky but never mean. No money talk.
- **Visual:** everything the Bookie says uses one accent colour, the theme's tertiary periwinkle, with a small Bookie mark. The rest of the UI stays copper and grey.

### Evidence and resolution

- Status: `open` → `closed` (the deadline passed, or the host closed it early) → `review` (the host proposed a result) → `settled`.
- While a market is closed, anyone in it can post evidence: a statement or an image. Mock "connected app" evidence, such as a gym check-in, can be added from the demo seed.
- The host taps **Ask the Bookie** to get a recommendation, then proposes Yes, No or Void. The recommendation is pre-selected but the host decides.
- Voters are everyone with a position or pick, except the host. Each voter can Confirm or Dispute and can change their vote.
- If disputes are more than half of the voters, the proposal is dropped and the market goes back to `closed`. Otherwise it settles when every voter has voted, when there are no voters, or when the window ends (`BWF_DISPUTE_WINDOW_MS`, default 24h). Expired windows settle on the next request of any kind.
- Settling: tokens mode pays 100 per winning contract, and points mode scores picks. Void: tokens mode refunds each player's net spend, and points mode scores nothing.

### Dares

- Each group has dare presets, editable in Settings. A market can have no dare, a preset, a custom dare, the Bookie's suggestion, or **Spin the wheel** (picks from the presets when the market settles).
- Dares are owed by the losers once a market settles and isn't void. In tokens mode that's anyone whose net result is below 0. In points mode it's anyone with a wrong pick. Dares are owed to the winners.
- Each owed dare has a deadline (48h by default). The loser uploads proof as text or an image. Winners vote Approve or Redo, and a majority approve marks it done. With no votes by the deadline, it's marked done if proof was posted, or "skipped" if not.
- The Dares page has three columns: To do, Group is voting, Done. The leaderboard shows each person's dares done and skipped.

### Screens

| Where | Contents |
| --- | --- |
| Sidebar | The logo, then the group switcher (your groups, Create group, Join with code). Group nav: Markets, Leaderboard, Dares, Settings. A New market button. The Playing-as card at the bottom. |
| Markets (`/g/[id]`) | A dismissible "How it works", a Closing soon strip, filters (Open, Needs result, In review, Settled), and market cards showing the chance, the Bookie's chance when it differs, Yes and No price buttons, volume and deadline. A side rail with your positions and recent activity. |
| Market page | The question, how we'll know, the dare, a chance chart (with the Bookie's estimate as a second line), the Bookie card (chance, range and one-sentence reason), the trade ticket (Buy/Sell, Yes/No, amount, then contracts, average price, payout if right and profit), positions or picks, evidence, a host panel (close early, Ask the Bookie, propose with a confirm step), a review panel (tally, Confirm/Dispute) and the settled receipt with its roast. |
| New market | The question, how we'll know, deadline presets, starting chance (the Bookie will adjust it), and the dare (presets, Bookie suggestion, wheel or custom). |
| Leaderboard | Tokens: balance plus position value at current prices. Points: points. Record, streak, dares done and dares skipped. |
| Dares | To do, Group is voting, Done. Proof upload and Approve/Redo. |
| Settings | Name, emoji, invite code with copy, mode and starting balance (locked after the first market), dare presets, members. |
| Create group | Name, emoji, and currency: Tokens (with a starting balance) or Points. |

### Seed data

- `BWF_SEED=demo` (the default in dev): the group "The Boyz Gym Arc" in tokens mode with 1,000 starting tokens and six friends (Alex, Sam, Priya, Marcus, Elena and Jake). It includes about ten settled markets so the Bookie has history (Jake 2 and 7 on fitness), two open markets including "Will Jake make 6 AM leg day?", one closed market with evidence waiting for review, and one dare in each column.
- `BWF_SEED=empty`: users `Player 1` to `Player 4` and no groups.

### Theme and naming

- The app is called **Betting with Friends**, and the AI character is **the Bookie**.
- Timothy's Rosy Copper and Shadow Grey theme stays: copper for the main action and wins, gold for losses and dares, periwinkle for the Bookie only.
- Plain language everywhere. No jargon such as "LMSR", "oracle" or "arbiter" in the UI.

## Left to the builder

Visual layout within the existing tokens, empty states, chart rendering, the exact Bookie prompts, and copy outside the seed.
