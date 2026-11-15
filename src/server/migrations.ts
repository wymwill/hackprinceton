import "server-only";
import { AppError } from "./errors";

/**
 * When the database is behind the code: a function, table or column the API
 * needs isn't there yet (PostgREST PGRST202 / PGRST205, Postgres 42883 / 42P01 / 42703).
 * The answer names the feature the request belongs to, the missing object, and the
 * migration to apply, instead of blaming Bet Series for everything.
 */
const FEATURES: { path: RegExp; feature: string; migration: string }[] = [
  { path: /^\/api\/photon(\/|$)/, feature: "iMessage", migration: "supabase/migrations/202611150001_photon_messaging.sql" },
  { path: /^\/api\/social\/(chat$|clans\/[^/]+\/(messages|read)(\/|$))/, feature: "Clan chat", migration: "supabase/migrations/202611140013_clan_chat.sql" },
  { path: /^\/api\/social\//, feature: "Friends and clans", migration: "supabase/migrations/202611140012_friends_and_clans.sql" },
  { path: /^\/api\/links(\/|$)/, feature: "Linked accounts", migration: "supabase/migrations/202611140020_linked_accounts.sql" },
];

const MISSING_CODES = new Set(["PGRST202", "PGRST205", "42883", "42P01", "42703"]);

/** The function, table or column the error says is missing, e.g. "clan_messages_page". */
export function missingName(message: string) {
  const m =
    message.match(/function (?:public\.)?([a-z_][a-z0-9_]*)/i) ??
    message.match(/table '(?:public\.)?([a-z_][a-z0-9_]*)'/i) ??
    message.match(/relation "(?:public\.)?([a-z_][a-z0-9_]*)"/i) ??
    message.match(/column (?:[a-z_][a-z0-9_]*\.)?([a-z_][a-z0-9_]*) does not exist/i);
  return m?.[1] ?? null;
}

export function migrationsMissing(error: { code?: string | null; message: string }, path = ""): AppError | null {
  if (!error.code || !MISSING_CODES.has(error.code)) return null;
  const name = missingName(error.message);
  const what = name ? ` (missing: ${name})` : "";
  const f = FEATURES.find((x) => x.path.test(path));
  console.error(`Database is behind the code for ${path || "a request"}: ${error.code} ${error.message}`);
  if (f) return new AppError(503, "migrations_missing", `${f.feature} isn't set up on this database yet${what}. Apply ${f.migration}.`);
  return new AppError(
    503,
    "migrations_missing",
    `The database is missing part of Bet Series${what}. Apply the files in supabase/migrations in order (see docs/supabase-series.md).`
  );
}
