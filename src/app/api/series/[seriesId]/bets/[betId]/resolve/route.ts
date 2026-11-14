import type { NextRequest } from "next/server";
import { seriesAction, side } from "@/server/seriesApi";

/** Host settles the bet. Body: { outcome: "YES" | "NO" } */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/bets/[betId]/resolve">) {
  const { seriesId, betId } = await ctx.params;
  return seriesAction(req, ({ body, rpc }) =>
    rpc("finish_series_bet", { p_series_id: seriesId, p_bet_id: betId, p_outcome: side(body.outcome), p_cancel: false })
  );
}
