# Turn on Google sign-in (Supabase)

Alea's sign-in code is already in place. Until two keys are added, the login page shows "Continue with Google" turned off and the API refuses every request. This guide is for whoever sets up the Supabase project. It takes about 10 minutes and needs no code changes.

You'll need a Supabase account and a Google account with access to Google Cloud Console.

## 1. Create the Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project. Any name and region work. Save the database password somewhere safe; Alea doesn't use it.
2. Wait for the project to finish setting up.
3. Open the project's API settings and copy two values:
   - the **Project URL**, which looks like `https://abcdefghijkl.supabase.co`
   - the **publishable key** (older projects call it the `anon` key)

Never use the `service_role` or secret key here. The publishable key is meant to be public: the login page sends it to the browser.

Note the project ref, the `abcdefghijkl` part of the URL. You need it in step 2.

## 2. Create a Google OAuth client

1. In [Google Cloud Console](https://console.cloud.google.com/), pick or create a project.
2. Set up the OAuth consent screen if you're asked to. The app name "Alea" and your email are enough. While the app is in testing, add the Google accounts that should be able to sign in as test users.
3. Create an **OAuth client ID** with application type **Web application**.
4. Under **Authorized redirect URIs**, add Supabase's callback, using your project ref:
   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```
   This is Supabase's address, not Alea's. Google always sends people back to Supabase, and Supabase then sends them on to Alea.
5. Save, and copy the **Client ID** and **Client secret**.

## 3. Turn on Google in Supabase

1. In the Supabase project, go to **Authentication → Providers** (called Sign In / Providers in some versions) and open **Google**.
2. Turn it on and paste the Client ID and Client secret from step 2. Save.
3. Go to **Authentication → URL Configuration**:
   - **Site URL:** where Alea runs, for example `http://localhost:3000`
   - **Redirect URLs:** add Alea's callback for every place it runs:
     ```
     http://localhost:3000/auth/callback
     http://localhost:3100/auth/callback
     https://<your-deployed-domain>/auth/callback
     ```
   Supabase only sends people back to URLs on this list, so a missing entry is the most common reason sign-in fails.

## 4. Add the keys to Alea

Create `.env.local` in the repo root (next to `package.json`). It's gitignored, so it never gets committed:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

The names must match exactly. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` also work, if you're copying from a template that uses them.

Then **restart the dev server**. The keys are read when the server starts:

```bash
npm run dev
```

For a deployment such as Vercel, add the same two variables in the project's environment settings and redeploy.

## 5. Check that it works

1. Open the app. You should land on "Sign in to Alea" with **Continue with Google** turned on.
2. Sign in with a Google account that's allowed on the consent screen.
3. You should come back to Alea, signed in, with your Google name and photo in the top right.
4. You start in no groups. Create one, or open an invite link from a friend.
5. Sign in from a second Google account, in a private window, to confirm the two accounts can't see each other's groups until one invites the other.

## If something goes wrong

| What you see | Likely cause |
| --- | --- |
| Google button is still turned off, with "Sign-in is being set up" | The keys aren't in `.env.local`, the names are misspelled, or the server wasn't restarted |
| Google says `redirect_uri_mismatch` | Step 2.4: the Supabase callback URL isn't in the Google client's authorized redirect URIs, or the project ref is wrong |
| After Google, you end up on Supabase's site URL instead of Alea, or see "redirect URL not allowed" | Step 3.3: Alea's `/auth/callback` URL for this host and port isn't in Supabase's redirect URLs |
| Back on the login page with "That sign-in link expired" | The code was used twice or took too long. Sign in again |
| "Unsupported provider: provider is not enabled" | Step 3.2: Google isn't turned on in Supabase |
| Google says the app is blocked, or access denied | The account isn't a test user on the consent screen while the app is in testing |

## For a local demo without accounts

Run `BWF_AUTH=demo npm run dev` to bring back the "Playing as" switcher with no sign-in. Don't use it anywhere real people use the app: anyone can act as anyone.

## How it works

See the "Sign-in" section of the README. In short: `/login` starts Google OAuth through Supabase, `/auth/callback` turns the returned code into a session cookie, `src/proxy.ts` keeps it fresh, and every API call checks the session (`src/server/auth.ts`). Each Google account maps to exactly one Alea user, and people only see others who share a group with them.
