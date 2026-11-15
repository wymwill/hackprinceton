# Bookie

**Turn your group's plans into a prediction game.** Create a series, invite friends, and bet virtual coins on what happens next. Players at the bottom owe the punishments agreed on before play starts.

Bookie supports game nights, roommate challenges, weekend plans, and custom predictions. The app does not collect or transfer money.

## How it works

1. **Build a series.** Choose Quick game, Detailed setup, or the AI game planner.
2. **Invite your friends.** Share a link, QR code, or invite code. Review the rules and punishments together in the lobby.
3. **Make predictions.** Bet on YES/NO questions, multiple-choice outcomes, or numerical ranges using virtual coins.
4. **Call the results.** The host confirms what happened. Winners split the pool in proportion to their stakes, and the leaderboard updates.
5. **Finish the game.** Assign punishments, share the recap, or start a rematch.

### Features

- **Three ways to start:** ready-made templates, full manual setup, or a Gemini-powered game planner built with LangChain's Deep Agents SDK.
- **Friends and groups:** invite codes, shared series, and private group chat.
- **Clear betting controls:** payout estimates, optional withdrawal windows, scheduled closing times, and host settlement controls.
- **Guided onboarding:** a dismissible navigation tour, replayable from the top-right `?`. Completing it earns 200 credits once per account, applied when your next series starts.
- **Results worth sharing:** standings, series recaps, rematches, and Bookie Wrapped.
- **Optional extras:** linked-account proof, in-app reminders, and The House commentary.

## Local setup

Use **Node.js 24 or newer**, npm, and a Supabase project. The test commands use Node's built-in TypeScript support.

```bash
npm install
cp .env.example .env.local
```

Set the following in `.env.local` at the repository root:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Use the publishable/anon key, not a Supabase service-role key. Both the Next API and the frontend build read this configuration.

Before signing in:

1. Apply the SQL files in `supabase/migrations/` in filename order. For a linked Supabase CLI project, use `supabase db push`; otherwise apply them through the SQL editor.
2. Enable email/password sign-in in Supabase Auth. Google sign-in is optional; follow the [Google sign-in setup guide](docs/supabase-setup.md).
3. Add `http://localhost:3000/**` to your Supabase Auth redirect URLs. Add your production domain when deploying.

Start the app:

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000). The launcher starts Next on port **3000** and Vite on **5173**. Next forwards app pages to Vite during development and handles API requests itself.

`npm install` also installs the frontend dependencies. `npm run dev:lan` exposes the Next server to devices on the same network.

### Try it without a hosted Supabase project

Run the in-memory test server in one terminal:

```bash
node tests/sql/local-supabase.mjs
```

Start Bookie in another:

```bash
SUPABASE_URL=http://localhost:54399 SUPABASE_PUBLISHABLE_KEY=local npm run dev
```

Create an email/password account in the app. This server is for local testing only: data disappears when it stops, and it does not provide Google OAuth.

## Gemini game planner

The **AI game planner** sits beside Quick game and Detailed setup on New series. Describe your game, choose the player and question counts, then generate a draft. Edit the preview and select **Use this draft** to load it into Detailed setup. The host still reviews the rules and clicks **Create series**.

