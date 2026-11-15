# Linked accounts

Players can link Strava, Fitbit, Oura, Whoop, Spotify and GitHub on their profile. Everything linked becomes proof on bets: the bet page's **Proof from linked apps** panel shows a player's runs, steps, sleep, songs or GitHub pushes since the bet opened. The host still decides the result.

- **Database:** `supabase/migrations/202611140020_linked_accounts.sql`
- **Server:** `src/server/links.ts`, where each app's sign-in and data mapping lives
- **Routes:** `src/app/api/links/*`
- **Screens:** `frontend/src/components/LinkedAccounts.tsx` (profile) and `LinkedProof.tsx` (bet page)

## How it works

- Each player's own app links, syncs and unlinks with their own Alea sign-in. The server never needs a secret Supabase key.
- Sign-in tokens are stored per player and only ever returned to that player.
- Proof items are copied in from the last 60 days. After that, each sync fetches from a day before the last one. Links that are over 30 minutes stale sync once per browser session.
- Only people who share a series with you can see your proof.
- Unlinking deletes the link and everything copied from it.

What each app provides:

| App | Proof kinds | Notes |
| --- | --- | --- |
| Strava | run, ride, walk, hike, swim, workout (distance) | Scope `read,activity:read`. "Only me" activities aren't included. |
| Fitbit | steps_day, sleep_night (minutes asleep) | PKCE. Scopes `activity sleep`. |
| Oura | sleep_night (score), readiness_day (score), workouts | Scopes `daily sleep workout`. |
| Whoop | recovery_day (%), sleep_night (minutes), workouts | Scopes `read:recovery read:sleep read:workout read:profile offline`. |
| Spotify | listen (one per song, in minutes) | PKCE, no secret. Spotify only keeps your last 50 plays, so proof only reaches back as far as the most recent sync. |
| GitHub | push (count of pushes), pull_request (merged) | No sign-in: people link a public username. Public events only, from the last 90 days (at most 300). GitHub's public events no longer include commit counts, so pushes are counted. |

## Setting up each app

Make a developer app with each service you want to offer. Put its ID (and secret, where there is one) in `.env.local`, then restart `npm run dev`; see `.env.example`. The redirect URI is always:

```
http://localhost:3000/connect/<provider>/callback
```

Add `https://<your-domain>/connect/<provider>/callback` once you deploy. `<provider>` is `strava`, `fitbit`, `oura`, `whoop` or `spotify`.

| App | Where | What to set | Before approval |
| --- | --- | --- | --- |
| Strava | https://www.strava.com/settings/api | **Authorization Callback Domain:** `localhost` (Strava matches the domain, not the full URI) | New apps allow only a handful of athletes. Request more capacity from Strava. |
| Fitbit | https://dev.fitbit.com/apps/new | **OAuth 2.0 Application Type:** Personal or Server; **Redirect URL** as above | A Personal app only works for the developer's own account. Use Server to let others link. |
| Oura | https://cloud.ouraring.com/oauth/applications | **Redirect URI** as above | New apps are limited to a small number of users until Oura reviews them. |
| Whoop | https://developer-dashboard.whoop.com | **Redirect URI** as above, and the scopes listed earlier | Limited to test members until Whoop approves the app. |
| Spotify | https://developer.spotify.com/dashboard | **Redirect URI** as above. Spotify doesn't allow `localhost`, so use `http://127.0.0.1:3000/connect/spotify/callback` and open the app at `http://127.0.0.1:3000` to link it. | Development mode allows only users you add by email under **User Management**. |
| GitHub | Nothing needed | Optionally set `GITHUB_TOKEN` (a token with no scopes) | Without a token, GitHub allows this server 60 requests an hour. |

These providers change their limits and review rules from time to time, so check each dashboard.
