import type { NextRequest } from "next/server";
import { seriesAction, side } from "@/server/seriesApi";

/** Put coins on YES or NO (add to your side; no switching). Body: { outcome: "YES" | "NO", amount } */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/bets/[betId]/wagers">) {
  const { seriesId, betId } = await ctx.params;
  return seriesAction(
    req,
    ({ body, rpc }) =>
      rpc("place_series_wager", { p_series_id: seriesId, p_bet_id: betId, p_outcome: side(body.outcome ?? body.side), p_amount: body.amount }),
    201
  );
}
