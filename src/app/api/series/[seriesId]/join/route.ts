import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** Join a lobby by id. Joining again is harmless. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/join">) {
  const { seriesId } = await ctx.params;
  return seriesAction(req, ({ rpc }) => rpc("join_bet_series", { p_series_id: seriesId }));
}
