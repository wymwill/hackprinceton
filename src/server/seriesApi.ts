import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/authConfig";
import { AppError } from "./errors";
import { errorResponse, readJson } from "./http";
import { migrationsMissing } from "./migrations";

/**
 * The Bet Series API. The rules live in Postgres (supabase/migrations): every
 * write is one security-definer RPC that locks the series row, so balance checks
 * and settlement can't race, even across server instances.
 *
 * Callers send `Authorization: Bearer <Supabase access token>`. The token goes
 * along on every query, so `auth.uid()` and row-level security see that player.
 * Nothing in a request body can pick who is acting or what role they have.
 *
 * Uses the same SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY as sign-in (the
 * NEXT_PUBLIC_ names work too; see src/lib/authConfig.ts).
 */

/** HTTP status for each error code the SQL raises (in the error's `hint`). Anything else is a 400. */
const STATUS: Record<string, number> = {
  unauthorized: 401,
  not_host: 403,
  not_member: 403,
  not_player: 403,
  not_winner: 403,
  not_author: 403,
  not_loser: 403,
  series_not_found: 404,
  bet_not_found: 404,
  favor_not_found: 404,
  series_not_lobby: 409,
  series_not_active: 409,
  series_not_complete: 409,
  series_over: 409,
  bet_not_open: 409,
  bets_still_open: 409,
  favor_proposals_closed: 409,
  questions_locked: 409,
  outcomes_locked: 409,
  planned_questions_full: 409,
  planned_questions_required: 409,
  one_person: 409,
  too_few_participants: 409,
  favors_missing: 409,
  not_ready: 409,
  already_picked: 409,
  favor_taken: 409,
  picks_in_order: 409,
  assignment_not_pending: 409,
  not_picked: 409,
  not_accepted: 409,
  withdraw_closed: 409,
  friend_not_found: 404,
  quiz_wrong: 422,
  clan_not_found: 404,
  friend_self: 409,
  already_in_clan: 409,
  not_in_clan: 409,
  link_not_connected: 409,
  unknown_provider: 404,
  not_clan_member: 403,
  not_message_author: 403,
  message_not_found: 404,
  slow_down: 429,
  request_id_reused: 409,
};

type PgError = { message: string; hint?: string | null; code?: string | null; details?: string | null };

/** `path` is the request's path, so a missing function can be blamed on the right feature. */
function toAppError(error: PgError, path = ""): AppError {
  const code = error.hint && /^[a-z_]+$/.test(error.hint) ? error.hint : undefined;
  if (code) return new AppError(STATUS[code] ?? 400, code, error.message);
  // An id in the URL that isn't a UUID.
  if (error.code === "22P02") return new AppError(404, "not_found", "That doesn't exist.");
  // A database function the API isn't allowed to call (for example one a later migration retired).
  if (error.code === "42501") return new AppError(403, "not_allowed", "That action isn't available.");
  if (error.code === "PGRST301" || error.code === "PGRST303" || /jwt/i.test(error.message)) {
    return new AppError(401, "unauthorized", "Your session expired. Sign in again.");
  }
  const missing = migrationsMissing(error, path);
  if (missing) return missing;
  console.error("Bet Series request failed:", error);
  return new AppError(500, "series_request_failed", "Something went wrong. Try again.");
}

/** A Supabase client that acts as the signed-in caller. */
async function callerClient(req: Request) {
  const config = supabaseConfig();
  if (!config) throw new AppError(503, "auth_not_configured", "Sign-in isn't set up on this server yet.");
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) throw new AppError(401, "unauthorized", "Sign in to continue.");
  const client = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new AppError(401, "unauthorized", "Your session expired. Sign in again.");
  return { client, userId: data.claims.sub };
}

export type SeriesCtx = {
  userId: string;
  body: Record<string, unknown>;
  /** Call an RPC as the caller. Throws an AppError with the rule's message when it says no. */
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<unknown>;
  /** Read a table as the caller (row-level security applies). */
  from: ReturnType<typeof createClient>["from"];
};

