# hackprinceton — Bookie 🎲

A social platform where friend groups make no-money bets on real life. The stakes are reputation points, titles and dares. An AI bookie sets the odds from each friend's track record, settles bets from connected apps and cited evidence, and roasts the losers.

Built with Next.js 16 (App Router) and Tailwind v4. The UI uses the "Warm Slate Social" palette from the Google Stitch export (soft mint, peach and lavender), and bets, balances and settlements are real: they live on the server and persist across refreshes and restarts. The other screens (Dares, Profile, the static bet `/bets/8842` and receipt `/receipts/8704`) are still mocked.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. The layout is designed for a 1440px-wide desktop.

## Screens

| Route | Screen | Interactions |
| --- | --- | --- |
| `/` | Group Home | Live countdown, Fade/Back the bet, emoji reactions, a chat composer the AI bookie replies to, "Make it a bet" opens the bet builder, Back buttons in the right rail |
| `/` (feed) | Group bets | Live feed of the group's bets at the top of Home; join from the card |
| `/bets` | Bets (markets) | Live bets: filters (incl. Needs result / Settled), search, sort, biggest-pool featured bet, chance gauges from the pool, multi-outcome bets, join sheet with pool payout, and a Your bets rail |
| `/bets/[id]` | Live bet | Outcomes and pools, who's in, join, creator can close early and settle |
| `/receipts/[id]` | Live receipt | Result, pool, every friend's stake / payout / net, proof JSON download |
| `/bets/8842` | Bet Detail | Take the Bet / Pass / contrarian play, pool updates, side bets that back either person, odds chart |
| `/receipts/8704` | Settlement Receipt | Confetti, animated "L" stamp, Dispute opens a squad vote and updates the consensus bar, share link, download proof JSON |
| `/leaderboard` | Leaderboard | Live: This Week net / Balance / All-Time net drive the podium and table; win %, record, streak and points in play come from settled bets |
| `/dares` | Dares | Punishment wheel spins and reports where it lands, Upload Proof moves your card to Proof Submitted, Approve/Redo voting |
| `/profile` | Profile | Bet history filters, Share Card, connect/disconnect proof apps |

The **+ Create Bet** button in the sidebar opens a bet builder: claim, 2–6 outcomes, the one you back, your stake, and when entries close (5 min to a week, or a custom time). It still shows the toy AI opening line from `src/lib/data.ts`.

## Bet lifecycle

1. **Create.** The creator's stake comes out of their balance right away.
2. **Join.** Friends pick an outcome and stake points. One entry per person per bet; you can't stake more than you have.
3. **Close.** Entries close automatically at the deadline. The creator can also close early.
4. **Settle.** Once closed, the creator records the winning outcome. Settling is safe to retry: the same outcome returns the original receipt, a different one is rejected, and points are only ever paid once.
5. **Pay out.** Parimutuel pool: winners split the whole pool in proportion to their stake (rounding leftovers go to the biggest winning stakes, so payouts always add up to the pool). If nobody backed the winner, everyone is refunded.

There's no login yet. Use **Playing as** in the header to switch friends (it sets a cookie), which is how you demo several people joining one bet.

### Server

- `src/server/store.ts`: one JSON file (`.data/bookie.json`, gitignored; override with `BOOKIE_DATA_FILE`). Every change runs through `transact`, which serializes writes, so balance and settlement checks are atomic with their writes. Delete the file to reset to the seed data.
- `src/server/bets.ts`: create / join / close / settle and the views. Balances are never stored: they're the starting balance plus the ledger.
- `src/lib/bets/payout.ts`: the payout rule, shared with the client for estimates.
- API: `GET /api/state`, `POST /api/bets`, `POST /api/bets/:id/entries`, `POST /api/bets/:id/close`, `POST /api/bets/:id/settle`, `POST /api/session`.

The lock is in-process, so this assumes a single server process (fine for `next dev` / `next start`, not for multi-instance serverless).

### Test the lifecycle

```bash
BOOKIE_DATA_FILE=/tmp/bookie-test.json npm run dev   # terminal 1
npm run test:e2e                                     # terminal 2 (BOOKIE_URL defaults to localhost:3000)
```

It creates, joins, overspends, races, auto-closes, settles, re-settles, fires 8 settle requests at once, and checks balances, receipts, stats and point conservation.

## AI Bookie (LangChain Deep Agents)

When someone posts a bet, the AI Bookie sets an opening line: a chance for each outcome, a one-line take and a roast.

- **Setup:** copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`. Without a key the Bookie uses a simple track-record formula instead, so everything still works.
- **Flow:** `POST /api/bets` saves the bet marked "thinking" and responds right away. After the response, `setOpeningLine` in `src/server/ai/bookie.ts` runs a Deep Agent on Claude Opus 5.5, saves its line on the bet, and the screens show it on their next poll.
- **Tools the agent can call:** `get_bet`, `get_track_record` and `submit_line`. Tools read the same store as the rest of the app.
- **Safety:** the line is advisory only and never moves points. A 45 second timeout and any error fall back to the formula.

## Layout

- `src/app/globals.css`: design tokens from Stitch's `DESIGN.md` (colors, type scale, spacing) as a Tailwind v4 `@theme`
- `src/components/`: app shell (Sidebar, Header), `BookieProvider` (toasts and the Create Bet modal), and the modals
- `src/screens/`: one component per screen, converted from the Stitch HTML and then wired up with React state
- `src/lib/data.ts`: mock user, groups, nav and the odds model
- `src/lib/bets/`: shared bet types, payout rule and formatting
- `src/server/`: persistence, lifecycle rules, seed data
