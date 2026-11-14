/**
 * Supabase settings for the Bet Series API. Read at request time, so one build
 * works anywhere. Server-only: never import it from the browser app.
 * SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (the NEXT_PUBLIC_ names work too).
 */
const env = (name: string) => process.env[name] || undefined;

export function supabaseConfig() {
  const url = env("SUPABASE_URL") ?? env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_PUBLISHABLE_KEY") ?? env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return url && key ? { url, key } : null;
}
