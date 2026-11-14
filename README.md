# Alea

Friend groups compete over a **series** of bets with virtual coins: YES/NO, multiple choice with 2 to 10 outcomes the host names, or numerical ranges ("tomorrow's high: below 60°F, 60–64°F, …") settled by entering the measured value. Whoever finishes at the bottom owes a favor: one they pledged, or one the winners pick from a shared pool. No money moves.

- **Screens:** `frontend/`, a React app (Vite, React Router). See [frontend/README.md](frontend/README.md).
- **API:** the Next.js app in `src/app/api/series`, which calls Supabase.
- **Rules and data:** Supabase Postgres, as SQL functions in `supabase/migrations`. See [docs/supabase-series.md](docs/supabase-series.md).
- **Sign-in:** Supabase Auth, with Google or email and password.

## Run it

1. Put the Supabase project's URL and publishable key in `.env.local` at the repo root (copy `.env.example`):
   ```
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_PUBLISHABLE_KEY=<publishable key>
   ```
2. Install and start:
   ```bash
   npm install
   npm run dev
   ```
3. Open **http://localhost:3000**.

`npm install` also installs `frontend/`. `npm run dev` starts both the Next server (API, port 3000) and the Vite server (screens, port 5173). Next forwards every page to Vite, so always open port 3000; live reload still works. `npm run dev:lan` lets phones on the same Wi-Fi open it.

## Build and deploy

```bash
npm run build   # builds frontend/ into public/app/, then the Next app
npm start
```

Every path that isn't an API route or an icon serves `public/app/index.html`, and the React app takes it from there. On Vercel, set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in the project's environment variables. The frontend build reads them too, so set them before deploying. Then add the deployed address to Supabase's redirect URLs (see below).

## Sign-in setup

Supabase project → **Authentication**:

- **URL Configuration → Redirect URLs:** `http://localhost:3000/**`, plus `https://<your-domain>/**` once deployed. People come back to the page they started on, so the wildcard matters.
- **Sign In / Providers → Google:** on, with a Google OAuth client. See [docs/supabase-setup.md](docs/supabase-setup.md).
- **Email:** on by default. New accounts confirm their email first. Supabase's built-in mailer only sends a few emails an hour, so connect your own SMTP before real users sign up.

The sign-in page switches the Google button off by itself while Google isn't enabled.

## Checks

```bash
npm run typecheck        # Next app and frontend
npm run lint
npm run test:series-sql      # the SQL rules, on an in-memory Postgres (bets, upgrades, friends, clans and clan chat)
npm run test:outcomes-local  # multiple-choice bets over HTTP, against the local Supabase stand-in (see the script header)
npm run test:ranges-local    # numerical range bets over HTTP, same setup
npm run test:chat-local      # clan chat over HTTP and Realtime, same setup
npm run test:series          # API end to end against the real Supabase project (needs .supabase-test-secret)
```

## Layout

| Path | What's there |
| --- | --- |
| `frontend/src/pages` | Screens: home, new series, lobby, dashboard, bets, results, profile |
| `frontend/src/lib` | API client and session (`store.tsx`), rules helpers, avatars, theme |
| `src/app/api/series` | One route per action, each a thin call into `src/server/seriesApi.ts` |
| `src/app/manifest.ts`, `src/app/icons` | Home-screen install files |
| `supabase/migrations` | Tables, rules and the avatar storage bucket |
| `scripts/dev.mjs` | Starts both dev servers |
