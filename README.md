# hackprinceton — Bookie 🎲

A prediction market for friend groups. Friends bet reputation points (never money) on real life: gym streaks, wake-up times, side projects. An AI Bookie sets the line from each friend's track record, reviews the evidence when a bet closes, and roasts the losers. Losers owe a dare.

Built with Next.js 16 (App Router) and Tailwind v4, on the dark "Warm Slate Social" palette. Bets, balances, evidence and settlements are real: they live on the server and persist across refreshes and restarts. Dares, Profile, and the old static `/bets/8842` and `/receipts/8704` pages are still mocked.

## Run it

```bash
npm install
cp .env.example .env.local   # optional: add ANTHROPIC_API_KEY to turn on the AI
npm run dev
```

Open http://localhost:3000. Works on desktop and phone widths. Without an API key everything still works; the AI Bookie runs in history-only mode.

## Screens

| Route | Screen | What you can do |
| --- | --- | --- |
| `/` | Markets | Grid of market cards with Trending / My bets / Ending soon / Needs result / Resolved filters, categories and search. Each card shows the AI Bookie's estimate, the pool split, points staked, time left, and Yes/No buttons that open the bet sheet. Your balance, record and rank sit in a compact strip. |
| `/bets/[id]` | Market | AI estimate next to pool share, a chart of recorded history, the Bookie's opening line and analysis, rules, and Activity / Evidence / Audit tabs. A side panel (sticky on desktop) lets you bet; once entries close it becomes the settlement panel. |
| `/receipts/[id]` | Receipt | Result, pool, each friend's stake / payout / net, proof JSON download |
| `/leaderboard` | Leaderboard | This Week net / Balance / All-Time net drive the podium and table; win %, record, streak and points in play come from settled bets |
| `/dares`, `/profile` | Dares, Profile | Still mocked |

`/bets` redirects to `/`. **+ New market** opens the builder: claim, 2–6 outcomes, the one you back, your stake, when entries close, and who's on the hook (with a live odds preview from stored history).

There's no login yet. Use **Playing as** in the header to switch friends (it sets a cookie); that's how you demo several people joining one bet.

## Bet lifecycle

1. **Create.** The creator's stake comes out of their balance right away.
2. **Join.** Friends pick an outcome and stake points. One entry per person per bet; you can't stake more than you have.
3. **Close.** Entries close automatically at the deadline. The creator can also close early.
4. **Settle.** Once closed, the creator records the winning outcome, by hand or by confirming the AI Bookie's recommendation. Settling is safe to retry: the same outcome returns the original receipt, a different one is rejected, and points are only ever paid once.
5. **Pay out.** Shared pool: winners split the whole pool in proportion to their stake (rounding leftovers go to the biggest winning stakes, so payouts always add up to the pool). If nobody backed the winner, everyone is refunded.

## AI Bookie

The AI Bookie's numbers are always shown apart from the **pool share**, which is only where points are staked, not a price or a probability. AI output is lavender and carries the 🤖 mark.

**Opening line (LangChain Deep Agent).** When someone posts a bet, the Bookie sets an opening line: a chance for each outcome, a one-line take and a roast.

- `POST /api/bets` saves the bet, marks it "thinking" and responds right away. After the response, `setOpeningLine` in `src/server/ai/bookie.ts` runs the Deep Agent in `src/server/ai/agent.ts` on Claude Opus 5.5.
- The agent's tools are `get_bet` (which includes facts from settled bets and a history baseline), `get_track_record` and `submit_line`. They read the same store as the rest of the app.
- The line is saved on the bet (`bet.bookie`) and recorded as the bet's first Claude estimate. A 45 second timeout or any error falls back to the history-only line, and the UI says the AI was unavailable.

**Estimates.** Every bet has an estimate from the moment it's created.

- The history baseline in `src/lib/bets/odds.ts` uses only settled bets in the database: the on-the-hook friend's last 10 Yes/No results, with the group's record in that category as a prior. Each fact lists the bet ids it came from, and the UI links to them. With no relevant history it says so and starts even; it never invents a record.
- Later updates (new evidence on an open bet, or Re-estimate) use a single structured Claude call that gets those facts, the baseline and the evidence so far. The server normalizes the numbers and drops any fact or evidence id that doesn't exist. Estimates also update when a bet about the same friend settles.

