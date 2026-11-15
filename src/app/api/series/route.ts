import type { NextRequest } from "next/server";
import { closesAt, seriesAction, check, setClose, text } from "@/server/seriesApi";

/** Series you're in, newest first (all statuses). */
export async function GET(req: NextRequest) {
  return seriesAction(req, async ({ userId, from }) => {
    const ids = check(await from("bet_series_participants").select("series_id").eq("user_id", userId)) as { series_id: string }[];
    if (!ids.length) return [];
    return check(
      await from("bet_series")
        .select("id,title,status,invite_code,host_user_id,stake_mode,planned_bet_count,initial_bankroll,loser_count,created_at")
        .in(
          "id",
          ids.map((r) => r.series_id),
        )
        .order("created_at", { ascending: false }),
    );
  });
}

/**
 * Create a lobby; the caller hosts it.
 * Body: { title, description?, plannedBetCount, initialBankroll, loserCount,
 *   stakeMode: "SHARED_FAVOR_POOL" | "PLEDGE" | "MONEY",
 *   questions?: string[] (YES/NO bets) or bets?: [{ question, outcomes?: string[] (2..10), tieRule?: "refund" | "first_listed" }]
 *     (0..plannedBetCount, not both); any bet can add closesAt (an ISO time in the future),
 *   settings?: { minContribution, favorsPerPlayer, exclusivePool, tiebreak, betCreation, withdrawMinutes, hostPlays } }
 */
export async function POST(req: NextRequest) {
  return seriesAction(
    req,
    async ({ body, rpc, from }) => {
      const bets = Array.isArray(body.bets) ? (body.bets as Record<string, unknown>[]) : null;
      // Check every close time before anything is created.
      const closes = (bets ?? []).map((b) => (b && typeof b === "object" ? closesAt(b) : undefined));
      const series = (await rpc("create_bet_series", {
        p_title: text(body.title),
        p_description: text(body.description),
        p_planned_bet_count: body.plannedBetCount,
        p_initial_bankroll: body.initialBankroll,
        p_loser_count: body.loserCount,
        p_stake_mode: text(body.stakeMode),
        p_questions: Array.isArray(body.questions) ? body.questions.map(text) : [],
        p_settings: body.settings && typeof body.settings === "object" ? body.settings : {},
        ...(bets ? { p_bets: bets } : {}),
      })) as { id: string };
      if (closes.some((c) => c)) {
        // The bets were written in the order given, so position n is bets[n - 1].
        const rows = check(await from("series_bets").select("id,position").eq("series_id", series.id).order("position")) as { id: string }[];
        for (const [i, c] of closes.entries()) if (c && rows[i]) await setClose(rpc, series.id, rows[i].id, c);
      }
      return series;
    },
    201,
  );
}
