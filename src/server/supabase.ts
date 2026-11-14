import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "@/lib/authConfig";

/**
 * A Supabase client for route handlers, reading and writing the session
 * cookies of the current request. The proxy refreshes the session on every
 * request, so handlers mostly just read it.
 */
export async function serverSupabase() {
  const config = supabaseConfig();
  if (!config) return null;
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Read-only contexts can't set cookies. The proxy already refreshed them.
        }
      },
    },
  });
}