/** Run one Series action for the signed-in caller and answer `{ result }`. */
export async function seriesAction(req: Request, action: (c: SeriesCtx) => Promise<unknown>, status = 200) {
  const path = new URL(req.url).pathname;
  try {
    const { client, userId } = await callerClient(req);
    const body = req.method === "GET" || req.method === "DELETE" ? {} : await readJson(req);
    const rpc = async (fn: string, args?: Record<string, unknown>) => {
      const { data, error } = await client.rpc(fn, args);
      if (error) throw toAppError(error, path);
      return data;
    };
    const from: SeriesCtx["from"] = (table: string) => client.from(table);
    const result = await action({ userId, body, rpc, from });
    return Response.json({ result: result ?? null }, { status });
  } catch (err) {
    if (err && typeof err === "object" && "message" in err && !(err instanceof AppError) && "code" in err) {
      return errorResponse(toAppError(err as PgError, path));
    }
    return errorResponse(err);
  }
}

/** Throw the readable error for a failed table read. */
export function check<T>({ data, error }: { data: T; error: PgError | null }): T {
  if (error) throw toAppError(error);
  return data;
}

/**
 * Which outcome a request means: `outcomeId` (preferred), or the older `outcome` / `side`
 * label ("YES", "no", or a multiple-choice label). The SQL matches ids exactly and labels
 * ignoring case, and refuses anything that isn't one of the bet's outcomes.
 */
export const outcomeRef = (body: Record<string, unknown>) => {
  const v = body.outcomeId ?? body.outcome ?? body.side;
  return typeof v === "string" ? v : null;
};
export const text = (v: unknown) => (typeof v === "string" ? v : "");
/**
 * A bet's closing time from a request: undefined when not given, null to clear it, or an
 * ISO date-time with an explicit offset (Z or ±hh:mm), so it can't depend on any server's
 * timezone. Anything else is refused. The database checks it's in the future.
 */
export function closesAtOf(body: Record<string, unknown>): string | null | undefined {
  if (!("closesAt" in body)) return undefined;
  const v = body.closesAt;
  if (v === null || v === "") return null;
  if (typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:?\d\d)$/.test(v) && !Number.isNaN(Date.parse(v))) return v;
  throw new AppError(400, "invalid_deadline", "Closing times need a date, a time and a timezone.");
}
/**
 * The client's submission id (a UUID), which makes a wager or a new series happen at
 * most once however often the request is repeated. Null when the request has none
 * (older callers); a value that isn't a UUID is refused rather than ignored.
 */
export function requestIdOf(body: Record<string, unknown>): string | null {
  const v = body.requestId;
  if (v === undefined || v === null) return null;
  if (typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return v.toLowerCase();
  throw new AppError(400, "invalid_request", "That submission id isn't valid.");
}
/** A list of strings, or undefined when the field is missing (so the SQL default applies). */
export const texts = (v: unknown) => (Array.isArray(v) ? v.map(text) : undefined);
/** A JSON number as-is; anything else (including numeric strings) as null, so the SQL decides. */
export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
/**
 * The fields that describe a bet's outcomes:
 *   multiple choice: { outcomes: string[], tieRule? }; nothing = YES/NO;
 *   range: { kind: "range", ranges: [{ lower, upper }] (null = open end), unit?, decimals? }.
 */
export const betShape = (body: Record<string, unknown>) => ({
  p_outcomes: texts(body.outcomes) ?? null,
  p_tie_rule: typeof body.tieRule === "string" ? body.tieRule : null,
  p_kind: typeof body.kind === "string" ? body.kind : null,
  // Passed through as JSON; _bs_clean_ranges checks every bound.
  p_ranges: Array.isArray(body.ranges) ? body.ranges : null,
  p_unit: typeof body.unit === "string" ? body.unit : null,
  p_decimals: num(body.decimals),
});
