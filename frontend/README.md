# Bookie frontend

Bookie's screens are a React app built with Vite and React Router. The party-style interface uses bright orange accents, virtual coins, and shared prediction games.

Start from the repository root with `npm install` and `npm run dev`, then open [localhost:3000](http://localhost:3000). See the [main README](../README.md) for Supabase, Gemini, deployment, and test setup.

## Development

Next runs the API on port 3000 and forwards pages to Vite on port 5173. Opening port 5173 directly also works: Vite proxies `/api` to Next. `BWF_API_ORIGIN` can point that proxy at another API server.

The root `npm run build` builds this frontend into `public/app/` and then builds Next. Running `npm run build` inside `frontend/` builds only the frontend.

Only public Supabase connection settings are included in the browser bundle. Gemini and OpenAI keys belong in the server environment.

## Routes

| Route | Screen |
| --- | --- |
| `/` | Home, open predictions, next moves, and series |
| `/series` | All your series |
| `/new` | Quick game, Detailed setup, and AI game planner |
| `/join/:code` | Join a series from an invite |
| `/s/:id` | Lobby, live dashboard, or results depending on series status |
| `/s/:id/bets/:betId` | Bet details, wager controls, host tools, and GitHub activity proof |
| `/s/:id/leaderboard` | Full standings |
| `/s/:id/rules` | Rules and players |
| `/s/:id/recap` | Shareable recap view |
| `/friends` | Friends and invites |
| `/groups` | Groups and shared series |
| `/groups/:clanId/chat` | Private group chat |
| `/profile` | Avatar, GitHub connection, and reminder preferences |
| `/wrapped` | Personal Wrapped |
| `/wrapped-demo` | Public Wrapped preview with fictional data |

The navigation tour is an overlay opened from the top-right `?`. The legacy `/tutorial` URL starts that tour from Home. Older `/clans` routes redirect to their group equivalents.

## Code map

- `src/lib/store.tsx`: sign-in session, authenticated API client, series polling, and toasts.
- `src/lib/types.ts`: frontend data types.
- `src/lib/rules.ts`: read-only pool, payout, and withdrawal helpers. The database supplies authoritative standings and start blockers.
- `src/components/NavigationTour.tsx`: non-blocking onboarding and one-time reward flow.
- `src/components/GamePlanner.tsx`: prompt entry, generated preview, and application to the normal setup form.
- `src/pages/CreateSeries.tsx`: templates, saved drafts, detailed rules, and series creation.
- `src/styles.css` and `src/party.css`: base layout and current visual theme.
- `../shared/`: template catalog, game-plan types, and other logic shared with the API.

Groups and punishments retain `clan` and `favor` identifiers in some internal code for compatibility with the database and API.
