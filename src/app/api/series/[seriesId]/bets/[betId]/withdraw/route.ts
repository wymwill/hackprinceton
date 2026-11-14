import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** Take your whole wager back, inside the withdrawal window. Answers with the coins returned. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/bets/[betId]/withdraw">) {
  const { seriesId, betId } = await ctx.params;
  return seriesAction(req, ({ rpc }) => rpc("withdraw_series_wager", { p_series_id: seriesId, p_bet_id: betId }));
}
