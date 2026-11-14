# Alea

Friend groups bet on real life (gym streaks, wake-up times, side projects) without money. Each group plays for **tokens** or **points**, and losers owe a **dare**. Every market is a Yes/No question priced like a prediction market, and **the Bookie**, an AI character, sets the opening odds from the group's track record, reviews the evidence when a market closes, and writes the roast on the receipt. People stay in control: the host proposes the result and the group can dispute it.

Built with Next.js 16 (App Router), React 19 and Tailwind v4. The full design is in [`docs/superpowers/specs/2026-11-14-betting-with-friends-redesign-design.md`](docs/superpowers/specs/2026-11-14-betting-with-friends-redesign-design.md).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. The first request creates `.data/bwf.json` from the demo seed. Delete that file to reset.

No API key is needed. Without one the Bookie runs in `off` mode (see [AI Bookie](#ai-bookie)). To turn Claude on, copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`.

There's no login. Use **Playing as** in the header to switch friends (it sets a cookie). That's how you demo several people in one market, and it also means nobody's identity is verified.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run test:unit` | Node test runner over `src/**/*.test.ts` (the LMSR pricing math) |
| `npm run test:e2e` | End-to-end API tests. Run `npm run build` first: it starts the production server twice (empty seed, then demo seed) on throwaway data files. Uses `BOOKIE_AI=stub` by default and never calls the real API. |

## Screens

| Route | Screen |
| --- | --- |
| `/` | Goes to your first group, or offers to create or join one |
| `/g/[groupId]` | Markets: filters (open, needs result, in review, settled), closing soon, new market |
| `/g/[groupId]/m/[marketId]` | One market: chance chart, trade ticket or pick, the Bookie's estimate and log, evidence, result and voting, receipt |
| `/g/[groupId]/leaderboard` | Balances or points, record, streak, dares done and skipped |
| `/g/[groupId]/dares` | To do, group is voting, done. Proof upload and approve or redo |
| `/g/[groupId]/settings` | Name, emoji, dare presets, invite code. Currency locks after the first market |

## How a market works

1. **Create.** Question, optional "how we'll know" rule, deadline (up to 90 days), starting chance (5–95%), optional subject and dare.
2. **Trade or pick.**
   - *Tokens:* an LMSR market maker (`b = 25`) always quotes and always fills. A winning contract pays 100. Buys round cost up, sells round proceeds down, and the house's loss per market is at most about 1,733 tokens.
   - *Points:* one Yes/No pick each, changeable until close. A correct pick scores `max(10, 100 − % of pickers on your side)`.
3. **Close.** At the deadline, or early by the host.
4. **Evidence.** Anyone can post text or an image (PNG, JPEG, GIF or WebP, up to 5 MB, checked by file signature) until the market settles.
5. **Propose and vote.** The host proposes Yes, No or Void. Everyone with a position or pick, except the host, can confirm or dispute. A dispute majority sends it back to the host. It settles when everyone has voted, when there are no voters, or when the window ends (24h by default). Only one proposal can be live at a time.
6. **Settle.** Payouts, or refunds for Void, go into the ledger, a receipt is written, and each loser owes the market's dare to the winners. Proof is voted on, and dares with no proof by the deadline (48h) are marked skipped.

## AI Bookie

| Mode (`BOOKIE_AI`) | When | Odds | Evidence review |
| --- | --- | --- | --- |
| `claude` | Default when `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN`) is set | Claude, given the history-based baseline and the facts behind it | Claude recommends a result, or flags it for a human |
| `off` | Default with no key | History-based baseline only | Lists the evidence and leaves the call to the host |
| `stub` | Tests only | Baseline, labeled as a stub | Deterministic: recommends when 2+ claims agree |

- **Advisory only.** The Bookie never moves tokens or points. Its estimate re-opens a market's price only before the first trade or pick. After that it's shown next to the price.
- The server, not the model, decides what counts as a recommendation: a named outcome, confidence of at least 75%, cited evidence and no contradictions.
- Model calls run outside the database lock, and their output is checked against stored ids before it's saved. If a call fails, that request falls back to `off` behavior and says why.
- Manual "Re-check" requests run one at a time per market, at most once every 30s (`BWF_ODDS_COOLDOWN_MS`), so nobody can run up model calls.
- Everything the Bookie does is written to the market's audit log.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | (unset) | Turns on `claude` mode |
| `BOOKIE_AI` | from the key | `claude`, `off` or `stub` |
| `BOOKIE_AI_MODEL` | `claude-opus-5-5` | Model for Bookie calls |
| `BWF_DATA_FILE` | `.data/bwf.json` | Database file. Uploads go in an `uploads/` folder next to it |
| `BWF_SEED` | `demo` | Seed used when the file doesn't exist: `demo` or `empty` |
| `BWF_DISPUTE_WINDOW_MS` | 24h | How long a proposal stays open for votes |
| `BWF_DARE_WINDOW_MS` | 48h | How long a loser has to post proof |
| `BWF_ODDS_COOLDOWN_MS` | 30s | Minimum gap between manual odds re-checks per market |

## Code layout

```
src/
  app/            routes: pages under g/[groupId], JSON API under api/
  screens/        one component per screen
  components/     app shell, AppProvider (state, polling, actions), modals, cards
  lib/markets/    shared with the client: LMSR math, baseline odds, types
  server/
    store.ts      JSON file persistence and the transact() lock
    http.ts       request helpers: current user, mutate/query, error responses
    groups.ts     groups, membership, balances
    markets.ts    market lifecycle, resolution, settlement
    dares.ts      dares, proof, votes
    views.ts      shapes data for the client
    uploads.ts    image validation and storage
    seed.ts       demo and empty starting data
    ai/           mode, Claude calls, and the Bookie's orchestration
scripts/e2e.mjs   end-to-end tests
```

### API

All responses are JSON. Mutations return `{ result }`. Errors return `{ error: { code, message } }` with a matching HTTP status.

- `GET /api/state?group=` everything the screens need
- `POST /api/session` switch who you're playing as
- `POST /api/groups`, `POST /api/groups/join`, `PATCH /api/groups/:id`
- `POST /api/groups/:id/markets`, `POST /api/groups/:id/dare-suggestion`
- `POST /api/markets/:id/{trade,pick,close,evidence,odds,review,result,vote}`
- `POST /api/dares/:id/{proof,vote}`
- `GET /api/evidence/:id` an uploaded image, for members of that market's group

### Limits

- Persistence is one JSON file behind an in-process lock, so it assumes a **single server process** (`next dev` or `next start`). Don't deploy it to multi-instance serverless as is.
- Queued Bookie work (opening odds, roasts) is held in memory and is lost if the server restarts before it runs.
- There are no accounts. "Playing as" is a cookie anyone can change.
