/**
 * How people sign in. Read at request time (not inlined at build), so one
 * build can run in any mode. Used by the proxy, route handlers and the login
 * page, so no "server-only" here, but never import it from client code.
 *
 * - "supabase": Google sign-in through Supabase Auth. Set SUPABASE_URL and
 *   SUPABASE_PUBLISHABLE_KEY (the NEXT_PUBLIC_ names work too).
 * - "demo": the old "Playing as" switcher, with no sign-in. Only when
 *   BWF_AUTH=demo is set explicitly, for local demos and the e2e tests.
 * - "unconfigured": neither. Every page sends you to /login, which explains
 *   the setup, and every API call is refused. It never guesses who you are.
 */
export type AuthMode = "supabase" | "demo" | "unconfigured";

const env = (name: string) => process.env[name] || undefined;

export function supabaseConfig() {
  const url = env("SUPABASE_URL") ?? env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_PUBLISHABLE_KEY") ?? env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return url && key ? { url, key } : null;
}

export function authMode(): AuthMode {
  if (env("BWF_AUTH") === "demo") return "demo";
  return supabaseConfig() ? "supabase" : "unconfigured";
}

/** Only same-site paths, so a crafted ?next= can't send someone to another site after sign-in. */
export function safeNext(next: string | null | undefined, fallback = "/") {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
