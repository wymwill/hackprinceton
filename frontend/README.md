# Alea: Bet Series frontend

The screens for **Bet Series**: friend groups compete over a series of YES/NO bets with virtual coins, and the bottom players owe favors (or, later, real money). The look follows Scarlet Market's layout (framed panels with label tags, tracked captions, serif display numbers, YES teal / NO violet) in Rosy Copper `#CE4C3B` on Shadow Grey `#27242F`, without retro effects.

Players sign in with Supabase Auth (Google, or email and password). Every action goes to the Bet Series API in the Next app (`src/app/api/series`, proxied at `/api` in development). The rules run in Supabase as SQL (`supabase/migrations`). The screens poll `GET /api/series/state` every 2.5 s, so friends on other devices see each other's moves.

## Run it

From the repo root: `npm install`, then `npm run dev`, then open http://localhost:3000. That starts this Vite app on :5173 and the Next API on :3000; Next forwards pages here. Opening :5173 directly also works, with `/api` proxied to :3000 (set `BWF_API_ORIGIN` to point it elsewhere).

`npm run build` at the root builds this app into `public/app/` for the Next server to serve. Here, `npm run build` just type-checks and builds.

**No Supabase project yet?** `node tests/sql/local-supabase.mjs` starts an in-memory stand-in (email sign-in only, test use only). Start the app with `SUPABASE_URL=http://localhost:54399 SUPABASE_PUBLISHABLE_KEY=local` in front of `npm run dev`.

## Screens

| Route | Screen |
| --- | --- |
| (signed out) | Sign in: Google, or email and password, or create an account |
| `/` | Home: your series, join with a code or link, new series |
| `/new` | Series creation: basics, the YES/NO questions, mode (A real money, B self-pledged favors, C shared favor pool), advanced rules |
| `/join/:code` | Invite link: sign in, then join and land in the lobby |
| `/s/:id` | Lobby before start (invite code and link, rules, favors with per-favor agreement, ready, kick, leave, bets, start blockers), Dashboard while live (bets, balances, leaderboard, host controls, end series), Results at the end (podium, standings, favor picks, accept or decline, done) |
| `/s/:id/bets/:betId` | Bet page: everyone's side and stake, wager ticket with payout estimate, withdraw window, host lock / resolve / cancel |
| `/s/:id/leaderboard` | Full standings with the bottom-X line |
| `/s/:id/rules` | Locked rules and players |

The sidebar has the logo top-left, a Slack-style dropdown to switch between your series, and who's signed in.

## Rules as built

The rules live in the SQL; `docs/supabase-series.md` lists them. In short:

- Winners split the whole pool by stake. One-sided pools, nobody on the winning side, and canceled bets refund everyone. Locking a one-sided bet refunds it at once.
- Add to your side any time betting is open, never switch. Withdrawals are allowed for the first N minutes after a bet opens (0, 5, 15 or 30); withdrawing is the only way to switch.
- The leaderboard ranks settled coins. Ties go to whoever reached the score first, or to a random order drawn at start.
- Shared pool: every player agrees to each favor before start ("I'm ready" agrees to all of them). Rank 1 picks for last place from favors that player agreed to. The loser accepts or declines; a decline means the winner picks again.
- Real money records who owes the minimum; no money moves.

## Code

- `src/lib/store.tsx`: sign-in session, the API client (one function per route), polling, toasts
- `src/lib/types.ts`: the shape `GET /api/series/state` sends
- `src/lib/rules.ts`: read-only helpers (pools, payout estimate, withdraw window); standings and start blockers come from the server
- `src/lib/supabase.ts`: Supabase Auth in the browser (URL and publishable key only)
- `src/components/`: shell (sidebar, switcher, account, top bar), shared UI, standings table
- `src/pages/`: one file per screen
