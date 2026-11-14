# Betting with Friends: frontend

A standalone frontend for **Bet Series**: friend groups compete over a series of YES/NO bets with virtual coins, and the bottom players owe favors (or, later, real money). The look follows Scarlet Market's layout (framed panels with label tags, tracked captions, serif display numbers, YES teal / NO violet) in Rosy Copper `#CE4C3B` on Shadow Grey `#27242F`, without retro effects.

It has no backend yet. Every rule runs in the browser (`src/lib/engine.ts`) and data is saved to `localStorage`, so the whole flow can be demoed now and moved behind an API later. Open two windows and pick a different "Playing as" in each to play as two friends; changes sync between tabs.

## Run it

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm test           # rule tests (node --test)
npm run build      # type-check and production build
```

**Reset** in the sidebar wipes this browser's data back to the placeholder seed.

## Screens

| Route | Screen |
| --- | --- |
| `/` | Home: your series, invitations, join with a code, new series |
| `/new` | Series creation: basics, mode (A real money, B self-pledged favors, C shared favor pool), advanced rules |
| `/s/:id` | Lobby before start (join, rules, favors, ready, kick, start), Dashboard while live (bets, balances, leaderboard, host controls), Results at the end (podium, standings, favor picks) |
| `/s/:id/bets/:betId` | Bet page: everyone's side and stake, wager ticket with payout estimate, withdraw window, host close / resolve / cancel |
| `/s/:id/leaderboard` | Full standings with the bottom-X line |
| `/s/:id/rules` | Locked rules and players |

The sidebar has the logo top-left and a Slack-style dropdown to switch between your series.

## Rules as built

- Winners split the whole pool in proportion to their stakes; rounding leftovers go to the biggest winning stakes. One-sided pools and canceled bets refund everyone.
- Wagers: pick a side, add more any time betting is open, no switching sides. Withdrawals are allowed for the first N minutes after a bet opens (host picks 0, 5, 15 or 30; default 15); withdrawing is the only way to switch.
- The leaderboard ranks settled coins; open wagers don't move it until they resolve.
- Ties: "first to reach" (earlier resolved bet wins, then the earlier wager on that bet, then join order) or a random order drawn at start.
- Mode C: rank 1 picks for last place, rank 2 for second-to-last, and so on; exclusive pools pick in rank order and each favor once. Adding or removing a favor resets everyone's "ready", so consent covers the final pool.
- Mode A records the minimum contribution and who owes it; no money moves.

These defaults answer the open team questions for the demo; change them in `src/lib/engine.ts` (and its tests) if the team decides otherwise.

## Code

- `src/lib/engine.ts`: every rule as a pure function, plus derived balances, standings and payouts
- `src/lib/engine.test.ts`: rule tests
- `src/lib/store.tsx`: React store, `localStorage` persistence, tab sync, "Playing as"
- `src/components/`: shell (sidebar, switcher, top bar), shared UI, standings table
- `src/pages/`: one file per screen
