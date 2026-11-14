import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** Leave a lobby (not the host). */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/leave">) {
  const { seriesId } = await ctx.params;
  return seriesAction(req, ({ rpc }) => rpc("leave_bet_series", { p_series_id: seriesId }));
}
