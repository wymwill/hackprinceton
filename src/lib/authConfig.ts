/**
 * How people sign in. Read at request time (not inlined at build), so one
 * build can run in any mode. Used by the proxy, route handlers and the login
 * page, so no "server-only" here, but never import it from client code.
 *
 * - "supabase": Google sign-in through Supabase Auth. Set SUPABASE_URL and
 *   SUPABASE_PUBLISHABLE_KEY (the NEXT_PUBLIC_ names work too).
 * - "demo": the old "Playing as" switcher, with no sign-in, so anyone who can
 *   reach the server can act as anyone. Only when BWF_AUTH=demo is set, and
 *   never in a production build unless BWF_ALLOW_DEMO_IN_PRODUCTION=1 is set
 *   too (the e2e tests do), so a stray BWF_AUTH can't open up a deployment.
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

let warned = false;

export function authMode(): AuthMode {
  if (env("BWF_AUTH") === "demo") {
    if (process.env.NODE_ENV !== "production" || env("BWF_ALLOW_DEMO_IN_PRODUCTION") === "1") {
      if (!warned && supabaseConfig()) {
        warned = true;
        console.warn("BWF_AUTH=demo overrides the Supabase keys: there's no sign-in, and anyone who can reach this server can play as anyone.");
      }
      return "demo";
    }
    if (!warned) {
      warned = true;
      console.warn("Ignoring BWF_AUTH=demo in a production build. Set BWF_ALLOW_DEMO_IN_PRODUCTION=1 to allow it.");
    }
  }
  return supabaseConfig() ? "supabase" : "unconfigured";
}

/** Only same-site paths, so a crafted ?next= can't send someone to another site after sign-in. */
export function safeNext(next: string | null | undefined, fallback = "/") {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
