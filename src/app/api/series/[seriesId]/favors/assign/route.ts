import type { NextRequest } from "next/server";
import { seriesAction, text } from "@/server/seriesApi";

/** Shared pool: a winner picks the favor for the loser they're paired with. Body: { loserId, favorId } */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/favors/assign">) {
  const { seriesId } = await ctx.params;
  return seriesAction(
    req,
    ({ body, rpc }) => rpc("assign_series_favor", { p_series_id: seriesId, p_loser_id: text(body.loserId), p_favor_id: text(body.favorId) }),
    201
  );
}
