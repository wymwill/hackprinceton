/**
 * Bookie's database, as the agent sees it: the agent_* functions from migration 0023,
 * called with the publishable key and the agent secret. Each call acts as the player
 * linked to the sender's address, under the same rules as the app.
 */
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Refusal, type Bookie, type Receipt, type State } from "./brain.ts";

export type BookieConfig = { url: string; key: string; secret: string; timeoutMs?: number };

/** A stable UUID for one message, so a message delivered twice places its wager once. */
export function requestIdFor(handle: string, messageId: string) {
  const h = createHash("sha256").update(`bookie-agent:${handle}:${messageId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function connect(config: BookieConfig) {
  const db: SupabaseClient = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const timeoutMs = config.timeoutMs ?? 8000;

  async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await db.rpc(fn, args).abortSignal(AbortSignal.timeout(timeoutMs));
    if (error) {
      // Rule refusals carry a code in `hint` and a message written for players.
      if (error.hint && error.hint !== "agent_unauthorized" && /^[a-z_]+$/.test(error.hint)) throw new Refusal(error.message);
      throw new Error(`${fn}: ${error.code ?? ""} ${error.message}`);
    }
    return data as T;
  }

  /** The database calls for one sender (e.g. "iMessage:+15551234567") and one message. */
  return function forSender(handle: string, messageId: string): Bookie {
    const base = { p_secret: config.secret, p_handle: handle };
    return {
      state: () => call<State>("agent_state", base),
      link: (code) => call<{ name: string }>("agent_link", { ...base, p_code: code }),
      unlink: () => call<boolean>("agent_unlink", base),
      wager: (seriesId, betId, outcomeId, amount) =>
        call<Receipt>("agent_wager", {
          ...base,
          p_request_id: requestIdFor(handle, messageId),
          p_series_id: seriesId,
          p_bet_id: betId,
          p_outcome: outcomeId,
          p_amount: amount,
        }),
    };
  };
}
