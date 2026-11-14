import type { NextRequest } from "next/server";
import { outcomeRef, seriesAction } from "@/server/seriesApi";

/**
 * Put coins on one of the bet's outcomes (add to yours; no switching).
 * Body: { outcomeId, amount }. The older { outcome: "YES" | "NO", amount } still works.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/bets/[betId]/wagers">) {
  const { seriesId, betId } = await ctx.params;
  return seriesAction(
    req,
    ({ body, rpc }) => rpc("place_series_wager", { p_series_id: seriesId, p_bet_id: betId, p_outcome: outcomeRef(body), p_amount: body.amount }),
    201
  );
}
