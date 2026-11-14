import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** Host removes a player before betting starts. */
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/participants/[userId]">) {
  const { seriesId, userId } = await ctx.params;
  return seriesAction(req, async ({ rpc }) => ({ removed: await rpc("remove_series_participant", { p_series_id: seriesId, p_user_id: userId }) }));
}
