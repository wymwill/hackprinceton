import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** Take back your own favor (lobby only). */
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/favors/[favorId]">) {
  const { favorId } = await ctx.params;
  return seriesAction(req, ({ rpc }) => rpc("withdraw_series_favor", { p_favor_id: favorId }));
}
