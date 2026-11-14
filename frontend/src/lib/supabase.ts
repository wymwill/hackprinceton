import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Auth in the browser. The URL and publishable (anon) key come from
 * the repo-root .env.local (SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY), picked
 * up by vite.config.ts. Both are safe to ship to browsers; never the secret key.
 */
const url = __SUPABASE_URL__;
const key = __SUPABASE_KEY__;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