Add a key from [Google AI Studio](https://aistudio.google.com/apikey) to `.env.local`, then restart the dev server:

```dotenv
GOOGLE_API_KEY=your-gemini-api-key
GEMINI_PLANNER_MODEL=gemini-3.5-flash-lite
```

`GEMINI_API_KEY` is also accepted as an alias. These variables are server-only; never prefix them with `VITE_` or `NEXT_PUBLIC_`.

The planner uses `createDeepAgent`, LangChain's `ChatGoogle` adapter, a shared template catalog, and validated structured output. It generates 3–8 YES/NO questions and punishment ideas. It cannot create a series, place a bet, or settle a result. Without a Gemini key, Quick game and Detailed setup still work.

See the [planner implementation and test guide](docs/game-planner.md) for API details, limits, and verification.

## Optional integrations

| Feature | Configuration | Details |
| --- | --- | --- |
| The House commentary | `OPENAI_API_KEY`, `OPENAI_HOUSE_MODEL`, `HOUSE_MODE`, optional `HOUSE_CACHE_DIR` | [Commentary guide](docs/the-house.md). Deterministic commentary works without a key. This is separate from the Gemini planner. |
| Linked-account proof | Provider credentials as needed | [Linked accounts](docs/linked-accounts.md): Strava, Fitbit, Oura, Whoop, Spotify, and GitHub. |
| Text Bookie (iMessage) | `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`, `BOOKIE_AGENT_SECRET`, `BOOKIE_IMESSAGE_ADDRESS` | [iMessage agent](docs/imessage-agent.md): players bet by text through [Photon](https://photon.codes). Run with `npm run agent`. |
| Reminders | Opt in from Profile | In-app only; no email service is required. |
| Scheduled bet closing | Database migrations; optional `pg_cron` | Wagers check the database deadline. With the optional cron job, closings are also recorded while nobody is visiting. |

See [.env.example](.env.example) for supported variables. Some legacy filenames and API identifiers still use “Alea,” “clan,” or “favor”; the interface uses Bookie, groups, and punishments.

## Architecture

```text
React frontend ── /api ──> Next.js server ── authenticated RPCs ──> Supabase
                                  │
                                  └── Deep Agents + Gemini → editable game draft
```

The frontend is a Vite app with React Router. Next.js serves the API and the production frontend. Supabase provides authentication, Postgres, Realtime chat, and avatar storage. Betting rules, permissions, and coin accounting live in database functions; the UI displays their results.

```text
frontend/src/
  pages/                Screens and routes
  components/           Navigation, tour, planner, betting controls, shared UI
  lib/                  API client, session, types, and display helpers
src/
  app/api/              Series, social, planner, rewards, and integration endpoints
  server/planner/       Deep Agents game planner and generation limits
  server/house/         Commentary adapter and cache
  server/               Authentication and shared API helpers
shared/                 Game-plan schema, template catalog, and shared logic
supabase/migrations/    Database schema and rules, applied in order
tests/
  unit/                 Planner, commentary, recap, and Wrapped tests
  sql/                  Rule tests on PGlite and the local Supabase stand-in
  e2e/                  HTTP integration checks
  browser/              Playwright specs
scripts/                Dev launcher and maintenance utilities
docs/                   Setup, feature, and testing guides
```

For frontend routes and conventions, see [frontend/README.md](frontend/README.md).

## Build and deploy

```bash
npm run build
npm start
```

The build writes the frontend to `public/app/`, then builds Next. The Next server serves both the API and app pages, including direct links into a series.

Configure Supabase variables in the deployment environment **before building**, because the frontend includes its public Supabase configuration at build time. Add your deployed domain to Supabase's redirect URLs and apply migrations before using the app. Supply the Gemini key at runtime if you want the planner enabled. Deploy the planner on a Node.js runtime that allows its 45-second generation window.

The money mode records contributions owed outside the app; it does not process payments.

## Checks

These checks do not require live AI provider calls:

```bash
npm run typecheck        # API and frontend TypeScript
npm run lint
npm run test:planner     # Real Deep Agents graph with a scripted model
npm run test:series-sql  # Database rules, permissions, rewards, and reminders
npm run test:house
npm run test:wrapped
npm run test:recap
npm run build
```

HTTP and browser checks need test servers or credentials. Follow each script's header before running `test:outcomes-local`, `test:ranges-local`, `test:chat-local`, or the Playwright commands. `npm run test:series` targets a configured Supabase project and requires test credentials; use a dedicated test project.

## Further reading

- [Game planner setup and API](docs/game-planner.md)
- [Supabase setup and series rules](docs/supabase-series.md)
- [Google sign-in setup](docs/supabase-setup.md)
- [Linked accounts](docs/linked-accounts.md)
- [Text Bookie: the iMessage agent](docs/imessage-agent.md)
- [The House commentary](docs/the-house.md)
- [Wrapped](docs/alea-wrapped.md)
- [Feature coverage and SQL test map](docs/bet-series-coverage.md)
