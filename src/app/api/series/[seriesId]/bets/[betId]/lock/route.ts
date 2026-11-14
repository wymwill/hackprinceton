import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** Host stops new wagers. A one-sided pool is refunded right away. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/bets/[betId]/lock">) {
  const { seriesId, betId } = await ctx.params;
  return seriesAction(req, ({ rpc }) => rpc("lock_series_bet", { p_series_id: seriesId, p_bet_id: betId }));
}
