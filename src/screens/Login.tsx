"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { AuthMode } from "@/lib/authConfig";
import { Button, card } from "@/components/ui";

/** Sign in with Google through Supabase. In demo mode there's nothing to sign in to. */
export default function Login({ mode, supabase }: { mode: AuthMode; supabase: { url: string; key: string } | null }) {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [error, setError] = useState(params.get("error"));
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const client = createBrowserClient(supabase.url, supabase.key);
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    // On success the browser is already on its way to Google.
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto pt-6 flex flex-col gap-4">
      <section className={`${card} p-6 flex flex-col items-center text-center gap-5`}>
        <span className="w-14 h-14 rounded-2xl bg-primary-container text-on-primary flex items-center justify-center" aria-hidden>
          <span className="material-symbols-outlined text-[32px]">casino</span>
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-headline-lg text-on-surface">Sign in to Alea</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">Bet with your friends on real life. No money, just bragging rights and dares.</p>
        </div>

        {mode !== "demo" && (
          // Shown before the keys exist too, so the page looks finished; it only works once Supabase is set up.
          <Button className="w-full h-12 bg-white! text-[#1f1f1f]! hover:brightness-95" onClick={signIn} disabled={busy || mode !== "supabase"}>
            <GoogleMark />
            {busy ? "Opening Google…" : "Continue with Google"}
          </Button>
        )}

        {mode === "unconfigured" && (
          <details className="w-full text-left font-body-sm text-body-sm text-on-surface-variant">
            <summary className="cursor-pointer text-center">Sign-in is being set up</summary>
            <p className="mt-2">
              Google sign-in turns on once <code className="font-num text-on-surface">SUPABASE_URL</code> and <code className="font-num text-on-surface">SUPABASE_PUBLISHABLE_KEY</code> are in{" "}
              <code className="font-num">.env.local</code> and the server restarts. Step-by-step setup: <code className="font-num text-on-surface">docs/supabase-setup.md</code>. For a local demo without accounts, run with{" "}
              <code className="font-num text-on-surface">BWF_AUTH=demo</code>.
            </p>
          </details>
        )}

        {mode === "demo" && (
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            This server runs in demo mode, so there&apos;s no sign-in. Pick who you&apos;re playing as at the top.{" "}
            <Link href="/" className="text-primary hover:underline">
              Go to the app
            </Link>
          </p>
        )}

        {error && (
          <p role="alert" className="w-full rounded-xl bg-secondary/10 ring-1 ring-secondary/40 px-3 py-2 font-body-sm text-body-sm text-secondary">
            {error}
          </p>
        )}
      </section>
      {mode === "supabase" && <p className="text-center font-body-sm text-body-sm text-on-surface-variant">We only use your name and photo. Your groups and bets are visible only to people in those groups.</p>}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
