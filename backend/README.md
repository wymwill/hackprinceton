# Betting with Friends: backend

The Bet Series API for `frontend/`. Plain Node (no framework, no runtime dependencies), TypeScript run directly by Node 24.

- `src/engine.ts`: every rule (series, lobby, wagers, payouts, standings, tiebreaks, favor assignment). The only place rules are enforced. The frontend imports its read-only views (pools, standings, blockers) through the `@rules` alias so screens and server agree.
- `src/store.ts`: one JSON file (`.data/db.json`, or `BWF_DATA_FILE`), changes applied one at a time on a copy and saved atomically.
- `src/app.ts`: the HTTP API.
- `src/server.ts`: starts it on `PORT` (default 8787). If `frontend/dist` exists it also serves the built frontend, so one process can run the whole app.

```bash
cd backend
npm install
npm run dev      # API on :8787 with reset allowed (BWF_ALLOW_RESET=1)
npm test         # 18 rule tests + 7 HTTP tests
npm run typecheck
```

There is no login yet: the `X-User-Id` header (the "Playing as" picker) says who is acting. Writes need a known user. Delete `.data/db.json` to start over.

## API

Every write answers `{ result, state }`; errors answer `{ error: { message } }` (400 rule broken, 401 unknown player, 404 no such route). `state` holds all users and only the series the player hosts, plays in, or was invited to.

| Method | Path | Body | What it does |
| --- | --- | --- | --- |
| GET | `/api/state` | | Users, your series, server time |
| POST | `/api/users` | `name` | Add a player |
| POST | `/api/series` | `name, description, settings, invite[]` | Create a series (you host) |
| POST | `/api/join` | `code` | Join by invite code |
| POST | `/api/series/:id/join` | | Accept an invite |
| POST | `/api/series/:id/leave` | | Leave or decline (lobby only) |
| POST | `/api/series/:id/kick` | `userId` | Host removes a player (lobby only) |
| POST | `/api/series/:id/favors` | `text` | Pledge (mode B) or add to the pool (mode C) |
| DELETE | `/api/series/:id/favors/:favorId` | | Remove your favor |
| POST | `/api/series/:id/ready` | `ready` | Agree to the rules and favors |
| POST | `/api/series/:id/start` | | Host starts: coins handed out, rules locked |
| POST | `/api/series/:id/bets` | `question` | Host writes a bet (draft in lobby, open if live) |
| DELETE | `/api/series/:id/bets/:betId` | | Host deletes a draft |
| POST | `/api/series/:id/bets/:betId/wager` | `side, amount` | Bet or add coins to your side |
| POST | `/api/series/:id/bets/:betId/withdraw` | | Take a wager back inside the window |
| POST | `/api/series/:id/bets/:betId/close` | | Host stops betting |
| POST | `/api/series/:id/bets/:betId/resolve` | `outcome` | Host calls YES or NO and pays out |
| POST | `/api/series/:id/bets/:betId/cancel` | | Host cancels, everyone refunded |
| POST | `/api/series/:id/end` | | Host ends early (no open bets) |
| POST | `/api/series/:id/assignments` | `loserId, favorId` | Mode C: a top player picks a loser's favor |
| POST | `/api/series/:id/favor-done` | | A loser marks their favor done |
| POST | `/api/reset` | | Back to the placeholder seed (only with `BWF_ALLOW_RESET=1`) |
