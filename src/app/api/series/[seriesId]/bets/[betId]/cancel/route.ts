import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** Host cancels the bet: every stake goes back. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/bets/[betId]/cancel">) {
  const { seriesId, betId } = await ctx.params;
  return seriesAction(req, ({ rpc }) => rpc("finish_series_bet", { p_series_id: seriesId, p_bet_id: betId, p_outcome: null, p_cancel: true }));
}
