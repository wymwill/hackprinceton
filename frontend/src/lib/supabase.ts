import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Auth in the browser. The URL and publishable (anon) key come from
 * the repo-root .env.local (SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY), picked
 * up by vite.config.ts. Both are safe to ship to browsers; never the secret key.
 */
const url = __SUPABASE_URL__;
const key = __SUPABASE_KEY__;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

/**
 * A readable version of a Supabase error. When the browser can't reach Supabase at all,
 * supabase-js only says "Failed to fetch"; say which server and what to try instead.
 */
export function authErrorText(error: { message: string; name?: string; status?: number }) {
  const unreachable = /failed to fetch|networkerror|load failed|fetch failed/i.test(error.message) || error.name === "AuthRetryableFetchError";
  if (!unreachable) return error.message;
  let host = "the sign-in server";
  try {
    host = new URL(url).host;
  } catch {
    /* keep the generic name */
  }
  return `Couldn't reach ${host}. Reload this page and try again; if it keeps happening, check your internet connection.`;
}

/** Whether a sign-in provider (e.g. "google") is turned on in the Supabase project. Null if unknown. */
export async function providerEnabled(name: string): Promise<boolean | null> {
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    if (!res.ok) return null;
    const settings = (await res.json()) as { external?: Record<string, boolean> };
    return settings.external?.[name] ?? false;
  } catch {
    return null;
  }
}
