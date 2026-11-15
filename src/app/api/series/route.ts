import type { NextRequest } from "next/server";
import { seriesAction, check, requestIdOf, text } from "@/server/seriesApi";

/** Series you're in, newest first (all statuses). */
export async function GET(req: NextRequest) {
  return seriesAction(req, async ({ userId, from }) => {
    const ids = check(await from("bet_series_participants").select("series_id").eq("user_id", userId)) as { series_id: string }[];
    if (!ids.length) return [];
    return check(
      await from("bet_series")
        .select("id,title,status,invite_code,host_user_id,stake_mode,planned_bet_count,initial_bankroll,loser_count,created_at")
        .in("id", ids.map((r) => r.series_id))
        .order("created_at", { ascending: false })
    );
  });
}

/**
 * Create a lobby; the caller hosts it. Send requestId (a UUID) to make it happen at most once.
 * Body: { title, description?, plannedBetCount, initialBankroll, loserCount,
 *   stakeMode: "SHARED_FAVOR_POOL" | "PLEDGE" | "MONEY",
 *   questions?: string[] (YES/NO bets) or bets?: [{ question, outcomes?: string[] (2..10), tieRule?: "refund" | "first_listed" }]
 *     (0..plannedBetCount, not both),
 *   settings?: { minContribution, favorsPerPlayer, exclusivePool, tiebreak, betCreation, withdrawMinutes, hostPlays } }
 */
export async function POST(req: NextRequest) {
  return seriesAction(
    req,
    ({ body, rpc }) => {
      const requestId = requestIdOf(body);
      const args = {
        p_title: text(body.title),
        p_description: text(body.description),
        p_planned_bet_count: body.plannedBetCount,
        p_initial_bankroll: body.initialBankroll,
        p_loser_count: body.loserCount,
        p_stake_mode: text(body.stakeMode),
        p_questions: Array.isArray(body.questions) ? body.questions.map(text) : [],
        p_settings: body.settings && typeof body.settings === "object" ? body.settings : {},
        ...(Array.isArray(body.bets) ? { p_bets: body.bets } : {}),
      };
      // With requestId, repeating the request returns the series it already created (replayed: true).
      return requestId ? rpc("create_bet_series_once", { p_request_id: requestId, ...args }) : rpc("create_bet_series", args);
    },
    201
  );
}
