import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** Host deletes a bet that hasn't opened yet (lobby only). */
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/bets/[betId]">) {
  const { seriesId, betId } = await ctx.params;
  return seriesAction(req, ({ rpc }) => rpc("remove_series_bet", { p_series_id: seriesId, p_bet_id: betId }));
}
