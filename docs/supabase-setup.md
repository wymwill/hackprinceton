# Turn on Google sign-in (Supabase)

Alea's sign-in page offers Google and email. Email works with no setup. The Google button stays turned off until Google is enabled in the Supabase project; it checks by itself, so no code change or restart is needed. This guide takes about 10 minutes.

You'll need access to the Supabase project and a Google account with Google Cloud Console.

## 1. The Supabase project

In the project's API settings, copy:

- the **Project URL**, like `https://abcdefghijkl.supabase.co`. The `abcdefghijkl` part is the **project ref**.
- the **publishable key** (older projects call it the `anon` key). Never use the secret or `service_role` key in the app.

Put both in `.env.local` at the repo root, as in `.env.example`, then restart `npm run dev`.

## 2. Create a Google OAuth client

1. Open [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) and pick or create a project.
2. Set up the **OAuth consent screen**: External, app name "Alea", and your email as support and developer contact.
3. **Create Credentials → OAuth client ID → Web application.**
4. Under **Authorized redirect URIs**, add Supabase's callback with your project ref:
   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```
   Google always returns people to Supabase, and Supabase sends them on to Alea.
5. Create it, and copy the **Client ID** and **Client secret**.

## 3. Turn on Google in Supabase

1. **Authentication → Sign In / Providers → Google**: turn it on, paste the Client ID and secret, save.
2. **Authentication → URL Configuration → Redirect URLs**: add every address Alea runs at, with `/**` because people return to the page they started on:
   ```
   http://localhost:3000/**
   https://<your-domain>/**
   ```

## 4. Let people in

While the Google app is in **Testing**, only accounts on its test-user list can sign in; everyone else sees "Access blocked".

- **For a few people:** on the OAuth consent screen, go to **Audience → Test users** and add their Google accounts (up to 100).
- **For everyone:** on the same page, click **Publish app**. It's free. Alea only asks for name, email and photo, so Google's full review doesn't apply. People may see an "unverified app" note until you complete brand verification, which needs a home page, a privacy policy link and a verified domain.

## If something goes wrong

| What you see | Likely cause |
| --- | --- |
| Google button turned off, "Google sign-in isn't set up yet" | Google isn't enabled in Supabase (step 3.1), or `.env.local` points at another project |
| Google says `redirect_uri_mismatch` | Step 2.4: the Supabase callback isn't in the Google client's redirect URIs, or the ref is wrong |
| Google says "Access blocked" | The account isn't a test user (step 4) |
| After Google you land on the wrong site, or "redirect URL not allowed" | Step 3.2: this address isn't in Supabase's redirect URLs |
| "Unsupported provider: provider is not enabled" | Step 3.1 |
