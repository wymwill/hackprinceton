import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** Host ends the series once nothing is open (it also ends itself when the last planned bet settles). */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/complete">) {
  const { seriesId } = await ctx.params;
  return seriesAction(req, ({ rpc }) => rpc("complete_bet_series", { p_series_id: seriesId }));
}
