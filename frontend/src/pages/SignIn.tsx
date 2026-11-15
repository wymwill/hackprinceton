import { useEffect, useState } from "react";
import { authErrorText, providerEnabled, supabase } from "../lib/supabase.ts";

/**
 * Sign in with Google, or with an email and password (works with no provider
 * setup; Supabase may ask new accounts to confirm their email first). After
 * Google, Supabase sends people back to the page they started on, so an
 * invite link (/join/CODE) still works.
 */
export default function SignIn() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "err" } | null>(null);
  // Google only works once it is turned on in Supabase; until then, offer email only.
  const [googleOn, setGoogleOn] = useState<boolean | null>(null);
  useEffect(() => {
    providerEnabled("google").then(setGoogleOn);
  }, []);

  const google = async () => {
    setMessage(null);
    const { error } = await supabase!.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.href } });
    if (error) setMessage({ text: authErrorText(error), tone: "err" });
  };

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    const auth = supabase!.auth;
    if (mode === "in") {
      const { error } = await auth.signInWithPassword({ email, password });
      if (error) setMessage({ text: authErrorText(error), tone: "err" });
    } else {
      const { data, error } = await auth.signUp({
        email,
        password,
        options: { data: { full_name: name.trim() || undefined }, emailRedirectTo: window.location.href },
      });
      if (error) setMessage({ text: authErrorText(error), tone: "err" });
      else if (!data.session) setMessage({ text: "Check your email to confirm your account, then sign in.", tone: "ok" });
    }
    setBusy(false);
  };

  return (
    <div className="boot">
      <span className="brand-name">Bookie</span>
      <p className="hint" style={{ maxWidth: 380 }}>
        YES/NO bets with friends, played for virtual coins across a whole series. Sign in to see your series.
      </p>
      <section className="panel tagged" style={{ width: "min(400px, 100%)", textAlign: "left" }}>
        <span className="plabel">{mode === "in" ? "Sign in" : "Create account"}</span>
        <div className="pbody stack">
          <button type="button" className="btn primary block" onClick={google} disabled={googleOn === false}>
            Continue with Google
          </button>
          {googleOn === false && <p className="hint">Google sign-in isn't set up yet. Use email for now.</p>}
          <div className="rule" />
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {mode === "up" && (
              <label className="field">
                <span>Your name</span>
                <input className="input text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Placeholder placeholder" autoComplete="name" />
              </label>
            )}
            <label className="field">
              <span>Email</span>
              <input className="input text" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                className="input text"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                minLength={6}
                required
              />
            </label>
            {message && <p className={`notice ${message.tone === "ok" ? "ok" : ""}`}>{message.text}</p>}
            <button className="btn block" disabled={busy}>
              {mode === "in" ? "Sign in with email" : "Create account"}
            </button>
          </form>
          <button type="button" className="btn ghost sm" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
          </button>
        </div>
      </section>
    </div>
  );
}