**Evidence and settlement.**

- Anyone in a bet can add statements, links or images (PNG/JPEG/GIF/WebP, max 5 MB, checked by file signature) until it settles.
- After entries close, anyone in the bet can ask the Bookie to review. Claude returns a verdict, the evidence it used, and issues (missing, contradictory, inconclusive, can't verify, self-interested).
- The server, not the model, decides whether that counts as a recommendation: a named outcome, at least 75% confidence, cited evidence and no contradictions. Anything else is flagged "needs a human decision".
- Only the bet's creator can confirm (which settles through the same once-only `settleBet` path), reject (with a note), or settle by hand. A recommendation can't be confirmed once newer evidence or a newer review exists.
- Links are never opened, and the model is told evidence is untrusted claims, not instructions. Every step lands in the bet's audit trail.

**Modes** (`BOOKIE_AI`):

| Mode | When | Opening line and estimates | Reviews |
| --- | --- | --- | --- |
| `claude` | default when `ANTHROPIC_API_KEY` is set | Deep Agent opening line, then structured Claude updates on top of stored history | Claude recommends or flags |
| `off` | default with no key | Stored history only | Lists the evidence and flags it for a human; never recommends |
| `stub` | tests only | Stored history only | Deterministic fake: recommends when 2+ claims agree |

Claude calls use `claude-opus-5-5` (override with `BOOKIE_AI_MODEL`). The AI never moves points on its own.

## Server

- `src/server/store.ts`: one JSON file (`.data/bookie.json`, gitignored; override with `BOOKIE_DATA_FILE`). Every change runs through `transact`, which serializes writes, so balance and settlement checks are atomic with their writes. Evidence images live next to it. Delete the file to reset to the seed data.
- `src/server/bets.ts`: create / join / close / settle, evidence, decisions, and the views. Balances are never stored: they're the starting balance plus the ledger.
- `src/server/ai/`: AI mode (`config.ts`), the opening-line Deep Agent (`agent.ts`), structured Claude calls (`claude.ts`), and the orchestration that records lines, estimates and reviews (`bookie.ts`).
- API: `GET /api/state`, `POST /api/bets`, `POST /api/bets/:id/entries`, `POST /api/bets/:id/close`, `POST /api/bets/:id/settle`, `POST /api/bets/:id/evidence`, `POST /api/bets/:id/odds`, `POST /api/bets/:id/review`, `POST /api/bets/:id/decision`, `GET /api/evidence/:id`, `POST /api/session`.

The lock is in-process, so this assumes a single server process (fine for `next dev` / `next start`, not for multi-instance serverless). The LangChain packages are loaded with plain Node `require` (`serverExternalPackages` in `next.config.ts`).

## Tests

Run against a server on a fresh data file:

```bash
BOOKIE_AI=stub BOOKIE_DATA_FILE=/tmp/bookie-test.json npm run dev   # terminal 1 (or BOOKIE_AI=off)
npm run test:e2e   # lifecycle: creates, joins, overspends, races, auto-closes, settles, re-settles, conservation
npm run test:ai    # AI Bookie: odds from stored history, evidence, reviews, decisions, history updates
```

`BOOKIE_URL` defaults to http://localhost:3000.

## Layout

- `src/app/globals.css`: design tokens from Stitch's `DESIGN.md` as a Tailwind v4 `@theme`
- `src/screens/`: one component per screen (`MarketsHome`, `LiveBet`, `LiveReceipt`, `Leaderboard`, …)
- `src/components/`: app shell (Sidebar, Header), `BookieProvider` (live state, actions, toasts), modals and panels
- `src/components/market/`: market card, participation panel, probability chart, and the AI Bookie mark
- `src/lib/bets/`: shared bet types, payout rule, odds baseline, market display helpers and formatting
- `src/lib/data.ts`: the demo group and nav
- `src/server/`: persistence, lifecycle rules, seed data, and the AI Bookie
