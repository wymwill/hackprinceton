# GitHub activity proof

GitHub is Bookie's only profile integration. In **Profile → GitHub**, enter a public GitHub username and select **Connect**. No GitHub OAuth application, callback URL, client secret, or user access token is required.

The connection imports public pushes and merged pull requests. **Sync** refreshes the activity, and **Disconnect** removes the connection and its copied proof. Bet pages show **GitHub activity**, with filters for the player and activity type. The host still confirms the result.

A username connection does not verify ownership of the account. Treat it as public supporting information, not authenticated evidence that a player owns the account.

## Optional server configuration

Set `GITHUB_TOKEN` in `.env.local` and restart the server if you need additional GitHub API request capacity. Only public endpoints are used; no private-repository access is needed. Keep the token server-only. Connecting without a token still works, subject to GitHub's unauthenticated limits.

## Implementation

- `src/server/links.ts`: GitHub username lookup, public events, sync, and disconnect.
- `src/app/api/links/`: authenticated connection and proof routes.
- `frontend/src/components/LinkedAccounts.tsx`: profile connection controls.
- `frontend/src/components/LinkedProof.tsx`: GitHub proof on a bet.
- `supabase/migrations/202611140020_linked_accounts.sql`: existing storage and access rules.

Only users who share a series can see its players' copied GitHub proof. The API lists GitHub alone and restricts proof queries to GitHub. Syncs fetch up to three pages of public events and overlap the previous sync by one day to avoid missing recent events; database keys deduplicate saved items. Push events count pushes, not commits.

The former OAuth providers have been removed from the application. Historical database schema and rows are retained; they are not exposed by the current profile/proof API or synced. No database migration is required for this change. Old browser callback links redirect to Profile.

The Gemini game planner is a separate feature; see [its setup guide](game-planner.md).
